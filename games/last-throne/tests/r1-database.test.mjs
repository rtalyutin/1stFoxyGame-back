import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {migrate} from '../scripts/migrate.mjs';
import {createGameStore} from '../db/game-store.mjs';
import {canonicalJson,readContent,readMetadataSchema} from '../db/content.mjs';
import {defaultR1Content,parseContentProjection,contentRows} from '../core/content-r1.ts';
import {createGame,createSnapshot} from '../core/game-core.ts';
let db,store;const query=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1);
const pool={query,connect:async()=>({query,release(){}})};
const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const pins={clientReleaseId:'r1-test',coreVersion:'r1-core-1',contentVersion:'r1-content-1',metadataSchemaVersion:'r1-meta-1',snapshotSchemaVersion:2};
before(async()=>{db=new PGlite();await migrate(pool);store=createGameStore(pool);});
after(async()=>await db.close());
async function guest(){return (await store.createGuest(digest(randomUUID()),new Date(Date.now()+86400000).toISOString())).profileId;}
async function run(owner,overrides={}){return store.createRun(owner,{clientRunId:randomUUID(),clientReleaseId:pins.clientReleaseId,coreVersion:pins.coreVersion,contentVersion:pins.contentVersion,seed:0,...overrides},pins);}
function snapshot(seed=0){const s=createSnapshot(createGame(defaultR1Content,seed));s.statistics??={kills:0,builds:0,upgrades:0,goldEarned:0};return s;}
const envelope=(revision=1)=>({requestId:randomUUID(),expectedRevision:revision,snapshotSchemaVersion:2});
const result=(seed=0)=>({outcome:'defeat',lastCompletedWave:0,wave:1,simTick:25,gold:200,throneHp:0,seed,versions:{core:pins.coreVersion,content:pins.contentVersion,metadataSchema:pins.metadataSchemaVersion},statistics:{kills:1,builds:1,upgrades:0,goldEarned:12}});
const error=code=>e=>e.code===code;

