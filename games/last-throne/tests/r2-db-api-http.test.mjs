import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';
import { fixtureRelease } from './fixtures.mjs';
import { createApp } from '../server/app.mjs';
import { canonicalJson, readContent } from '../db/content.mjs';
import { operationHash, tokenHash } from '../server/http-support.mjs';
import { defaultR1Content, parseContentProjection as parseR1 } from '../core/content-r1.ts';
import { createGame as createR1, createSnapshot as snapshotR1 } from '../core/game-core.ts';
import { defaultR2Content, parseContentProjection as parseR2 } from '../core/content-r2.ts';
import { createGame as createR2, createSnapshot as snapshotR2, validateSnapshot } from '../core/game-core-r2.ts';

const origin = 'https://game.test', headers = { host: 'game.test', origin };
const version = family => ({frontend:`${family}-web-1`,backend:'r2-api-1',core:`${family}-core-1`,content:`${family}-content-1`,metadataSchema:`${family}-meta-1`,saveFormat:family==='r1'?2:3,api:1});
const r1 = version('r1'), r2 = version('r2');
const hash = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
let db, dir, app, legacy, originalR1;
let tail = Promise.resolve();
async function acquire() { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; return release; }
const query = async (sql, params) => !params && sql.includes(';') ? (await db.exec(sql)).at(-1) || {rows:[]} : db.query(sql,params);
const pool = {query:async(...args)=>{const release=await acquire();try{return await query(...args);}finally{release();}},connect:async()=>{const release=await acquire();return{query,release};}};
const call = async (name,args) => (await pool.query(`SELECT last_throne.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS value`,args)).rows[0].value;
const r1Snapshot = () => snapshotR1(createR1(defaultR1Content,42));
const r2Snapshot = () => snapshotR2(createR2(defaultR2Content,42));
const checkpoint = (format=3,snapshot=r2Snapshot(),expectedRevision=1,requestId=randomUUID()) => ({requestId,expectedRevision,snapshotSchemaVersion:format,snapshot});
const result = (family='r2',outcome='defeat') => ({outcome,wave:outcome==='victory'?(family==='r1'?5:10):1,lastCompletedWave:outcome==='victory'?(family==='r1'?5:10):0,simTick:900,gold:200,throneHp:outcome==='victory'?100:0,seed:42,versions:{core:version(family).core,content:version(family).content,metadataSchema:version(family).metadataSchema},statistics:{kills:3,builds:1,upgrades:0,goldEarned:36}});
const finish = (expectedRevision=1,finalResult=result(),requestId=randomUUID()) => ({requestId,expectedRevision,result:finalResult});
async function request(method,url,body,cookie,extra={}) {return app.inject({method,url,headers:{...headers,...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{payload:body})});}
async function guest() {const response=await request('POST','/api/v1/guest-session');assert.equal(response.statusCode,201,response.body);return{id:response.json().profileId,cookie:response.headers['set-cookie'].split(';')[0]};}
async function run(cookie,family='r2',overrides={}) {const v=version(family),body={clientRunId:randomUUID(),clientReleaseId:`${family}-api-test`,coreVersion:v.core,contentVersion:v.content,seed:42,...overrides};const response=await request('POST','/api/v1/runs',body,cookie);assert.equal(response.statusCode,201,response.body);return{body,...response.json()};}

before(async()=>{
  db=new PGlite();dir=await mkdtemp(join(tmpdir(),'td-r2-http-'));const oldMigrations=join(dir,'r1-migrations');await mkdir(oldMigrations);
  for(const name of ['001_typed_eav.sql','002_r0_catalog.sql','003_r1_persistence.sql','004_r1_catalog.sql'])await copyFile(new URL(`../db/migrations/${name}`,import.meta.url),join(oldMigrations,name));
  await migrate(pool,{directory:oldMigrations});
  originalR1=canonicalJson(await readContent(pool,r1.content));
  const token=randomBytes(32).toString('base64url'),session=await call('r1_create_guest',[tokenHash(token),'2027-10-04T00:00:00Z']);
  const body={clientRunId:randomUUID(),clientReleaseId:'r1-api-test',coreVersion:r1.core,contentVersion:r1.content,seed:42};
  const pins={clientReleaseId:body.clientReleaseId,coreVersion:r1.core,contentVersion:r1.content,metadataSchemaVersion:r1.metadataSchema,snapshotSchemaVersion:2};
  const oldRun=await call('r1_create_run',[session.profileId,JSON.stringify(body),JSON.stringify(pins),hash({canonicalization:1,payload:body,pins})]);
  const save=checkpoint(2,r1Snapshot());
  const response=await call('r1_commit_checkpoint',[session.profileId,oldRun.id,save.requestId,operationHash('checkpoint',oldRun.id,save),1,JSON.stringify(save.snapshot)]);
  legacy={owner:session.profileId,cookie:`last_throne_guest=${token}`,run:oldRun,save,response};
  const existingBefore=(await pool.query("SELECT count(*)::int count FROM last_throne.entities WHERE metadata_schema_version='r1-meta-1'")).rows[0].count;
  await migrate(pool);assert.equal((await pool.query("SELECT count(*)::int count FROM last_throne.entities WHERE metadata_schema_version='r1-meta-1'")).rows[0].count,existingBefore);
  assert.equal(canonicalJson(await readContent(pool,r1.content)),originalR1);
  await fixtureRelease(dir,'r0-retained');
  const compatibility={rollbackMode:'frontend_only',compatibleApi:[1],compatibleSaveFormats:[1,2,3],compatibleMetadataSchemas:['r0-meta-1','r1-meta-1','r2-meta-1'],compatibleClientReleases:['*','r1-*','r2-*']};
  await fixtureRelease(dir,'r1-api-test',{...compatibility,versions:r1});
  await fixtureRelease(dir,'r2-api-test',{...compatibility,versions:r2});
  await fixtureRelease(dir,'r2-mixed',{...compatibility,versions:{...r2,metadataSchema:'r1-meta-1'}});
  app=await createApp({pool,releasesDir:dir,releaseId:'r2-api-test',publicOrigin:origin});
});
after(async()=>{await app?.close();await db?.close();await rm(dir,{recursive:true,force:true});});

