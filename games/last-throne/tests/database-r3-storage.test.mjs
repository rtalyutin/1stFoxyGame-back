import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { migrate } from '../scripts/migrate.mjs';
import { createGameStore } from '../db/game-store-r3.mjs';
import { canonicalJson, readContent, readMetadataSchema } from '../db/content.mjs';
import { defaultR1Content } from '../core/content-r1.ts';
import { createGame as gameR1, createSnapshot as snapR1 } from '../core/game-core.ts';
import { defaultR2Content } from '../core/content-r2.ts';
import { createGame as gameR2, createSnapshot as snapR2 } from '../core/game-core-r2.ts';
import { defaultR3Content, parseContentProjection, contentRows } from '../core/content-r3.ts';
import { createGame, createSnapshot, submitCommand, validateSnapshot } from '../core/game-core-r3.ts';

const hash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const pins = family => ({ clientReleaseId:`${family}-db-fixture`, coreVersion:`${family}-core-1`, contentVersion:`${family}-content-1`, metadataSchemaVersion:`${family}-meta-1`, snapshotSchemaVersion: Number(family[1])+1 });
const pins1=pins('r1'), pins2=pins('r2'), pins3=pins('r3');
let db, pool, store, temp, retained, preserved;
let tail=Promise.resolve();
async function lease() { const previous=tail; let release; tail=new Promise(resolve=>release=resolve); await previous; return release; }
const raw = async (sql,params=[]) => params.length ? db.query(sql,params) : (await db.exec(sql)).at(-1) ?? {rows:[]};
const query=(...args)=>pool.query(...args);
const guest = async (active=store) => (await active.createGuest(hash(randomUUID()),new Date(Date.now()+600000).toISOString())).profileId;
const newRun=(owner,version=pins3,active=store,extra={})=>active.createRun(owner,{clientRunId:randomUUID(),clientReleaseId:version.clientReleaseId,coreVersion:version.coreVersion,contentVersion:version.contentVersion,seed:17,...extra},version);
const envelope=(revision=1,format=4)=>({requestId:randomUUID(),expectedRevision:revision,snapshotSchemaVersion:format});
const code=expected=>error=>error.code===expected;
const fresh=()=>createSnapshot(createGame(defaultR3Content,17));
const result=(overrides={})=>({outcome:'defeat',wave:1,lastCompletedWave:0,simTick:40,gold:150,throneHp:0,seed:17,versions:{core:'r3-core-1',content:'r3-content-1',metadataSchema:'r3-meta-1'},statistics:{kills:2,builds:1,upgrades:0,goldEarned:24},...overrides});
function nestedSnapshot(pending=false) {
  const game=createGame(defaultR3Content,17);let sequence=0;
  for(const [actorId,itemId,slot] of [['shaman','split_charm',0],['shaman','swift_charm',1],['pudge','sight_gem',0],['pudge','healing_lantern',1]]) {
    assert.equal(submitCommand(game,{commandId:`item-${++sequence}`,tick:game.simTick,sequence,type:'equip_item',actorId,payload:{itemId,slot}}).status,'accepted');
  }
  if(!pending) assert.equal(submitCommand(game,{commandId:'shop-trip',tick:game.simTick,sequence:++sequence,type:'send_expedition',actorId:'rubick',payload:{kind:'shop'}}).status,'accepted');
  const snapshot=createSnapshot(game);
  // Explicit schema fixtures: a token/pending choice resulting from an earlier expedition.
  snapshot.heroes.find(h=>h.kind==='sniper').aegisToken=true;
  if(pending) snapshot.pendingRewards=[{id:'reward-choice-1',heroId:'rubick',kind:'shop',options:[...defaultR3Content.expeditions.find(e=>e.kind==='shop').itemOptions]}];
  assert.equal(validateSnapshot(snapshot,defaultR3Content).valid,true);
  return snapshot;
}
async function immutableLegacy() {
  const content={},metadata={};for(const family of ['r0','r1','r2']) {content[family]=await readContent(pool,`${family}-content-1`);metadata[family]=await readMetadataSchema(pool,`${family}-meta-1`);}
  return {content,metadata,migrations:(await query("SELECT id,checksum FROM last_throne.schema_migrations WHERE id<'007' ORDER BY id")).rows,
    functions:(await query("SELECT p.proname,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='last_throne' AND (p.proname LIKE 'r1_%' OR p.proname LIKE 'r2_%') ORDER BY p.proname")).rows};
}
before(async()=>{
  if(process.env.TD_TEST_DATABASE_URL) {
    pool=new pg.Pool({connectionString:process.env.TD_TEST_DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:15000});
    const guard=(await query("SELECT current_database() name,to_regclass('last_throne.entities') existing")).rows[0];
    assert.equal(guard.name,'td_db','Real PG tests require a fresh dedicated td_db; no first-game database is authorized');
    assert.equal(guard.existing,null,'Real PG tests refuse an existing Last Throne schema');
  } else {
    db=new PGlite();pool={query:async(...args)=>{const release=await lease();try{return await raw(...args);}finally{release();}},connect:async()=>{const release=await lease();return {query:raw,release};}};
  }
  temp=await mkdtemp(join(tmpdir(),'last-throne-r3-db-'));store=createGameStore(pool);
  const files=(await readdir(new URL('../db/migrations/',import.meta.url))).sort();
  for(const name of files.filter(n=>/^00[1-6]_/.test(n))) await writeFile(join(temp,name),await readFile(new URL(`../db/migrations/${name}`,import.meta.url)));
  await migrate(pool,{directory:temp});
  const owner=await guest();retained={owner,runs:[]};
  for(const [version,snapshot] of [[pins1,snapR1(gameR1(defaultR1Content,17))],[pins2,snapR2(gameR2(defaultR2Content,17))]]) {
    const run=await newRun(owner,version),body=envelope(1,version.snapshotSchemaVersion),digest=hash(`retained-${version.coreVersion}`);
    const response=await store.commitCheckpoint(owner,run.id,body,digest,snapshot);
    retained.runs.push({version,snapshot,body,digest,response,run:await store.getRun(owner,run.id),checkpoint:await store.getCheckpoint(owner,run.id)});
  }
  retained.profile=await store.getProfile(owner);preserved=await immutableLegacy();
  for(const name of files.filter(n=>/^00[7-8]_/.test(n))) await writeFile(join(temp,name),await readFile(new URL(`../db/migrations/${name}`,import.meta.url)));
  assert.deepEqual(await migrate(pool,{directory:temp}),['007_r3_persistence.sql','008_r3_catalog.sql']);
});
after(async()=>{await db?.close();await pool?.end?.();if(temp)await rm(temp,{recursive:true,force:true});});

