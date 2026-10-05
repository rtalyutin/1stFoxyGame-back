import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createGameStore} from '../db/game-store.mjs';
import {canonicalJson,readContent,readMetadataSchema} from '../db/content.mjs';
import {defaultR1Content} from '../core/content-r1.ts';
import {createGame as gameR1,createSnapshot as snapR1} from '../core/game-core.ts';
import {defaultR2Content,parseContentProjection,contentRows} from '../core/content-r2.ts';
import {createGame,createSnapshot,validateSnapshot} from '../core/game-core-r2.ts';
const hash=v=>createHash('sha256').update(canonicalJson(v)).digest('hex');
const pins1={clientReleaseId:'r1-db-fixture',coreVersion:'r1-core-1',contentVersion:'r1-content-1',metadataSchemaVersion:'r1-meta-1',snapshotSchemaVersion:2};
const pins2={clientReleaseId:'r2-db-fixture',coreVersion:'r2-core-1',contentVersion:'r2-content-1',metadataSchemaVersion:'r2-meta-1',snapshotSchemaVersion:3};
let db,store,temp,preserved;let tail=Promise.resolve();
async function lease(){const before=tail;let release;tail=new Promise(resolve=>release=resolve);await before;return release;}
const raw=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1)??{rows:[]};
const pool={query:async(...args)=>{const release=await lease();try{return await raw(...args);}finally{release();}},connect:async()=>{const release=await lease();return {query:raw,release};}};
const query=(...args)=>pool.query(...args);
const guest=async()=> (await store.createGuest(hash(randomUUID()),new Date(Date.now()+600000).toISOString())).profileId;
const newRun=(owner,pins=pins2,extra={})=>store.createRun(owner,{clientRunId:randomUUID(),clientReleaseId:pins.clientReleaseId,coreVersion:pins.coreVersion,contentVersion:pins.contentVersion,seed:17,...extra},pins);
const snap=(seed=17)=>createSnapshot(createGame(defaultR2Content,seed));
const env=(revision=1)=>({requestId:randomUUID(),expectedRevision:revision,snapshotSchemaVersion:3});
const result=(overrides={})=>({outcome:'defeat',wave:1,lastCompletedWave:0,simTick:40,gold:150,throneHp:0,seed:17,versions:{core:pins2.coreVersion,content:pins2.contentVersion,metadataSchema:pins2.metadataSchemaVersion},statistics:{kills:2,builds:1,upgrades:0,goldEarned:24},...overrides});
const code=expected=>e=>e.code===expected;
async function immutableR1(){return {content:await readContent(pool,'r1-content-1'),metadata:await readMetadataSchema(pool,'r1-meta-1'),r0:await readContent(pool,'r0-content-1'),migrations:(await query("SELECT id,checksum FROM last_throne.schema_migrations WHERE id<'005' ORDER BY id")).rows,functions:(await query("SELECT p.proname,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='last_throne' AND p.proname LIKE 'r1_%' ORDER BY p.proname")).rows};}
before(async()=>{
 db=new PGlite();temp=await mkdtemp(join(tmpdir(),'last-throne-r2-db-'));store=createGameStore(pool);
 const files=(await readdir(new URL('../db/migrations/',import.meta.url))).sort();
 for(const name of files.filter(n=>/^00[1-4]_/.test(n)))await writeFile(join(temp,name),await readFile(new URL(`../db/migrations/${name}`,import.meta.url)));
 await migrate(pool,{directory:temp});
 const owner=await guest(),run=await newRun(owner,pins1),snapshot=snapR1(gameR1(defaultR1Content,17));
 const envelope={requestId:randomUUID(),expectedRevision:1,snapshotSchemaVersion:2};
 const saved=await store.commitCheckpoint(owner,run.id,envelope,hash('old-checkpoint'),snapshot);
 preserved={...(await immutableR1()),owner,runId:run.id,snapshot,checkpoint:await store.getCheckpoint(owner,run.id),profile:await store.getProfile(owner),run:await store.getRun(owner,run.id),saved,envelope};
 for(const name of files.filter(n=>/^00[5-6]_/.test(n)))await writeFile(join(temp,name),await readFile(new URL(`../db/migrations/${name}`,import.meta.url)));
 assert.deepEqual(await migrate(pool,{directory:temp}),['005_r2_persistence.sql','006_r2_catalog.sql']);
});
after(async()=>{await db?.close();await rm(temp,{recursive:true,force:true});});

