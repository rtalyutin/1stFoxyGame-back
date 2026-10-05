import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';
import { createApp } from '../server/app.mjs';
import { fixtureRelease } from './fixtures.mjs';
import { defaultR1Content, parseContentProjection } from '../core/content-r1.ts';
import { createGame, createSnapshot } from '../core/game-core.ts';

const origin = 'https://game.test';
const headers = { host: 'game.test', origin };
const r1 = { frontend:'r1-web-1',backend:'r1-api-1',core:'r1-core-1',content:'r1-content-1',metadataSchema:'r1-meta-1',saveFormat:2,api:1 };
let db, dir, app, unavailable = false;
let tail = Promise.resolve();
async function acquire() { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; return release; }
const rawQuery = async (sql, params) => {
  if (unavailable) throw new Error('postgres://owner:secret-password');
  return !params && sql.includes(';') ? (await db.exec(sql)).at(-1) || {rows:[]} : db.query(sql, params);
};
const pool = {
  query: async (...args) => { const release = await acquire(); try { return await rawQuery(...args); } finally { release(); } },
  connect: async () => { const release = await acquire(); return { query: rawQuery, release }; },
};
before(async () => {
  db = new PGlite(); dir = await mkdtemp(join(tmpdir(),'td-r1-api-'));
  await migrate(pool);
  await fixtureRelease(dir,'r0-retained');
  await fixtureRelease(dir,'r1-api-test',{versions:r1,rollbackMode:'frontend_only',compatibleApi:[1],compatibleSaveFormats:[1,2],compatibleMetadataSchemas:['r0-meta-1','r1-meta-1'],compatibleClientReleases:['*','r1-*']});
  app = await createApp({pool,releasesDir:dir,releaseId:'r1-api-test',publicOrigin:origin});
});
after(async () => { unavailable=false; await app?.close(); await db?.close(); await rm(dir,{recursive:true,force:true}); });
async function request(method, url, body, cookie, extra = {}) {
  return app.inject({method,url,headers:{...headers,...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{payload:body})});
}
async function guest() {
  const response = await request('POST','/api/v1/guest-session');
  assert.equal(response.statusCode,201,response.body);
  return {id:response.json().profileId,cookie:response.headers['set-cookie'].split(';')[0],response};
}
async function run(cookie, overrides={}) {
  const body={clientRunId:randomUUID(),clientReleaseId:'r1-api-test',coreVersion:r1.core,contentVersion:r1.content,seed:42,...overrides};
  const response=await request('POST','/api/v1/runs',body,cookie);
  assert.equal(response.statusCode,201,response.body);
  return {body,run:response.json()};
}
const snapshot=()=>createSnapshot(createGame(defaultR1Content,42));
const checkpoint=(expectedRevision=1,snap=snapshot(),requestId=randomUUID())=>({requestId,expectedRevision,snapshotSchemaVersion:2,snapshot:snap});
const terminal=(expectedRevision=1,requestId=randomUUID())=>({requestId,expectedRevision,result:{
  outcome:'defeat',wave:1,lastCompletedWave:0,simTick:450,gold:200,throneHp:0,seed:42,
  versions:{core:r1.core,content:r1.content,metadataSchema:r1.metadataSchema},statistics:{kills:2,builds:1,upgrades:0,goldEarned:24},
}});

test('R1 bootstrap compiles published EAV while retained R0 stays technical',async()=>{
  assert.equal((await request('GET','/api/v1/ready')).statusCode,200);
  const current=await request('GET','/api/v1/bootstrap?clientReleaseId=r1-api-test');
  assert.equal(current.statusCode,200,current.body);
  assert.deepEqual(current.json().capabilities,{battle:true,profiles:true,cloudSaves:true});
  const content=await request('GET','/api/v1/content?clientReleaseId=r1-api-test');
  assert.equal(content.statusCode,200,content.body);
  assert.equal(parseContentProjection(content.json()).waves.length,5);
  assert.equal(parseContentProjection(content.json()).heroes.length,2);
  assert.match(content.headers['cache-control'],/immutable/);
  const unchanged=await request('GET','/api/v1/content/r1-content-1',undefined,undefined,{'if-none-match':content.headers.etag});
  assert.equal(unchanged.statusCode,304); assert.equal(unchanged.body,'');
  const old=await request('GET','/api/v1/bootstrap?clientReleaseId=r0-retained');
  assert.equal(old.statusCode,200,old.body);
  assert.deepEqual(old.json().capabilities,{battle:false,profiles:false,cloudSaves:false});
  assert.equal(old.json().versions.content,'r0-content-1');
  const missing=await request('GET','/api/v1/content/unknown'); assert.equal(missing.statusCode,404);
});