test('R3 additive migrations preserve all published R0/R1/R2 projections, functions, profile and saved generations',async()=>{
  assert.deepEqual(await immutableLegacy(),preserved);
  assert.deepEqual(await store.getProfile(retained.owner),retained.profile);
  for(const old of retained.runs) {
    assert.deepEqual(await store.getRun(retained.owner,old.run.id),old.run);
    assert.deepEqual(await store.getCheckpoint(retained.owner,old.run.id),old.checkpoint);
    assert.deepEqual(await store.commitCheckpoint(retained.owner,old.run.id,old.body,old.digest,()=>{throw Error('retained exact replay must not validate');}),old.response);
    const continued=await store.commitCheckpoint(retained.owner,old.run.id,envelope(2,old.version.snapshotSchemaVersion),hash(`continue-${old.run.id}`),old.snapshot);
    assert.equal(continued.revision,3);assert.equal((await store.getCheckpoint(retained.owner,old.run.id)).snapshotSchemaVersion,old.version.snapshotSchemaVersion);
  }
  assert.deepEqual(await migrate(pool,{directory:temp}),[]);
  assert.equal((await query('SELECT count(*)::int n FROM last_throne.schema_migrations')).rows[0].n,8);
});

test('R3 catalog comes from 151 scalar typed entities with exact metadata and projection hashes',async()=>{
  const projection=await readContent(pool,'r3-content-1'),compiled=parseContentProjection(projection);
  const ordered=rows=>rows.sort((a,b)=>`${a.type}:${a.code}`.localeCompare(`${b.type}:${b.code}`));
  assert.deepEqual(ordered(contentRows(compiled)),ordered(contentRows(defaultR3Content)));
  assert.equal(projection.entities.length,151);assert.equal(compiled.waves.length,15);assert.equal(compiled.items.length,4);assert.equal(compiled.expeditions.length,3);assert.ok(compiled.map.sidePath.length>0);
  assert.equal(hash(projection),'6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5');
  const metadata=await readMetadataSchema(pool,'r3-meta-1');
  assert.equal(hash(metadata),'640fc515352132bff283d2dd3b5737cbfcf04cc3de1f4664b49b82039c9d935d');
  const parameter=(type,code)=>metadata.types.find(t=>t.code===type).parameters.find(p=>p.code===code);
  assert.equal(parameter('saved_hero','item_slots').multiple,true);assert.equal(parameter('saved_hero','item_slots').referencePolicy,'same_checkpoint');
  assert.equal(parameter('hero_item_slot','definition').referencePolicy,'pinned_release');assert.equal(parameter('pending_reward','options').multiple,true);
  assert.equal(metadata.types.find(t=>t.code==='player_profile').id,preserved.metadata.r1.types.find(t=>t.code==='player_profile').id);
  assert.ok(projection.entities.every(e=>e.schemaRevision===3));
});