test('R2 additive migration preserves published R1 metadata, catalog, checksums, SQL functions and existing checkpoint',async()=>{
 const now=await immutableR1();for(const key of ['content','metadata','r0','migrations','functions'])assert.deepEqual(now[key],preserved[key],key);
 assert.deepEqual(await store.getRun(preserved.owner,preserved.runId),preserved.run);
 assert.deepEqual(await store.getCheckpoint(preserved.owner,preserved.runId),preserved.checkpoint);
 assert.deepEqual(await store.getProfile(preserved.owner),preserved.profile);
 assert.deepEqual(await store.commitCheckpoint(preserved.owner,preserved.runId,preserved.envelope,hash('old-checkpoint'),()=>{throw Error('old replay must not validate');}),preserved.saved);
 assert.deepEqual(await migrate(pool,{directory:temp}),[]);
 const oldAgain=await store.commitCheckpoint(preserved.owner,preserved.runId,{...preserved.envelope,requestId:randomUUID(),expectedRevision:2},hash('continued-r1'),preserved.snapshot);
 assert.equal(oldAgain.revision,3);assert.equal((await store.getCheckpoint(preserved.owner,preserved.runId)).snapshotSchemaVersion,2);
});

test('R2 publishes actual scalar EAV catalog, revised references and reproducible metadata/content hashes',async()=>{
 const projection=await readContent(pool,'r2-content-1'),compiled=parseContentProjection(projection);
 const order=rows=>rows.sort((a,b)=>`${a.type}:${a.code}`.localeCompare(`${b.type}:${b.code}`));
 assert.deepEqual(order(contentRows(compiled)),order(contentRows(defaultR2Content)));
 assert.equal(compiled.heroes.length,5);assert.equal(compiled.buildings.length,3);assert.equal(compiled.waves.length,10);
 const metadata=await readMetadataSchema(pool,'r2-meta-1');
 const persisted=(await query("SELECT projection_hash FROM last_throne.content_releases WHERE id='r2-content-1'")).rows[0];assert.equal(persisted.projection_hash,hash(projection));
 assert.equal((await query("SELECT manifest_hash FROM last_throne.metadata_schema_versions WHERE version='r2-meta-1'")).rows[0].manifest_hash,hash(metadata));
 const hero=metadata.types.find(t=>t.code==='saved_hero');assert.equal(hero.schemaRevision,2);assert.equal(hero.parameters.find(p=>p.code==='stolen_spell').required,false);
 assert.equal(hero.parameters.find(p=>p.code==='definition').targetTypeId,metadata.types.find(t=>t.code==='hero_definition').id);
 assert.equal(metadata.types.find(t=>t.code==='player_profile').id,preserved.metadata.types.find(t=>t.code==='player_profile').id);
 assert.ok(projection.entities.every(e=>e.schemaRevision===2));
});

test('R2 owned runs use independent immutable pins but list across both releases and shared creation keys',async()=>{
 const owner=preserved.owner,payload={clientRunId:randomUUID(),clientReleaseId:pins2.clientReleaseId,coreVersion:pins2.coreVersion,contentVersion:pins2.contentVersion,seed:17};
 const run=await store.createRun(owner,payload,pins2);assert.deepEqual(await store.createRun(owner,payload,pins2),run);
 assert.equal(run.snapshotSchemaVersion,3);assert.equal(run.metadataSchemaVersion,'r2-meta-1');
 const listed=(await store.listRuns(owner)).runs;assert.ok(listed.some(r=>r.id===preserved.runId&&r.snapshotSchemaVersion===2));assert.ok(listed.some(r=>r.id===run.id&&r.snapshotSchemaVersion===3));
 await assert.rejects(()=>store.createRun(owner,{...payload,coreVersion:pins1.coreVersion,contentVersion:pins1.contentVersion,clientReleaseId:pins1.clientReleaseId},pins1),code('IDEMPOTENCY_CONFLICT'));
 await assert.rejects(()=>newRun(owner,pins2,{contentVersion:pins1.contentVersion}),code('VERSION_MISMATCH'));
 const other=await guest();for(const method of ['getRun','getCheckpoint'])await assert.rejects(()=>store[method](other,run.id),code('RUN_NOT_FOUND'));
 assert.deepEqual((await store.listRuns(other)).runs,[]);
});