test('R2 additive migration preserves preexisting R1 data, hashes and historical accepted operations',async()=>{
  const loaded=await request('GET',`/api/v1/runs/${legacy.run.id}/checkpoint`,undefined,legacy.cookie);
  assert.equal(loaded.statusCode,200,loaded.body);assert.equal(loaded.json().snapshotSchemaVersion,2);assert.deepEqual(loaded.json().snapshot,legacy.save.snapshot);
  const repeat=await request('PUT',`/api/v1/runs/${legacy.run.id}/checkpoint`,legacy.save,legacy.cookie);
  assert.equal(repeat.statusCode,200,repeat.body);assert.deepEqual(repeat.json(),legacy.response);
  const historicalHash=hash({canonicalization:1,operation:'checkpoint',runId:legacy.run.id,snapshotSchemaVersion:2,body:legacy.save});
  assert.equal(operationHash('checkpoint',legacy.run.id,legacy.save),historicalHash);
  const terminal=await request('POST',`/api/v1/runs/${legacy.run.id}/finish`,finish(2,result('r1')),legacy.cookie);
  assert.equal(terminal.statusCode,200,terminal.body);
  assert.deepEqual((await request('PUT',`/api/v1/runs/${legacy.run.id}/checkpoint`,legacy.save,legacy.cookie)).json(),legacy.response);
  const final=await request('GET',`/api/v1/runs/${legacy.run.id}`,undefined,legacy.cookie);assert.equal(final.json().status,'defeat');assert.equal(final.json().revision,3);
  assert.equal(canonicalJson(await readContent(pool,r1.content)),originalR1);
});

test('bootstrap dispatches exact R0, R1 and R2 EAV pins and rejects a mixed family',async()=>{
  assert.equal((await request('GET','/api/v1/ready')).statusCode,200);
  assert.equal((await request('GET','/api/v1/version')).json().stage,'R2');
  for(const family of ['r1','r2']){
    const bootstrap=await request('GET',`/api/v1/bootstrap?clientReleaseId=${family}-api-test`);assert.equal(bootstrap.statusCode,200,bootstrap.body);assert(bootstrap.json().capabilities.battle);assert.equal(bootstrap.json().versions.saveFormat,version(family).saveFormat);
    const content=await request('GET',`/api/v1/content?clientReleaseId=${family}-api-test`);assert.equal(content.statusCode,200,content.body);
    const compiled=(family==='r1'?parseR1:parseR2)(content.json());assert.equal(compiled.waves.length,family==='r1'?5:10);assert.equal(compiled.heroes.length,family==='r1'?2:5);assert.equal(compiled.buildings.length,family==='r1'?2:3);
    if(family==='r2')assert.deepEqual(compiled.spells.map(spell=>spell.behaviorId).sort(),['area_heal','area_strike','temporary_shield']);
    assert.equal((await request('GET',`/api/v1/content/${version(family).content}`,undefined,undefined,{'if-none-match':content.headers.etag})).statusCode,304);
  }
  assert.equal((await request('GET','/api/v1/bootstrap?clientReleaseId=r0-retained')).json().capabilities.battle,false);
  assert.equal((await request('GET','/api/v1/bootstrap?clientReleaseId=r2-mixed')).statusCode,409);
});