test('R3 rejects a changed published EAV projection against the pinned SHA before returning data',async()=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');await client.query('ALTER TABLE last_throne.entity_parameter_values DISABLE TRIGGER USER');
    await client.query("UPDATE last_throne.entity_parameter_values v SET integer_value=integer_value+1 FROM last_throne.entities e,last_throne.entity_parameters p WHERE v.entity_id=e.id AND v.parameter_id=p.id AND e.release_id='r3-content-1' AND p.code='initial_gold'");
    await assert.rejects(()=>readContent(client,'r3-content-1'),error=>error.code==='CONTENT_VERSION_UNAVAILABLE'&&error.statusCode===503);
  } finally {await client.query('ROLLBACK');client.release();}
  assert.equal(hash(await readContent(pool,'r3-content-1')),'6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5');
});

test('owned history mixes exact R1/R2/R3 pins, creation keys are shared and no owner ID is trusted',async()=>{
  const payload={clientRunId:randomUUID(),clientReleaseId:pins3.clientReleaseId,coreVersion:pins3.coreVersion,contentVersion:pins3.contentVersion,seed:17};
  const run=await store.createRun(retained.owner,payload,pins3);assert.deepEqual(await store.createRun(retained.owner,payload,pins3),run);
  const history=(await store.listRuns(retained.owner)).runs;assert.deepEqual(new Set(history.map(r=>r.snapshotSchemaVersion)),new Set([2,3,4]));
  await assert.rejects(()=>store.createRun(retained.owner,{...payload,clientReleaseId:pins2.clientReleaseId,coreVersion:pins2.coreVersion,contentVersion:pins2.contentVersion},pins2),code('IDEMPOTENCY_CONFLICT'));
  const other=await guest();for(const method of ['getRun','getCheckpoint'])await assert.rejects(()=>store[method](other,run.id),code('RUN_NOT_FOUND'));
  await assert.rejects(()=>store.commitCheckpoint(other,run.id,envelope(),hash('foreign'),()=>{throw Error('foreign must not validate');}),code('RUN_NOT_FOUND'));
  assert.deepEqual((await store.listRuns(other)).runs,[]);
});