test('typed generation round trips all five heroes, nullable slot, both cooldowns, Sniper priority and every building kind',async()=>{
 const owner=await guest(),run=await newRun(owner),snapshot=snap();
 const rubick=snapshot.heroes.find(h=>h.kind==='rubick');rubick.stolenSpell='temporary_shield';rubick.stealCooldown=21;rubick.abilityCooldown=30;
 snapshot.heroes.find(h=>h.kind==='sniper').priority='commander';
 snapshot.statistics={kills:7,builds:3,upgrades:1,goldEarned:130};snapshot.commandEpoch=2;snapshot.simTick=10;snapshot.rngState=4294967295;
 snapshot.buildings=defaultR2Content.buildings.map((b,i)=>({id:`building-${i}`,kind:b.kind,padId:defaultR2Content.map.places.filter(p=>p.kind==='building_pad')[i].id,level:1,hp:b.hp,attackCooldown:0,spentGold:b.cost}));
 assert.equal(validateSnapshot(snapshot,defaultR2Content).valid,true);
 const save=await store.commitCheckpoint(owner,run.id,env(),hash(snapshot),snapshot),checkpoint=await store.getCheckpoint(owner,run.id);
 assert.deepEqual(checkpoint.snapshot,snapshot);assert.equal(checkpoint.snapshotSchemaVersion,3);assert.equal(checkpoint.revision,2);assert.equal(checkpoint.runRevision,2);
 const stolen=(await query("SELECT v.text_value FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id JOIN last_throne.entities e ON e.id=v.entity_id WHERE e.checkpoint_id=$1 AND p.code='stolen_spell'",[save.checkpointId])).rows;
 assert.deepEqual(stolen,[{text_value:'temporary_shield'}]); // Null slots have no scalar value row.
 assert.equal((await query("SELECT count(*)::int n FROM last_throne.entities WHERE checkpoint_id=$1 AND status='frozen'",[save.checkpointId])).rows[0].n,9);
 await assert.rejects(()=>query('DELETE FROM last_throne.entity_parameter_values WHERE entity_id=$1',[save.checkpointId]),/ENTITY_IMMUTABLE/);
 const next=snap();next.heroes.find(h=>h.kind==='rubick').stolenSpell='area_heal';await store.commitCheckpoint(owner,run.id,env(2),hash(next),next);
 assert.equal((await store.getCheckpoint(owner,run.id)).snapshot.heroes.find(h=>h.kind==='rubick').stolenSpell,'area_heal');
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE checkpoint_id=$1',[save.checkpointId])).rows[0].n,9);
});

test('invalid R2 slot, priority, default fields and partial children roll back the whole generation',async()=>{
 const owner=await guest(),run=await newRun(owner);const first=await store.commitCheckpoint(owner,run.id,env(),hash('valid-defaults'),snap());
 const valid=await store.getCheckpoint(owner,run.id);assert.equal(valid.snapshot.heroes.find(h=>h.kind==='rubick').stolenSpell,null);
 const before=(await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[run.id])).rows[0].n;
 for(const modify of [
  s=>s.heroes.find(h=>h.kind==='rubick').stolenSpell='unknown_spell',
  s=>s.heroes.find(h=>h.kind==='rubick').stealCooldown=-1,
  s=>s.heroes.find(h=>h.kind==='sniper').priority='weakest',
  s=>s.heroes.find(h=>h.kind==='pudge').priority='strongest',
  s=>s.heroes.find(h=>h.kind==='shaman').stolenSpell='area_strike',
  s=>delete s.heroes.find(h=>h.kind==='undying').stolenSpell,
  s=>s.heroes[1].anchorId=s.heroes[0].anchorId,
  s=>s.buildings.push({id:'partial',kind:'slow_totem',padId:'pad-n1',level:1,hp:220,attackCooldown:0}),
 ]){
  const invalid=snap();modify(invalid);const envelope=env(2);await assert.rejects(()=>store.commitCheckpoint(owner,run.id,envelope,hash(invalid),invalid),e=>e.statusCode===422);
  assert.equal((await store.getRun(owner,run.id)).revision,2);assert.equal((await store.getCheckpoint(owner,run.id)).checkpointId,first.checkpointId);
  assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[run.id])).rows[0].n,before);
  assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1 AND request_id=$2',[run.id,envelope.requestId])).rows[0].n,0);
 }
});