test('additive R1 migration publishes complete typed catalog and preserves R0',async()=>{
 assert.deepEqual(await migrate(pool),[]);assert.equal((await query('SELECT count(*)::int n FROM last_throne.schema_migrations')).rows[0].n,8);
 assert.equal((await readContent(pool,'r0-content-1')).entities[0].parameters.gameplay_available,false);
 const content=await readContent(pool,'r1-content-1');assert.deepEqual(contentRows(parseContentProjection(content)).sort((a,b)=>`${a.type}:${a.code}`.localeCompare(`${b.type}:${b.code}`)),contentRows(defaultR1Content).sort((a,b)=>`${a.type}:${a.code}`.localeCompare(`${b.type}:${b.code}`))); 
 const hashes=(await query("SELECT projection_hash FROM last_throne.content_releases WHERE id='r1-content-1'")).rows[0];assert.equal(hashes.projection_hash,digest(content));
 const meta=await readMetadataSchema(pool,'r1-meta-1');assert.equal((await query("SELECT manifest_hash FROM last_throne.metadata_schema_versions WHERE version='r1-meta-1'")).rows[0].manifest_hash,digest(meta));
 assert.ok(meta.types.some(t=>t.code==='saved_hero'&&t.parameters.some(p=>p.code==='definition'&&p.referencePolicy==='pinned_release')));
});
test('guest tokens are hashed, expiring and stable; profile settings retain zero/false',async()=>{
 const token=digest(randomUUID()),expiry=new Date(Date.now()+60000).toISOString();const first=await store.createGuest(token,expiry);assert.deepEqual(await store.guestSession(token),first);assert.deepEqual(await store.createGuest(token,expiry),first);
 assert.equal(await store.guestSession(digest('unknown')),null);
 const changed=await store.patchProfile(first.profileId,1,{soundEnabled:false,volume:0,quality:'low',autoPause:false});assert.equal(changed.revision,2);assert.deepEqual(changed.settings,{soundEnabled:false,volume:0,quality:'low',controlScheme:'mouse_keyboard',autoPause:false});
 await assert.rejects(()=>store.patchProfile(first.profileId,1,{volume:1}),error('REVISION_CONFLICT'));
 await assert.rejects(()=>store.patchProfile(first.profileId,2,{admin:true}),error('SETTINGS_INVALID'));
 await assert.rejects(()=>store.patchProfile(first.profileId,2,{volume:2}),error('VALUE_CONSTRAINT_FAILED'));
 assert.equal((await store.getProfile(first.profileId)).revision,2);
 await query('UPDATE last_throne.guest_sessions SET expires_at=now()-interval \'1 minute\' WHERE token_hash=$1',[token]);assert.equal(await store.guestSession(token),null);
 await assert.rejects(()=>store.createGuest(token,expiry),error('SESSION_EXPIRED'));
});
test('creation keys scope by owner and exact payload, immutable pins checked',async()=>{
 const owner=await guest(),clientRunId=randomUUID();const payload={clientRunId,clientReleaseId:pins.clientReleaseId,coreVersion:pins.coreVersion,contentVersion:pins.contentVersion,seed:4294967295};
 const first=await store.createRun(owner,payload,pins);assert.deepEqual(await store.createRun(owner,payload,pins),first);assert.equal(first.seed,4294967295);
 await assert.rejects(()=>store.createRun(owner,{...payload,seed:1},pins),error('IDEMPOTENCY_CONFLICT'));
 const other=await store.createRun(await guest(),payload,pins);assert.notEqual(other.id,first.id);
 await assert.rejects(()=>store.createRun(owner,{...payload,clientRunId:randomUUID(),contentVersion:'r0-content-1'},pins),error('VERSION_MISMATCH'));
 assert.equal((await store.listRuns(owner)).runs.length,1);
});
test('checkpoint generation round trips every typed field and freezes the full closure',async()=>{
 const owner=await guest(),r=await run(owner),s=snapshot();s.rngState=4294967295;s.commandEpoch=3;s.simTick=20;s.scrolls=2;s.statistics={kills:9,builds:1,upgrades:0,goldEarned:108};
 s.heroes[0].hp=0;s.heroes[0].respawnTicks=10;s.heroes[1].abilityCooldown=20;
 s.buildings=[{id:'built-1',kind:'ballista',padId:'pad-n1',level:1,hp:230,attackCooldown:0,spentGold:100}];
 const saved=await store.commitCheckpoint(owner,r.id,envelope(),digest('checkpoint1'),s);assert.equal(saved.revision,2);
 const check=await store.getCheckpoint(owner,r.id);assert.deepEqual(check.snapshot,s);assert.equal(check.revision,2);assert.equal(check.checkpointId,saved.checkpointId);
 assert.equal((await query("SELECT count(*)::int n FROM last_throne.entities WHERE checkpoint_id=$1 AND status='frozen'",[saved.checkpointId])).rows[0].n,4);
 await assert.rejects(()=>query("UPDATE last_throne.entities SET revision=revision+1 WHERE id=$1",[saved.checkpointId]),/ENTITY_IMMUTABLE/);
 await assert.rejects(()=>query('DELETE FROM last_throne.entity_parameter_values WHERE entity_id=$1',[saved.checkpointId]),/ENTITY_IMMUTABLE/);
});
test('exact replay precedes revision, terminal state and lazy semantic validation',async()=>{
 const owner=await guest(),r=await run(owner),env=envelope();let calls=0;const save=()=>store.commitCheckpoint(owner,r.id,env,digest('replay'),async(lockedRun,client)=>{calls++;assert.equal(lockedRun.id,r.id);assert.equal((await client.query('SELECT 1 n')).rows[0].n,1);return snapshot();});
 const first=await save();assert.deepEqual(await save(),first);assert.equal(calls,1);
 await assert.rejects(()=>store.commitCheckpoint(owner,r.id,env,digest('different'),()=>{throw Error('mustnotrun');}),error('IDEMPOTENCY_CONFLICT'));
 const terminal={requestId:randomUUID(),expectedRevision:2,result:result()};await store.finishRun(owner,r.id,terminal,digest('finishreplay'));
 assert.deepEqual(await save(),first);assert.equal(calls,1);assert.equal((await store.getRun(owner,r.id)).status,'defeat');
 const generation=await store.getCheckpoint(owner,r.id);assert.equal(generation.revision,2);assert.equal(generation.runRevision,3);assert.deepEqual(generation.snapshot,snapshot());
 await assert.rejects(()=>store.commitCheckpoint(owner,r.id,envelope(3),digest('late'),snapshot()),error('RUN_FINISHED'));
 await assert.rejects(()=>store.finishRun(owner,r.id,{...terminal,requestId:randomUUID(),expectedRevision:3},digest('latefinish')),error('RUN_FINISHED'));
});
test('two revisions cannot both replace the cloud generation; requestIds are shared by finish',async()=>{
 const owner=await guest(),r=await run(owner),env=envelope();const first=await store.commitCheckpoint(owner,r.id,env,digest('first'),snapshot());
 await assert.rejects(()=>store.commitCheckpoint(owner,r.id,envelope(),digest('second'),snapshot()),error('REVISION_CONFLICT'));
 await assert.rejects(()=>store.finishRun(owner,r.id,{requestId:env.requestId,expectedRevision:2,result:result()},digest('finishsameid')),error('IDEMPOTENCY_CONFLICT'));
 assert.equal((await store.getCheckpoint(owner,r.id)).checkpointId,first.checkpointId);
});
test('failed partial generation rolls back all entities, pointer and save operation',async()=>{
 const owner=await guest(),r=await run(owner);const initial=await store.commitCheckpoint(owner,r.id,envelope(),digest('initial'),snapshot());
 const before=(await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[r.id])).rows[0].n;
 const broken=snapshot();broken.buildings=[{id:'bad',kind:'ballista',padId:'pad-n1',level:1,hp:230,attackCooldown:0}];
 const env=envelope(2);await assert.rejects(()=>store.commitCheckpoint(owner,r.id,env,digest('broken'),broken),error('INVALID_PARAMETER'));
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1',[r.id])).rows[0].n,before);
 assert.equal((await store.getCheckpoint(owner,r.id)).checkpointId,initial.checkpointId);assert.equal((await store.getRun(owner,r.id)).revision,2);
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1 AND request_id=$2',[r.id,env.requestId])).rows[0].n,0);
});
test('finish is atomic, unique, typed and replayable without safe checkpoint',async()=>{
 const owner=await guest(),r=await run(owner),env={requestId:randomUUID(),expectedRevision:1,result:result()};
 const first=await store.finishRun(owner,r.id,env,digest('finish'));assert.deepEqual(await store.finishRun(owner,r.id,env,digest('finish')),first);
 const provenance=(await query(`SELECT v.boolean_value FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 AND p.code='client_reported'`,[first.resultId])).rows;
 assert.deepEqual(provenance,[{boolean_value:true}]);
 const terminal=await store.getRun(owner,r.id);assert.equal(terminal.status,'defeat');assert.equal(terminal.revision,2);assert.deepEqual(terminal.result,env.result);assert.equal(await store.getCheckpoint(owner,r.id),null);
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1 AND entity_type_id=last_throne.r1_type(\'run_result\')',[r.id])).rows[0].n,1);
 await assert.rejects(()=>store.finishRun(owner,r.id,{...env,result:{...env.result,gold:201}},digest('altered')),error('IDEMPOTENCY_CONFLICT'));
});
test('semantic finish failures leave run active and permit a corrected new operation',async()=>{
 const owner=await guest(),r=await run(owner),env={requestId:randomUUID(),expectedRevision:1,result:{...result(),outcome:'victory',lastCompletedWave:4,throneHp:1}};
 await assert.rejects(()=>store.finishRun(owner,r.id,env,digest('invalidfinish')),error('RESULT_INVALID'));assert.equal((await store.getRun(owner,r.id)).status,'active');
 for(const invalid of [
  {...result(),outcome:'victory',lastCompletedWave:5,wave:5,throneHp:999},
  {...result(),outcome:'victory',lastCompletedWave:5,wave:4,throneHp:100},
  {...result(),outcome:'defeat',lastCompletedWave:0,wave:3,throneHp:0},
 ]){
  await assert.rejects(()=>store.finishRun(owner,r.id,{...env,result:invalid},digest(invalid)),error('RESULT_INVALID'));
  assert.equal((await store.getRun(owner,r.id)).revision,1);
 }
 env.result={...result(),outcome:'victory',lastCompletedWave:5,wave:5,throneHp:defaultR1Content.throneHp};const finish=await store.finishRun(owner,r.id,env,digest('validfinish'));assert.equal(finish.status,'victory');
});
test('foreign owners cannot read or mutate runs, checkpoints or results',async()=>{
 const owner=await guest(),other=await guest(),r=await run(owner);await store.commitCheckpoint(owner,r.id,envelope(),digest('private'),snapshot());
 for(const operation of [()=>store.getRun(other,r.id),()=>store.getCheckpoint(other,r.id),()=>store.commitCheckpoint(other,r.id,envelope(2),digest('intruder'),snapshot()),()=>store.finishRun(other,r.id,{requestId:randomUUID(),expectedRevision:2,result:result()},digest('intruderfinish'))])await assert.rejects(operation,error('RUN_NOT_FOUND'));
 assert.deepEqual((await store.listRuns(other)).runs,[]);assert.equal((await store.getRun(owner,r.id)).revision,2);
});
test('API role has only bounded writes; metadata, universal EAV and publication remain inaccessible',async()=>{
 await query('CREATE ROLE r1_test_api');
 // Reproduce the R0 deployment grants, then execute the real R1 upgrade allowlist.
 await query('GRANT USAGE ON SCHEMA last_throne TO r1_test_api');
 await query('GRANT SELECT ON ALL TABLES IN SCHEMA last_throne TO r1_test_api');
 await query('ALTER DEFAULT PRIVILEGES IN SCHEMA last_throne GRANT SELECT ON TABLES TO r1_test_api');
 await query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA last_throne TO r1_test_api');
 const grants=(await readFile(new URL('../db/r1-runtime-grants.sql',import.meta.url),'utf8')).replaceAll(':"api_role"','r1_test_api');
 await query(grants);
 // New helpers and tables created by the owner must not gain API/PUBLIC permissions.
 await query('CREATE FUNCTION last_throne.future_private_helper() RETURNS integer LANGUAGE sql AS \'SELECT 7\'');
 await query('CREATE TABLE last_throne.future_private_table(id integer)');
 await query('SET ROLE r1_test_api');
 try{
 const published=await readContent(pool,'r1-content-1');assert.equal(published.contentVersion,'r1-content-1');
 assert.ok((await readMetadataSchema(pool,'r1-meta-1')).types.some(t=>t.code==='checkpoint'));
 const owner=await guest(),r=await run(owner);const saved=await store.commitCheckpoint(owner,r.id,envelope(),digest('rolemutation'),snapshot());assert.equal(saved.revision,2);
 for(const table of ['guest_sessions','save_operations','run_client_keys','schema_migrations','future_private_table'])await assert.rejects(()=>query(`SELECT * FROM last_throne.${table}`),/permission denied/);
 await assert.rejects(()=>query('SELECT last_throne.future_private_helper()'),/permission denied/);
 await assert.rejects(()=>query("INSERT INTO last_throne.metadata_schema_versions(version) VALUES('intruder')"),/permission denied/);
 await assert.rejects(()=>query('DELETE FROM last_throne.entities'),/permission denied/);
 await assert.rejects(()=>query("SELECT last_throne.r1_set($1,'status','\"victory\"'::jsonb)",[r.id]),/permission denied/);
 await assert.rejects(()=>query("SELECT last_throne.activate_content_release('stable','r0-content-1')"),/permission denied/);
 }finally{await query('RESET ROLE');}
});