test('R2 typed generations roundtrip each stolen slot, independent cooldowns, Sniper priority and null',async()=>{
  const user=await guest(),created=await run(user.cookie);let revision=1,oldCheckpoint;
  for(const spell of ['area_heal','area_strike','temporary_shield',null]){
    const snapshot=r2Snapshot(),rubick=snapshot.heroes.find(h=>h.kind==='rubick'),sniper=snapshot.heroes.find(h=>h.kind==='sniper');
    rubick.stolenSpell=spell;rubick.stealCooldown=17;rubick.abilityCooldown=23;sniper.priority='commander';
    assert(validateSnapshot(snapshot,defaultR2Content).valid);
    const body=checkpoint(3,snapshot,revision),saved=await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,body,user.cookie);assert.equal(saved.statusCode,200,saved.body);revision++;
    const loaded=await request('GET',`/api/v1/runs/${created.id}/checkpoint`,undefined,user.cookie);assert.deepEqual(loaded.json().snapshot,snapshot);assert.equal(loaded.json().revision,revision);
    const rows=await pool.query(`SELECT p.code,v.text_value,v.integer_value FROM last_throne.entities e JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE e.checkpoint_id=$1 AND p.code IN('stolen_spell','steal_cooldown','priority')`,[saved.json().checkpointId]);
    assert.equal(rows.rows.filter(row=>row.code==='stolen_spell').length,spell===null?0:1);assert(rows.rows.some(row=>row.code==='steal_cooldown'&&Number(row.integer_value)===17));assert(rows.rows.some(row=>row.code==='priority'&&row.text_value==='commander'));
    if(oldCheckpoint)assert.equal((await pool.query("SELECT count(*)::int count FROM last_throne.entities WHERE checkpoint_id=$1 AND status='frozen'",[oldCheckpoint])).rows[0].count,6);
    oldCheckpoint=saved.json().checkpointId;
  }
  const current=await request('GET',`/api/v1/runs/${created.id}`,undefined,user.cookie);assert.equal(current.json().snapshotSchemaVersion,3);assert.equal(current.json().revision,5);
});

test('version, unknown spell, unauthorized hero state and transient snapshot rejection leave no generation',async()=>{
  const user=await guest(),created=await run(user.cookie);const invalid=[];
  for(const change of [s=>s.heroes.find(h=>h.kind==='rubick').stolenSpell='execute_player_code',s=>s.heroes.find(h=>h.kind==='pudge').stolenSpell='area_heal',s=>s.heroes.find(h=>h.kind==='pudge').stealCooldown=1,s=>s.heroes.find(h=>h.kind==='shaman').priority='strongest',s=>s.heroes.find(h=>h.kind==='sniper').priority='unknown',s=>s.heroes.find(h=>h.kind==='rubick').stealCooldown=2147483647,s=>s.phase='wave',s=>s.summons=[],s=>s.versions.metadataSchema='r1-meta-1']){const snapshot=r2Snapshot();change(snapshot);invalid.push(snapshot);}
  for(const snapshot of invalid){const rejected=await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,checkpoint(3,snapshot),user.cookie);assert.equal(rejected.statusCode,422,rejected.body);}
  assert.equal((await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,checkpoint(2,r1Snapshot()),user.cookie)).statusCode,422);
  assert.equal((await request('GET',`/api/v1/runs/${created.id}`,undefined,user.cookie)).json().revision,1);
  assert.equal((await pool.query('SELECT count(*)::int count FROM last_throne.save_operations WHERE run_id=$1',[created.id])).rows[0].count,0);
  const old=await run(user.cookie,'r1');assert.equal((await request('PUT',`/api/v1/runs/${old.id}/checkpoint`,checkpoint(3,r2Snapshot()),user.cookie)).statusCode,422);
  const malformedR1=r1Snapshot();malformedR1.heroes[0].stolenSpell=null;assert.equal((await request('PUT',`/api/v1/runs/${old.id}/checkpoint`,checkpoint(2,malformedR1),user.cookie)).statusCode,422);
});