test('locked replay precedes lazy validation, revision and finish; request IDs share checkpoint/finish scope',async()=>{
 const owner=await guest(),run=await newRun(owner),envelope=env();let calls=0;
 const save=()=>store.commitCheckpoint(owner,run.id,envelope,hash('same-request'),async(locked,client)=>{calls++;assert.equal(locked.snapshotSchemaVersion,3);assert.equal((await client.query('SELECT 1 n')).rows[0].n,1);return snap();});
 const first=await save();assert.deepEqual(await save(),first);assert.equal(calls,1);
 await assert.rejects(()=>store.commitCheckpoint(owner,run.id,envelope,hash('changed-invalid'),()=>{throw Error('must not validate');}),code('IDEMPOTENCY_CONFLICT'));
 await assert.rejects(()=>store.commitCheckpoint(owner,run.id,env(),hash('stale'),snap()),code('REVISION_CONFLICT'));
 await assert.rejects(()=>store.finishRun(owner,run.id,{requestId:envelope.requestId,expectedRevision:2,result:result()},hash('shared-finish-key')),code('IDEMPOTENCY_CONFLICT'));
 const terminal={requestId:randomUUID(),expectedRevision:2,result:result()};const finished=await store.finishRun(owner,run.id,terminal,hash('terminal'));
 assert.deepEqual(await save(),first);assert.equal(calls,1);assert.deepEqual(await store.finishRun(owner,run.id,terminal,hash('terminal')),finished);
 const cp=await store.getCheckpoint(owner,run.id);assert.equal(cp.revision,2);assert.equal(cp.runRevision,3);
 await assert.rejects(()=>store.commitCheckpoint(owner,run.id,env(3),hash('new-terminal-save'),()=>{throw Error('must not validate');}),code('RUN_FINISHED'));
});

test('serialized competing revisions and duplicate requests commit one checkpoint operation',async()=>{
 const owner=await guest(),run=await newRun(owner);const replies=await Promise.allSettled([store.commitCheckpoint(owner,run.id,env(),hash('tab-one'),snap()),store.commitCheckpoint(owner,run.id,env(),hash('tab-two'),snap())]);
 assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
 const run2=await newRun(owner),envelope=env();const twins=await Promise.all([store.commitCheckpoint(owner,run2.id,envelope,hash('twins'),snap()),store.commitCheckpoint(owner,run2.id,envelope,hash('twins'),snap())]);
 assert.deepEqual(twins[0],twins[1]);assert.equal((await store.getRun(owner,run2.id)).revision,2);
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1',[run2.id])).rows[0].n,1);
});

test('finish stores typed client provenance and content-relative ten-wave result while preserving R1 finish rules',async()=>{
 const owner=await guest(),run=await newRun(owner);const envelope={requestId:randomUUID(),expectedRevision:1,result:result()};
 for(const invalid of [result({outcome:'victory',lastCompletedWave:5,wave:5,throneHp:10}),result({outcome:'victory',lastCompletedWave:10,wave:10,throneHp:defaultR2Content.throneHp+1}),result({lastCompletedWave:9,wave:9}),result({versions:{core:'r1-core-1',content:'r1-content-1',metadataSchema:'r1-meta-1'}})]){
  await assert.rejects(()=>store.finishRun(owner,run.id,{...envelope,result:invalid},hash(invalid)),code('RESULT_INVALID'));assert.equal((await store.getRun(owner,run.id)).revision,1);
 }
 envelope.result=result({outcome:'victory',lastCompletedWave:10,wave:10,throneHp:defaultR2Content.throneHp});const saved=await store.finishRun(owner,run.id,envelope,hash(envelope));
 assert.deepEqual((await store.getRun(owner,run.id)).result,envelope.result);
 assert.deepEqual((await query("SELECT v.boolean_value FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 AND p.code='client_reported'",[saved.resultId])).rows,[{boolean_value:true}]);
 assert.equal((await query("SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1 AND entity_type_id=last_throne.r2_type('run_result')",[run.id])).rows[0].n,1);
 const old=await newRun(owner,pins1);const oldResult=result({outcome:'victory',lastCompletedWave:5,wave:5,throneHp:240,versions:{core:pins1.coreVersion,content:pins1.contentVersion,metadataSchema:pins1.metadataSchemaVersion}});
 const oldFinish=await store.finishRun(owner,old.id,{requestId:randomUUID(),expectedRevision:1,result:oldResult},hash(oldResult));assert.equal(oldFinish.status,'victory');
});