test('guest sessions store only token hashes; cookie scope, ownership and profile revisions hold',async()=>{
  const user=await guest();
  const cookieHeader=user.response.headers['set-cookie'];
  for(const flag of ['Path=/td','HttpOnly','Secure','SameSite=Lax'])assert(cookieHeader.includes(flag));
  const token=user.cookie.split('=')[1];
  const stored=await pool.query('SELECT token_hash FROM last_throne.guest_sessions WHERE owner_id=$1',[user.id]);
  assert.equal(stored.rows[0].token_hash,createHash('sha256').update(token).digest('hex'));
  assert.notEqual(stored.rows[0].token_hash,token);
  const repeated=await request('POST','/api/v1/guest-session',{},user.cookie);
  assert.equal(repeated.statusCode,200);assert.equal(repeated.json().profileId,user.id);
  const profile=await request('GET','/api/v1/profile',undefined,user.cookie);
  assert.equal(profile.json().id,user.id);assert.equal(profile.json().revision,1);
  const patched=await request('PATCH','/api/v1/profile',{expectedRevision:1,settings:{soundEnabled:false,volume:0,quality:'low'}},user.cookie);
  assert.equal(patched.statusCode,200,patched.body);assert.equal(patched.json().revision,2);assert.equal(patched.json().settings.volume,0);assert.equal(patched.json().settings.soundEnabled,false);
  const stale=await request('PATCH','/api/v1/profile',{expectedRevision:1,settings:{volume:1}},user.cookie);
  assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'REVISION_CONFLICT');
  assert.equal((await request('GET','/api/v1/profile')).statusCode,401);
  assert.equal((await request('GET','/api/v1/profile',undefined,`last_throne_guest=${'x'.repeat(43)}`)).statusCode,401);
  assert.equal((await request('PATCH','/api/v1/profile',{expectedRevision:2,settings:{volume:'0.5'}},user.cookie)).statusCode,400);
  assert.equal((await request('PATCH','/api/v1/profile',{expectedRevision:2,settings:{ownerId:randomUUID()}},user.cookie)).statusCode,400);
  assert.equal((await request('POST','/api/v1/guest-session',{playerId:user.id})).statusCode,400);
});

test('owned creation/history checks manifest pins and exact clientRunId repeats',async()=>{
  const a=await guest(),b=await guest();
  const created=await run(a.cookie);
  const exact=await request('POST','/api/v1/runs',created.body,a.cookie);
  assert.equal(exact.statusCode,201);assert.equal(exact.json().id,created.run.id);
  const changed=await request('POST','/api/v1/runs',{...created.body,seed:43},a.cookie);
  assert.equal(changed.statusCode,409);assert.equal(changed.json().error.code,'IDEMPOTENCY_CONFLICT');
  const badPin=await request('POST','/api/v1/runs',{...created.body,clientRunId:randomUUID(),contentVersion:'r1-content-other'},a.cookie);
  assert.equal(badPin.statusCode,409);assert.equal(badPin.json().error.code,'RUN_VERSION_MISMATCH');
  assert.equal((await request('GET',`/api/v1/runs/${created.run.id}`,undefined,b.cookie)).statusCode,404);
  assert.equal((await request('GET',`/api/v1/runs/${created.run.id}/checkpoint`,undefined,b.cookie)).statusCode,404);
  assert.equal((await request('GET','/api/v1/runs',undefined,a.cookie)).json().runs.length,1);
  assert.equal((await request('GET','/api/v1/runs',undefined,b.cookie)).json().runs.length,0);
  assert.equal((await request('GET','/api/v1/runs?cursor=not-json',undefined,a.cookie)).statusCode,400);
  const unauthorized=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,checkpoint(),b.cookie);
  assert.equal(unauthorized.statusCode,404);
});