test('canonical retries precede invalid values, stale revisions and terminal status across shared operation IDs',async()=>{
  const user=await guest(),created=await run(user.cookie),body=checkpoint();const accepted=await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,body,user.cookie);assert.equal(accepted.statusCode,200,accepted.body);
  const reordered={snapshot:JSON.parse(JSON.stringify(body.snapshot)),snapshotSchemaVersion:3,expectedRevision:1,requestId:body.requestId};assert.deepEqual((await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,reordered,user.cookie)).json(),accepted.json());
  for(const changed of [{...body,snapshotSchemaVersion:2},{...body,snapshot:{...body.snapshot,gold:-1}}]){const conflict=await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,changed,user.cookie);assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');}
  const collision=await request('POST',`/api/v1/runs/${created.id}/finish`,finish(2,result(),body.requestId),user.cookie);assert.equal(collision.statusCode,409);assert.equal(collision.json().error.code,'IDEMPOTENCY_CONFLICT');
  const finalBody=finish(2),terminal=await request('POST',`/api/v1/runs/${created.id}/finish`,finalBody,user.cookie);assert.equal(terminal.statusCode,200,terminal.body);
  assert.deepEqual((await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,body,user.cookie)).json(),accepted.json());assert.deepEqual((await request('POST',`/api/v1/runs/${created.id}/finish`,finalBody,user.cookie)).json(),terminal.json());
  const loaded=await request('GET',`/api/v1/runs/${created.id}/checkpoint`,undefined,user.cookie);assert.equal(loaded.json().revision,2);assert.equal(loaded.json().runRevision,3);
  const late=await request('PUT',`/api/v1/runs/${created.id}/checkpoint`,checkpoint(3,r2Snapshot(),3),user.cookie);assert.equal(late.statusCode,409);assert.equal(late.json().error.code,'RUN_FINISHED');
  const changedFinish=await request('POST',`/api/v1/runs/${created.id}/finish`,{...finalBody,result:{...finalBody.result,gold:-1}},user.cookie);assert.equal(changedFinish.statusCode,409);assert.equal(changedFinish.json().error.code,'IDEMPOTENCY_CONFLICT');
});

test('R2 terminal bounds require wave10 victory and finish without checkpoint is atomic',async()=>{
  const user=await guest(),created=await run(user.cookie);
  const early=result('r2','victory');early.wave=5;early.lastCompletedWave=5;
  for(const invalid of [early,{...result('r2','victory'),throneHp:999},{...result(),versions:result('r1').versions}])assert.equal((await request('POST',`/api/v1/runs/${created.id}/finish`,finish(1,invalid),user.cookie)).statusCode,422);
  assert.equal((await request('GET',`/api/v1/runs/${created.id}`,undefined,user.cookie)).json().revision,1);
  const body=finish(1,result('r2','victory')),saved=await request('POST',`/api/v1/runs/${created.id}/finish`,body,user.cookie);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().status,'victory');
  assert.equal((await request('GET',`/api/v1/runs/${created.id}/checkpoint`,undefined,user.cookie)).json(),null);
  assert.deepEqual((await request('GET',`/api/v1/runs/${created.id}`,undefined,user.cookie)).json().result,body.result);
  const marked=await pool.query("SELECT v.boolean_value FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 AND p.code='client_reported'",[saved.json().resultId]);assert.equal(marked.rows[0].boolean_value,true);
});

test('owner isolation, mixed history, competing revisions and exact duplicates keep a single pointer',async()=>{
  const owner=await guest(),other=await guest(),newRun=await run(owner.cookie),oldRun=await run(owner.cookie,'r1');
  for(const id of [newRun.id,oldRun.id]){assert.equal((await request('GET',`/api/v1/runs/${id}`,undefined,other.cookie)).statusCode,404);assert.equal((await request('PUT',`/api/v1/runs/${id}/checkpoint`,checkpoint(),other.cookie)).statusCode,404);}
  const list=await request('GET','/api/v1/runs',undefined,owner.cookie);assert.deepEqual(list.json().runs.map(run=>run.snapshotSchemaVersion).sort(),[2,3]);assert.deepEqual((await request('GET','/api/v1/runs',undefined,other.cookie)).json().runs,[]);
  const a=checkpoint(),b=checkpoint();const racing=await Promise.all([a,b].map(body=>request('PUT',`/api/v1/runs/${newRun.id}/checkpoint`,body,owner.cookie)));assert.deepEqual(racing.map(response=>response.statusCode).sort(),[200,409]);
  const same=checkpoint(3,r2Snapshot(),2),repeat=await Promise.all([1,2].map(()=>request('PUT',`/api/v1/runs/${newRun.id}/checkpoint`,same,owner.cookie)));assert.deepEqual(repeat.map(response=>response.statusCode),[200,200]);assert.deepEqual(repeat[0].json(),repeat[1].json());
  assert.equal((await pool.query('SELECT count(*)::int count FROM last_throne.save_operations WHERE run_id=$1',[newRun.id])).rows[0].count,2);
});

test('published R1 migration and core sources retain their exact accepted bytes',async()=>{
  const baseline=new URL('../releases/r1-002/',import.meta.url);
  for(const name of ['db/migrations/001_typed_eav.sql','db/migrations/002_r0_catalog.sql','db/migrations/003_r1_persistence.sql','db/migrations/004_r1_catalog.sql','db/seed-r1.mjs','db/build-r1-seed.mjs','db/r1-metadata.mjs','core/game-core.ts','core/content-r1.ts'])assert.deepEqual(await readFile(new URL(`../${name}`,import.meta.url)),await readFile(new URL(name,baseline)),name);
});