test('owner publication closure rejects missing spells and typed metadata rejects unknown handler IDs',async()=>{
 await query('BEGIN');
 try{
  await query("INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) SELECT 'r2-incomplete','r2-incomplete',schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash FROM last_throne.content_releases WHERE id='r2-content-1'");
  await assert.rejects(()=>query("SELECT last_throne.publish_content_release('r2-incomplete')"),/CONTENT_INCOMPATIBLE/);
 }finally{await query('ROLLBACK');}
 await query('BEGIN');
 try{
  await query("INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) SELECT 'r2-unknown','r2-unknown',schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash FROM last_throne.content_releases WHERE id='r2-content-1'");
  const id=randomUUID();await query("INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,last_throne.r2_type('spell_definition'),'r2-meta-1','r2-unknown','r2-unknown')",[id]);
  await assert.rejects(()=>query("SELECT last_throne.r2_set($1,'behavior_id','\"unknown_handler\"'::jsonb)",[id]),/VALUE_CONSTRAINT_FAILED/);
 }finally{await query('ROLLBACK');}
 assert.deepEqual((await immutableR1()).metadata,preserved.metadata);
});

test('dedicated R2 API grants allow bounded mixed-version operations and deny direct writes, helpers and technical history',async()=>{
 await query('CREATE ROLE r2_storage_api');await query('GRANT USAGE ON SCHEMA last_throne TO r2_storage_api');await query('GRANT SELECT ON ALL TABLES IN SCHEMA last_throne TO r2_storage_api');await query('ALTER DEFAULT PRIVILEGES IN SCHEMA last_throne GRANT SELECT ON TABLES TO r2_storage_api');await query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA last_throne TO r2_storage_api');
 await query((await readFile(new URL('../db/r2-runtime-grants.sql',import.meta.url),'utf8')).replaceAll(':"api_role"','r2_storage_api'));
 await query('CREATE TABLE last_throne.r2_future_private(id integer)');await query("CREATE FUNCTION last_throne.r2_future_helper() RETURNS integer LANGUAGE sql AS 'SELECT 3'");
 await query('SET ROLE r2_storage_api');
 try{
  const owner=await guest(),r2=await newRun(owner),r1=await newRun(owner,pins1);const saved=await store.commitCheckpoint(owner,r2.id,env(),hash('role-r2'),snap());assert.equal(saved.revision,2);
  await store.commitCheckpoint(owner,r1.id,{...env(),snapshotSchemaVersion:2},hash('role-r1'),snapR1(gameR1(defaultR1Content,17)));assert.equal((await store.listRuns(owner)).runs.length,2);assert.equal((await store.getCheckpoint(owner,r2.id)).snapshotSchemaVersion,3);
  await assert.rejects(()=>store.getRun(preserved.owner,r2.id),code('RUN_NOT_FOUND'));
  for(const table of ['guest_sessions','run_client_keys','save_operations','schema_migrations','r2_future_private'])await assert.rejects(()=>query(`SELECT * FROM last_throne.${table}`),/permission denied/);
  await assert.rejects(()=>query('SELECT last_throne.r2_future_helper()'),/permission denied/);
  await assert.rejects(()=>query("SELECT last_throne.r2_set($1,'status','\"victory\"'::jsonb)",[r2.id]),/permission denied/);
  await assert.rejects(()=>query('DELETE FROM last_throne.entities'),/permission denied/);
  await assert.rejects(()=>query("SELECT last_throne.publish_content_release('r2-content-1')"),/permission denied/);
  assert.equal((await readContent(pool,'r2-content-1')).contentVersion,'r2-content-1');
 }finally{await query('RESET ROLE');}
});