test('checkpoint roundtrip uses immutable EAV generations and canonical lost-response repeats',async()=>{
  const user=await guest(),created=await run(user.cookie),body=checkpoint();
  const accepted=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,body,user.cookie);
  assert.equal(accepted.statusCode,200,accepted.body);assert.equal(accepted.json().revision,2);
  const reordered={snapshot:JSON.parse(JSON.stringify(body.snapshot)),snapshotSchemaVersion:2,expectedRevision:1,requestId:body.requestId};
  const repeated=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,reordered,user.cookie);
  assert.equal(repeated.statusCode,200,repeated.body);assert.deepEqual(repeated.json(),accepted.json());
  const loaded=await request('GET',`/api/v1/runs/${created.run.id}/checkpoint`,undefined,user.cookie);
  assert.equal(loaded.statusCode,200,loaded.body);assert.deepEqual(loaded.json().snapshot,body.snapshot);
  const entities=await pool.query(`SELECT entity_type_id,status FROM last_throne.entities WHERE checkpoint_id=$1`,[accepted.json().checkpointId]);
  assert.equal(entities.rows.length,3);assert(entities.rows.every(row=>row.status==='frozen'));
  const next=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,checkpoint(2),user.cookie);
  assert.equal(next.statusCode,200,next.body);assert.notEqual(next.json().checkpointId,accepted.json().checkpointId);
  const oldCount=await pool.query(`SELECT count(*)::int AS count FROM last_throne.entities WHERE checkpoint_id=$1`,[accepted.json().checkpointId]);
  assert.equal(oldCount.rows[0].count,3);
  const change={...body,snapshot:{...body.snapshot,gold:-1}};
  const conflict=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,change,user.cookie);
  assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');
  const changedFormat=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,{...body,snapshotSchemaVersion:1},user.cookie);
  assert.equal(changedFormat.statusCode,409);assert.equal(changedFormat.json().error.code,'IDEMPOTENCY_CONFLICT');
});

test('concurrent tab writes admit one revision and exact concurrent repeats do not duplicate',async()=>{
  const user=await guest(),created=await run(user.cookie),a=checkpoint(),b=checkpoint();
  const racing=await Promise.all([a,b].map(body=>request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,body,user.cookie)));
  assert.deepEqual(racing.map(r=>r.statusCode).sort(),[200,409]);
  const same=checkpoint(2);
  const repeated=await Promise.all([1,2].map(()=>request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,same,user.cookie)));
  assert.deepEqual(repeated.map(r=>r.statusCode),[200,200]);assert.deepEqual(repeated[0].json(),repeated[1].json());
  const status=await request('GET',`/api/v1/runs/${created.run.id}`,undefined,user.cookie);
  assert.equal(status.json().revision,3);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM last_throne.save_operations WHERE run_id=$1',[created.run.id])).rows[0].count,2);
});

test('invalid snapshot phase, pins, seed, pads, duplicate actors and ranges leave revision unchanged',async()=>{
  const user=await guest(),created=await run(user.cookie);
  const invalid=[];
  invalid.push({...snapshot(),phase:'wave'});
  invalid.push({...snapshot(),versions:{...snapshot().versions,metadataSchema:'r0-meta-1'}});
  invalid.push({...snapshot(),seed:43});
  invalid.push({...snapshot(),gold:-1});
  const duplicate=snapshot();duplicate.heroes.push({...duplicate.heroes[0]});invalid.push(duplicate);
  const wrongPad=snapshot();wrongPad.heroes[0].anchorId='pad-n1';invalid.push(wrongPad);
  const badTimer=snapshot();badTimer.heroes[0].abilityCooldown=2147483647;invalid.push(badTimer);
  for(const snap of invalid){const response=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,checkpoint(1,snap),user.cookie);assert.equal(response.statusCode,422,response.body);}
  const wrongFormat=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,{...checkpoint(),snapshotSchemaVersion:1},user.cookie);assert.equal(wrongFormat.statusCode,422);assert.equal(wrongFormat.json().error.code,'VERSION_MISMATCH');
  const state=await request('GET',`/api/v1/runs/${created.run.id}`,undefined,user.cookie);assert.equal(state.json().revision,1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM last_throne.save_operations WHERE run_id=$1',[created.run.id])).rows[0].count,0);
});