test('R3 exact round trip stores ordered nullable item slots, typed expedition references and per-hero Aegis',async()=>{
  const owner=await guest(),run=await newRun(owner),snapshot=nestedSnapshot();
  const saved=await store.commitCheckpoint(owner,run.id,envelope(),hash(snapshot),snapshot),loaded=await store.getCheckpoint(owner,run.id);
  assert.deepEqual(loaded.snapshot,snapshot);assert.equal(loaded.snapshotSchemaVersion,4);assert.equal(loaded.revision,2);assert.equal(loaded.runRevision,2);
  const entities=(await query('SELECT t.code,count(*)::int n FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.checkpoint_id=$1 GROUP BY t.code',[saved.checkpointId])).rows;
  assert.equal(entities.find(e=>e.code==='hero_item_slot').n,10);assert.equal(entities.find(e=>e.code==='saved_expedition').n,1);
  const slots=(await query("SELECT v.reference_value,e.pinned_release_id FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id JOIN last_throne.entities e ON e.id=v.entity_id WHERE e.checkpoint_id=$1 AND p.code='definition' AND e.entity_type_id=last_throne.r3_type('hero_item_slot')",[saved.checkpointId])).rows;
  assert.equal(slots.length,4);assert.ok(slots.every(s=>s.reference_value&&s.pinned_release_id==='r3-content-1'));
  await assert.rejects(()=>query('DELETE FROM last_throne.entity_parameter_values WHERE entity_id=$1',[saved.checkpointId]),/ENTITY_IMMUTABLE/);
  const next=nestedSnapshot(true);const second=await store.commitCheckpoint(owner,run.id,envelope(2),hash(next),next);
  assert.deepEqual((await store.getCheckpoint(owner,run.id)).snapshot,next);
  assert.equal((await query("SELECT count(*)::int n FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.checkpoint_id=$1 AND t.code='pending_reward'",[second.checkpointId])).rows[0].n,1);
  assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE checkpoint_id=$1 AND status<>\'frozen\'',[saved.checkpointId])).rows[0].n,0);
});

test('invalid late child values, item handlers, options and expedition timers roll back every generation and operation',async()=>{
  const owner=await guest(),run=await newRun(owner),accepted=await store.commitCheckpoint(owner,run.id,envelope(),hash('base'),fresh());
  const before=(await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[run.id])).rows[0].n;
  for(const change of [
    s=>s.heroes.find(h=>h.kind==='pudge').items=['unknown_item',null],
    s=>s.heroes.find(h=>h.kind==='pudge').items=['split_charm',null],
    s=>s.heroes.find(h=>h.kind==='shaman').items=['swift_charm','swift_charm'],
    s=>s.heroes[0].items=[null],
    s=>s.heroes[0].aegisToken='yes',
    s=>s.heroes.find(h=>h.kind==='rubick').expedition.totalTicks=599,
    s=>s.heroes.find(h=>h.kind==='rubick').expedition.remainingTicks=601,
    s=>s.heroes.find(h=>h.kind==='undying').expedition={kind:'camp',remainingTicks:300,totalTicks:300,rewardId:'second'},
    s=>s.pendingRewards=[{id:'pending-during-trip',heroId:'rubick',kind:'shop',options:[...defaultR3Content.expeditions.find(e=>e.kind==='shop').itemOptions]}],
    s=>{s.heroes.find(h=>h.kind==='rubick').expedition=null;s.pendingRewards=[{id:'choice',heroId:'foreign',kind:'shop',options:['split_charm']}];},
    s=>{s.heroes.find(h=>h.kind==='rubick').expedition=null;s.pendingRewards=[{id:'choice',heroId:'rubick',kind:'shop',options:['split_charm','swift_charm']}];},
  ]) {
    const invalid=nestedSnapshot();change(invalid);const body=envelope(2);
    await assert.rejects(()=>store.commitCheckpoint(owner,run.id,body,hash(invalid),invalid),error=>error.statusCode===422);
    assert.equal((await store.getRun(owner,run.id)).revision,2);assert.equal((await store.getCheckpoint(owner,run.id)).checkpointId,accepted.checkpointId);
    assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[run.id])).rows[0].n,before);
    assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1 AND request_id=$2',[run.id,body.requestId])).rows[0].n,0);
  }
});