test('finish is atomic; post-finish historical checkpoint and finish retries keep terminal status',async()=>{
  const user=await guest(),created=await run(user.cookie),body=checkpoint();
  const saved=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,body,user.cookie);assert.equal(saved.statusCode,200,saved.body);
  const finish=terminal(2);
  const completed=await request('POST',`/api/v1/runs/${created.run.id}/finish`,finish,user.cookie);
  assert.equal(completed.statusCode,200,completed.body);assert.equal(completed.json().revision,3);assert.equal(completed.json().status,'defeat');
  const exact=await request('POST',`/api/v1/runs/${created.run.id}/finish`,finish,user.cookie);assert.deepEqual(exact.json(),completed.json());
  const historical=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,body,user.cookie);assert.deepEqual(historical.json(),saved.json());
  const late=await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,checkpoint(3),user.cookie);assert.equal(late.statusCode,409);assert.equal(late.json().error.code,'RUN_FINISHED');
  const newFinish=await request('POST',`/api/v1/runs/${created.run.id}/finish`,terminal(3),user.cookie);assert.equal(newFinish.statusCode,409);assert.equal(newFinish.json().error.code,'RUN_FINISHED');
  const different={...finish,result:{...finish.result,gold:201}};
  const conflict=await request('POST',`/api/v1/runs/${created.run.id}/finish`,different,user.cookie);assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');
  const negative={...finish,result:{...finish.result,gold:-1}};
  const negativeConflict=await request('POST',`/api/v1/runs/${created.run.id}/finish`,negative,user.cookie);assert.equal(negativeConflict.statusCode,409);assert.equal(negativeConflict.json().error.code,'IDEMPOTENCY_CONFLICT');
  const current=await request('GET',`/api/v1/runs/${created.run.id}`,undefined,user.cookie);assert.equal(current.json().status,'defeat');assert.deepEqual(current.json().result,finish.result);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id JOIN last_throne.entities e ON e.id=v.entity_id WHERE e.run_id=$1 AND p.code='outcome'`,[created.run.id])).rows[0].count,1);
});

test('shared operation IDs collide across checkpoint and finish, including after lost replies',async()=>{
  const user=await guest(),created=await run(user.cookie),body=checkpoint();
  assert.equal((await request('PUT',`/api/v1/runs/${created.run.id}/checkpoint`,body,user.cookie)).statusCode,200);
  const collided=await request('POST',`/api/v1/runs/${created.run.id}/finish`,terminal(2,body.requestId),user.cookie);
  assert.equal(collided.statusCode,409);assert.equal(collided.json().error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await request('GET',`/api/v1/runs/${created.run.id}`,undefined,user.cookie)).json().status,'active');
});

test('write origin, body limit and dependency errors are bounded and expose no secrets',async()=>{
  const user=await guest();
  const rejected=await request('PATCH','/api/v1/profile',{expectedRevision:1,settings:{volume:1}},user.cookie,{origin:'https://attacker.test'});
  assert.equal(rejected.statusCode,403);assert.equal(rejected.json().error.code,'ORIGIN_REJECTED');
  const absent=await app.inject({method:'POST',url:'/api/v1/guest-session',headers:{host:'game.test'}});assert.equal(absent.statusCode,403);
  const oversized=await request('PUT',`/api/v1/runs/${randomUUID()}/checkpoint`,{...checkpoint(),snapshot:{data:'x'.repeat(280000)}},user.cookie);assert.equal(oversized.statusCode,413);
  unavailable=true;
  try {const response=await request('GET','/api/v1/profile',undefined,user.cookie);assert.equal(response.statusCode,503);assert(!response.body.includes('secret-password'));assert.equal(response.json().error.requestId,response.headers['x-request-id']);}
  finally{unavailable=false;}
  assert.equal((await request('GET','/api/v1/ready')).statusCode,200);
});

test('guest creation throttles are separate, bounded and report retry delay',async()=>{
  const limited=await createApp({pool,releasesDir:dir,releaseId:'r1-api-test',publicOrigin:origin,rateLimits:{guest:1,maxBuckets:2}});
  try {
    assert.equal((await limited.inject({method:'POST',url:'/api/v1/guest-session',headers})).statusCode,201);
    const second=await limited.inject({method:'POST',url:'/api/v1/guest-session',headers});assert.equal(second.statusCode,429);assert.equal(second.json().error.code,'RATE_LIMITED');assert(Number(second.headers['retry-after'])>0);
  } finally{await limited.close();}
});