test('same-client locked repeat precedes validator, revision and terminal state; competing writes commit only once',async()=>{
  const owner=await guest(),run=await newRun(owner),body=envelope();let calls=0;
  const save=()=>store.commitCheckpoint(owner,run.id,body,hash('exact-repeat'),async(locked,client)=>{calls++;assert.equal(locked.snapshotSchemaVersion,4);assert.equal((await client.query('SELECT 1 n')).rows[0].n,1);return nestedSnapshot(true);});
  const first=await save();assert.deepEqual(await save(),first);assert.equal(calls,1);
  await assert.rejects(()=>store.commitCheckpoint(owner,run.id,body,hash('different-invalid'),()=>{throw Error('must not validate');}),code('IDEMPOTENCY_CONFLICT'));
  const terminal={requestId:randomUUID(),expectedRevision:2,result:result()};const finished=await store.finishRun(owner,run.id,terminal,hash('terminal'));
  assert.deepEqual(await save(),first);assert.equal(calls,1);assert.deepEqual(await store.finishRun(owner,run.id,terminal,hash('terminal')),finished);
  const loaded=await store.getCheckpoint(owner,run.id);assert.equal(loaded.revision,2);assert.equal(loaded.runRevision,3);
  await assert.rejects(()=>store.commitCheckpoint(owner,run.id,envelope(3),hash('after-terminal'),()=>{throw Error('must not validate');}),code('RUN_FINISHED'));
  const competing=await newRun(owner);const replies=await Promise.allSettled([store.commitCheckpoint(owner,competing.id,envelope(),hash('tab-a'),fresh()),store.commitCheckpoint(owner,competing.id,envelope(),hash('tab-b'),fresh())]);
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
  const duplicate=await newRun(owner),duplicateBody=envelope();const twins=await Promise.all([1,2].map(()=>store.commitCheckpoint(owner,duplicate.id,duplicateBody,hash('twins'),fresh())));
  assert.deepEqual(twins[0],twins[1]);assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1',[duplicate.id])).rows[0].n,1);
});

test('R3 terminal result is typed client-reported data requiring the pinned fifteenth wave',async()=>{
  const owner=await guest(),run=await newRun(owner);
  for(const invalid of [result({outcome:'victory',lastCompletedWave:10,wave:10,throneHp:50}),result({wave:16}),result({seed:18}),result({versions:{...result().versions,core:'r2-core-1'}}),result({statistics:{...result().statistics,kills:-1}})]) {
    await assert.rejects(()=>store.finishRun(owner,run.id,{requestId:randomUUID(),expectedRevision:1,result:invalid},hash(invalid)),error=>error.statusCode===422);
    assert.equal((await store.getRun(owner,run.id)).revision,1);
  }
  const victory=result({outcome:'victory',wave:15,lastCompletedWave:15,throneHp:10});
  const done=await store.finishRun(owner,run.id,{requestId:randomUUID(),expectedRevision:1,result:victory},hash(victory));
  assert.equal(done.revision,2);const current=await store.getRun(owner,run.id);assert.equal(current.status,'victory');assert.equal(current.result.wave,15);
  const provenance=(await query("SELECT v.boolean_value FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id JOIN last_throne.entities e ON e.id=v.entity_id WHERE e.run_id=$1 AND p.code='client_reported'",[run.id])).rows;
  assert.deepEqual(provenance,[{boolean_value:true}]);assert.equal(await store.getCheckpoint(owner,run.id),null);
});

test('typed R3 reference guards refuse wrong target type, foreign checkpoint and foreign pinned release',async()=>{
  const owner=await guest(),run=await newRun(owner),client=await pool.connect();
  try {
    await client.query('BEGIN');
    const cp=randomUUID(),other=randomUUID(),slot=randomUUID();
    for(const id of [cp,other])await client.query("SELECT last_throne.r3_new('checkpoint',$1,$2,$3,$1,'r3-content-1')",[id,owner,run.id]);
    await client.query("SELECT last_throne.r3_new('hero_item_slot',$1,$2,$3,$4,'r3-content-1')",[slot,owner,run.id,cp]);
    const attempt=async(sql,args,pattern)=>{await client.query('SAVEPOINT invalid_reference');await assert.rejects(()=>client.query(sql,args),pattern);await client.query('ROLLBACK TO SAVEPOINT invalid_reference');};
    await attempt("SELECT last_throne.r3_set($1,'definition',to_jsonb($2::uuid))",[slot,cp],/REFERENCE_TARGET_TYPE/);
    await attempt("SELECT last_throne.r3_set($1,'checkpoint',to_jsonb($2::uuid))",[slot,other],/REFERENCE_SCOPE/);
    const oldItem=(await client.query("SELECT id FROM last_throne.entities WHERE release_id='r2-content-1' AND entity_type_id=last_throne.r2_type('hero_definition') LIMIT 1")).rows[0].id;
    await attempt("SELECT last_throne.r3_set($1,'definition',to_jsonb($2::uuid))",[slot,oldItem],/REFERENCE_TARGET_TYPE|REFERENCE_TYPE_OUTSIDE_METADATA_SCHEMA/);
  } finally {await client.query('ROLLBACK');client.release();}
});

test('optional parameter uses a new immutable metadata revision without domain DDL; future revision cannot publish an unknown handler',async()=>{
  const metadata=await readMetadataSchema(pool,'r3-meta-1'),source=await readContent(pool,'r3-content-1');
  const columnsBefore=(await query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='last_throne' ORDER BY table_name,ordinal_position")).rows;
  const client=await pool.connect(),version='r3-meta-author-optional',release='r3-content-author-optional';
  const typeIds=new Map(),parameterIds=new Map(),revisions=new Map();
  try {
    await client.query('BEGIN');await client.query('INSERT INTO last_throne.metadata_schema_versions(version) VALUES($1)',[version]);
    for(const type of metadata.types) {
      const revised=['game_config','spell_definition'].includes(type.code),id=revised?randomUUID():type.id;typeIds.set(type.id,id);revisions.set(type.code,revised?4:type.schemaRevision);
      if(revised)await client.query('INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES($1,$2,$3,4)',[id,type.code,type.label]);
      await client.query('INSERT INTO last_throne.metadata_schema_types VALUES($1,$2)',[version,id]);
      for(const parameter of type.parameters) {
        const parameterId=revised?randomUUID():parameter.id;parameterIds.set(parameter.id,parameterId);
        if(revised)await client.query('INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[parameterId,id,parameter.code,parameter.label,parameter.dataType,parameter.required,parameter.multiple,parameter.targetTypeId,parameter.referencePolicy,type.code==='spell_definition'&&parameter.code==='behavior_id'?{minLength:1,maxLength:128}:parameter.constraints]);
      }
    }
    const config=metadata.types.find(t=>t.code==='game_config'),optional=randomUUID();
    await client.query("INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES($1,$2,'qa_optional','Optional value','integer',false,'{\"min\":0,\"max\":7}')",[optional,typeIds.get(config.id)]);
    const draftReader={query:(sql,args)=>client.query(sql.replace("AND status='published'",''),args)};
    await client.query('SELECT last_throne.publish_metadata_schema($1,$2)',[version,hash(await readMetadataSchema(draftReader,version))]);
    const ids=new Map(source.entities.map(entity=>[entity.id,randomUUID()]));
    const projection={...source,contentVersion:release,metadataSchemaVersion:version,entities:source.entities.map(entity=>({...entity,id:ids.get(entity.id),schemaRevision:revisions.get(entity.type),parameters:{...entity.parameters,...(entity.type==='game_config'?{qa_optional:0}:{})}})).sort((a,b)=>a.id.localeCompare(b.id))};
    await client.query('INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) VALUES($1,$1,1,$2,ARRAY[\'r3-core-1\'],$3,$4)',[release,version,hash([]),hash(projection)]);
    for(const entity of source.entities) {
      const type=metadata.types.find(type=>type.code===entity.type),id=ids.get(entity.id),typeId=typeIds.get(type.id);
      await client.query('INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,$3,$4,$4)',[id,typeId,version,release]);
      // Each value keeps its scalar SQL column and maps to the exact revised parameter ID.
      for(const parameter of type.parameters)await client.query('INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,ordinal,text_value,integer_value,numeric_value,boolean_value,timestamp_value,reference_value) SELECT $1,$2,$3,data_type,ordinal,text_value,integer_value,numeric_value,boolean_value,timestamp_value,reference_value FROM last_throne.entity_parameter_values WHERE entity_id=$4 AND parameter_id=$5',[id,typeId,parameterIds.get(parameter.id),entity.id,parameter.id]);
      if(entity.type==='game_config')await client.query("INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,integer_value) VALUES($1,$2,$3,'integer',0)",[id,typeId,optional]);
    }
    await client.query('SAVEPOINT unknown_handler');
    const spell=source.entities.find(entity=>entity.type==='spell_definition'),spellType=metadata.types.find(t=>t.code==='spell_definition'),behavior=spellType.parameters.find(p=>p.code==='behavior_id');
    await client.query("UPDATE last_throne.entity_parameter_values SET text_value='arbitrary_new_code' WHERE entity_id=$1 AND parameter_id=$2",[ids.get(spell.id),parameterIds.get(behavior.id)]);
    await assert.rejects(()=>client.query('SELECT last_throne.publish_content_release($1)',[release]),/CONTENT_INCOMPATIBLE/);
    await client.query('ROLLBACK TO SAVEPOINT unknown_handler');
    await client.query('SELECT last_throne.publish_content_release($1)',[release]);
    const published=await readContent(client,release);assert.equal(published.entities.find(e=>e.type==='game_config').parameters.qa_optional,0);assert.equal(parseContentProjection(published).waves.length,15);assert.equal(hash(published),hash(projection));
    assert.deepEqual((await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='last_throne' ORDER BY table_name,ordinal_position")).rows,columnsBefore);
  } finally {await client.query('ROLLBACK');client.release();}
  assert.deepEqual(await readContent(pool,'r3-content-1'),source);
});

test('R3 API grants allow bounded mixed-version operations and deny technical history, helpers and future objects',async()=>{
  await query('CREATE ROLE td_r3_api NOLOGIN NOSUPERUSER NOINHERIT');
  await query((await readFile(new URL('../db/r3-runtime-grants.sql',import.meta.url),'utf8')).replaceAll(':"api_role"','td_r3_api'));
  await query('CREATE TABLE last_throne.r3_future_private(id integer)');await query("CREATE FUNCTION last_throne.r3_future_helper() RETURNS integer LANGUAGE sql AS 'SELECT 3'");
  const client=await pool.connect();const restrictedPool={query:client.query.bind(client),connect:async()=>({query:client.query.bind(client),release(){}})};
  const active=createGameStore(restrictedPool);
  await client.query('SET ROLE td_r3_api');
  try {
    const owner=await guest(active);
    for(const [version,snapshot] of [[pins1,snapR1(gameR1(defaultR1Content,17))],[pins2,snapR2(gameR2(defaultR2Content,17))],[pins3,nestedSnapshot(true)]]) {
      const run=await newRun(owner,version,active),saved=await active.commitCheckpoint(owner,run.id,envelope(1,version.snapshotSchemaVersion),hash(`role-${version.coreVersion}`),snapshot);
      assert.equal(saved.revision,2);assert.deepEqual((await active.getCheckpoint(owner,run.id)).snapshot,snapshot);
    }
    assert.equal((await active.listRuns(owner)).runs.length,3);assert.equal((await readContent(restrictedPool,'r3-content-1')).contentVersion,'r3-content-1');
    for(const table of ['guest_sessions','run_client_keys','save_operations','schema_migrations','r3_future_private'])await assert.rejects(()=>client.query(`SELECT * FROM last_throne.${table}`),/permission denied/);
    await assert.rejects(()=>client.query('SELECT last_throne.r3_future_helper()'),/permission denied/);
    await assert.rejects(()=>client.query("SELECT last_throne.r3_set($1,'status','\"victory\"'::jsonb)",[retained.runs[0].run.id]),/permission denied/);
    await assert.rejects(()=>client.query('DELETE FROM last_throne.entities'),/permission denied/);
    await assert.rejects(()=>client.query("SELECT last_throne.publish_content_release('r3-content-1')"),/permission denied/);
  } finally {await client.query('RESET ROLE');client.release();}
});
