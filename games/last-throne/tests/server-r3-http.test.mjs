import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {fixtureRelease} from './fixtures.mjs';
import {createApp} from '../server/app.mjs';
import {canonicalJson} from '../db/content.mjs';
import {operationHash} from '../server/http-support.mjs';
import {openapiR3} from '../server/openapi-r3.mjs';
import {defaultR1Content,parseContentProjection as parseR1} from '../core/content-r1.ts';
import {createGame as gameR1,createSnapshot as snapR1} from '../core/game-core.ts';
import {defaultR2Content,parseContentProjection as parseR2} from '../core/content-r2.ts';
import {createGame as gameR2,createSnapshot as snapR2} from '../core/game-core-r2.ts';
import {defaultR3Content,parseContentProjection as parseR3} from '../core/content-r3.ts';
import {createGame,createSnapshot,submitCommand,validateSnapshot} from '../core/game-core-r3.ts';

const origin='https://game.test',headers={host:'game.test',origin};
const versions=family=>({frontend:`${family}-web-1`,backend:'r3-api-1',core:`${family}-core-1`,content:`${family}-content-1`,metadataSchema:`${family}-meta-1`,saveFormat:Number(family[1])+1,api:1});
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
let db,dir,app;let tail=Promise.resolve();
async function acquire(){const previous=tail;let release;tail=new Promise(resolve=>release=resolve);await previous;return release;}
const raw=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1)??{rows:[]};
const pool={query:async(...args)=>{const release=await acquire();try{return await raw(...args);}finally{release();}},connect:async()=>{const release=await acquire();return{query:raw,release};}};
const fresh=family=>family==='r1'?snapR1(gameR1(defaultR1Content,42)):family==='r2'?snapR2(gameR2(defaultR2Content,42)):createSnapshot(createGame(defaultR3Content,42));
const checkpoint=(snapshot=fresh('r3'),revision=1)=>({requestId:randomUUID(),expectedRevision:revision,snapshotSchemaVersion:snapshot.schemaVersion,snapshot});
const result=(family='r3',outcome='defeat')=>({outcome,wave:outcome==='victory'?Number(family[1])*5:1,lastCompletedWave:outcome==='victory'?Number(family[1])*5:0,simTick:900,gold:200,throneHp:outcome==='victory'?100:0,seed:42,versions:{core:versions(family).core,content:versions(family).content,metadataSchema:versions(family).metadataSchema},statistics:{kills:3,builds:1,upgrades:0,goldEarned:36}});
const finish=(revision=1,value=result())=>({requestId:randomUUID(),expectedRevision:revision,result:value});
const request=(method,url,body,cookie,extra={})=>app.inject({method,url,headers:{...headers,...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{payload:body})});
async function guest(){const response=await request('POST','/api/v1/guest-session');assert.equal(response.statusCode,201,response.body);assert.match(response.headers['set-cookie'],/Path=\/td; HttpOnly; Secure; SameSite=Lax/);return{id:response.json().profileId,cookie:response.headers['set-cookie'].split(';')[0]};}
async function run(cookie,family='r3',overrides={}){const v=versions(family),body={clientRunId:randomUUID(),clientReleaseId:`${family}-api-test`,coreVersion:v.core,contentVersion:v.content,seed:42,...overrides},response=await request('POST','/api/v1/runs',body,cookie);assert.equal(response.statusCode,201,response.body);return{...response.json(),body};}
function nested(pending=false){const game=createGame(defaultR3Content,42);let sequence=0;
 for(const [actorId,itemId,slot] of [['pudge','sight_gem',0],['pudge','healing_lantern',1],['shaman','split_charm',0]])assert.equal(submitCommand(game,{commandId:`equip-${++sequence}`,tick:0,sequence,type:'equip_item',actorId,payload:{itemId,slot}}).status,'accepted');
 if(!pending)assert.equal(submitCommand(game,{commandId:'camp',tick:0,sequence:++sequence,type:'send_expedition',actorId:'undying',payload:{kind:'camp'}}).status,'accepted');
 const snapshot=createSnapshot(game);snapshot.heroes.find(h=>h.kind==='sniper').aegisToken=true;
 if(pending)snapshot.pendingRewards=[{id:'choice-http',heroId:'rubick',kind:'shop',options:[...defaultR3Content.expeditions.find(e=>e.kind==='shop').itemOptions]}];
 assert.equal(validateSnapshot(snapshot,defaultR3Content).valid,true);return snapshot;}
before(async()=>{
 db=new PGlite();dir=await mkdtemp(join(tmpdir(),'td-r3-http-'));await migrate(pool);
 const compatibility={rollbackMode:'frontend_only',compatibleApi:[1],compatibleSaveFormats:[1,2,3,4],compatibleMetadataSchemas:['r0-meta-1','r1-meta-1','r2-meta-1','r3-meta-1'],compatibleClientReleases:['*','r1-*','r2-*','r3-api-test','r3-mixed','r3-unlisted-test']};
 await fixtureRelease(dir,'r0-retained');for(const family of ['r1','r2','r3'])await fixtureRelease(dir,`${family}-api-test`,{...compatibility,versions:versions(family)});
 await fixtureRelease(dir,'r3-mixed',{...compatibility,versions:{...versions('r3'),metadataSchema:'r2-meta-1'}});
 await fixtureRelease(dir,'r3-not-declared',{...compatibility,versions:versions('r3')});
 app=await createApp({pool,releasesDir:dir,releaseId:'r3-api-test',publicOrigin:origin});
});
after(async()=>{await app?.close();await db?.close();if(dir)await rm(dir,{recursive:true,force:true});});

test('R3 readiness and bootstrap expose exact tuples and retained 5/10-wave catalogs',async()=>{
 assert.equal((await request('GET','/api/v1/ready')).statusCode,200);const version=(await request('GET','/api/v1/version')).json();assert.equal(version.stage,'R3');assert.deepEqual(version.compatibleSaveFormats,[1,2,3,4]);
 for(const [family,parse,waves] of [['r1',parseR1,5],['r2',parseR2,10],['r3',parseR3,15]]) {
  const bootstrap=await request('GET',`/api/v1/bootstrap?clientReleaseId=${family}-api-test`);assert.equal(bootstrap.statusCode,200,bootstrap.body);assert.deepEqual(bootstrap.json().versions,versions(family));assert.deepEqual(bootstrap.json().capabilities,{battle:true,profiles:true,cloudSaves:true});
  const content=await request('GET',`/api/v1/content?clientReleaseId=${family}-api-test`);assert.equal(content.statusCode,200,content.body);const compiled=parse(content.json());assert.equal(compiled.waves.length,waves);
  if(family==='r3'){assert.equal(compiled.items.length,4);assert.equal(compiled.expeditions.length,3);assert.ok(compiled.map.sidePath.length);assert.equal(content.headers.etag,'"sha256-6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5"');}
  assert.equal((await request('GET',`/api/v1/content/${family}-content-1`,undefined,undefined,{'if-none-match':content.headers.etag})).statusCode,304);
 }
 assert.equal((await request('GET','/api/v1/bootstrap?clientReleaseId=r0-retained')).json().capabilities.battle,false);
 for(const id of ['r3-mixed','r3-not-declared'])assert.equal((await request('GET',`/api/v1/bootstrap?clientReleaseId=${id}`)).statusCode,409);
});

test('retained R1/R2 use exact validators and historical hash forms, with mixed owned history',async()=>{
 const owner=await guest();for(const family of ['r1','r2']) {
  const current=await run(owner.cookie,family),body=checkpoint(fresh(family));
  assert.equal(operationHash('checkpoint',current.id,body),hash({canonicalization:1,operation:'checkpoint',runId:current.id,snapshotSchemaVersion:body.snapshotSchemaVersion,body}));
  const saved=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie);assert.equal(saved.statusCode,200,saved.body);
  const loaded=await request('GET',`/api/v1/runs/${current.id}/checkpoint`,undefined,owner.cookie);assert.deepEqual(loaded.json().snapshot,body.snapshot);
  const wrong=checkpoint(fresh(family),2);wrong.snapshot.heroes[0].items=[null,null];
  assert.equal((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,wrong,owner.cookie)).statusCode,422);
  const terminal=finish(2,result(family,'victory'));assert.equal((await request('POST',`/api/v1/runs/${current.id}/finish`,terminal,owner.cookie)).statusCode,200);
  const repeat=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie);assert.deepEqual(repeat.json(),saved.json());
 }
 const current=await run(owner.cookie),body=checkpoint(nested());const saved=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie);assert.equal(saved.statusCode,200,saved.body);
 const loaded=(await request('GET',`/api/v1/runs/${current.id}/checkpoint`,undefined,owner.cookie)).json();assert.deepEqual(loaded.snapshot,body.snapshot);assert.equal(loaded.snapshotSchemaVersion,4);
 const history=(await request('GET','/api/v1/runs',undefined,owner.cookie)).json();assert.deepEqual(new Set(history.runs.map(r=>r.snapshotSchemaVersion)),new Set([2,3,4]));
 const other=await guest();for(const path of ['', '/checkpoint'])assert.equal((await request('GET',`/api/v1/runs/${current.id}${path}`,undefined,other.cookie)).statusCode,404);
 assert.equal((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,other.cookie)).statusCode,404);
 assert.equal((await request('POST',`/api/v1/runs/${current.id}/finish`,finish(2),other.cookie)).statusCode,404);
});

test('R3 pending choice and Aegis round trip; exact request replay survives newer generation and finish',async()=>{
 const owner=await guest(),current=await run(owner.cookie),body=checkpoint(nested(true));
 const first=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie);assert.equal(first.statusCode,200,first.body);
 assert.deepEqual((await request('GET',`/api/v1/runs/${current.id}/checkpoint`,undefined,owner.cookie)).json().snapshot,body.snapshot);
 const next=checkpoint(fresh('r3'),2);assert.equal((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,next,owner.cookie)).statusCode,200);
 assert.deepEqual((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie)).json(),first.json());
 const changed={...body,snapshot:{...body.snapshot,pendingRewards:[{id:'invalid'}]}};const conflict=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,changed,owner.cookie);assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');
 const terminal=finish(3);const done=await request('POST',`/api/v1/runs/${current.id}/finish`,terminal,owner.cookie);assert.equal(done.statusCode,200,done.body);
 assert.deepEqual((await request('POST',`/api/v1/runs/${current.id}/finish`,terminal,owner.cookie)).json(),done.json());assert.deepEqual((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie)).json(),first.json());
 const latest=(await request('GET',`/api/v1/runs/${current.id}/checkpoint`,undefined,owner.cookie)).json();assert.equal(latest.revision,3);assert.equal(latest.runRevision,4);assert.deepEqual(latest.snapshot,next.snapshot);
 const terminalSave=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,{...checkpoint(fresh('r3'),4),snapshot:{invalid:true}},owner.cookie);assert.equal(terminalSave.statusCode,409);assert.equal(terminalSave.json().error.code,'RUN_FINISHED');
});

test('R3 core validation rejects item incompatibility, unknown refs, wrong options, reward owner and excursion state atomically',async()=>{
 const owner=await guest(),current=await run(owner.cookie);
 const changes=[s=>s.heroes.find(h=>h.kind==='pudge').items=['split_charm',null],s=>s.heroes[0].items=['arbitrary_item',null],s=>s.heroes[0].items=[null],s=>s.heroes[0].aegisToken=1,s=>s.pendingRewards[0].options.reverse(),s=>s.pendingRewards[0].heroId='foreign',s=>s.heroes[0].expedition={kind:'camp',remainingTicks:1,totalTicks:300,rewardId:'camp'},s=>s.pendingRewards.push({...s.pendingRewards[0],id:'second'})];
 for(const change of changes){const invalid=nested(true);change(invalid);const response=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,checkpoint(invalid),owner.cookie);assert.equal(response.statusCode,422,response.body);assert.equal(response.json().error.code,'SNAPSHOT_INVALID');assert.equal((await request('GET',`/api/v1/runs/${current.id}`,undefined,owner.cookie)).json().revision,1);assert.equal((await request('GET',`/api/v1/runs/${current.id}/checkpoint`,undefined,owner.cookie)).json(),null);}
 const wrongFormat=checkpoint(fresh('r3'));wrongFormat.snapshotSchemaVersion=3;assert.equal((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,wrongFormat,owner.cookie)).statusCode,422);
 const wrongPins=checkpoint(fresh('r3'));wrongPins.snapshot.versions.content='r2-content-1';assert.equal((await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,wrongPins,owner.cookie)).statusCode,422);
 assert.equal((await pool.query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1',[current.id])).rows[0].n,0);
});

test('R3 finish refuses premature victory and shares operation IDs with checkpoints',async()=>{
 const owner=await guest(),current=await run(owner.cookie),premature=result('r3','victory');premature.wave=10;premature.lastCompletedWave=10;
 const refused=await request('POST',`/api/v1/runs/${current.id}/finish`,finish(1,premature),owner.cookie);assert.equal(refused.statusCode,422);assert.equal(refused.json().error.code,'RESULT_INVALID');
 const body=checkpoint(),saved=await request('PUT',`/api/v1/runs/${current.id}/checkpoint`,body,owner.cookie);assert.equal(saved.statusCode,200);
 const shared=finish(2);shared.requestId=body.requestId;const conflict=await request('POST',`/api/v1/runs/${current.id}/finish`,shared,owner.cookie);assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'IDEMPOTENCY_CONFLICT');
 const terminal=finish(2,result('r3','victory')),done=await request('POST',`/api/v1/runs/${current.id}/finish`,terminal,owner.cookie);assert.equal(done.statusCode,200,done.body);const state=(await request('GET',`/api/v1/runs/${current.id}`,undefined,owner.cookie)).json();assert.equal(state.status,'victory');assert.equal(state.result.wave,15);
});

test('R3 integrity failure prevents data and matching ETag304 and makes bootstrap/readiness unavailable',async()=>{
 const valid=await request('GET','/api/v1/content/r3-content-1');assert.equal(valid.statusCode,200);
 try {
  await raw('ALTER TABLE last_throne.entity_parameter_values DISABLE TRIGGER USER');
  await raw("UPDATE last_throne.entity_parameter_values v SET integer_value=integer_value+1 FROM last_throne.entities e,last_throne.entity_parameters p WHERE v.entity_id=e.id AND v.parameter_id=p.id AND e.release_id='r3-content-1' AND p.code='initial_gold'");
  const response=await request('GET','/api/v1/content/r3-content-1',undefined,undefined,{'if-none-match':valid.headers.etag});assert.equal(response.statusCode,503);assert.equal(response.json().error.code,'CONTENT_VERSION_UNAVAILABLE');assert.equal(response.headers.etag,undefined);assert.doesNotMatch(response.body,/SELECT|projection_hash|integer_value|last_throne/);
  assert.equal((await request('GET','/api/v1/ready')).statusCode,503);assert.equal((await request('GET','/api/v1/bootstrap?clientReleaseId=r3-api-test')).statusCode,503);
 } finally {
  await raw("UPDATE last_throne.entity_parameter_values v SET integer_value=integer_value-1 FROM last_throne.entities e,last_throne.entity_parameters p WHERE v.entity_id=e.id AND v.parameter_id=p.id AND e.release_id='r3-content-1' AND p.code='initial_gold'");
  await raw('ALTER TABLE last_throne.entity_parameter_values ENABLE TRIGGER USER');
 }
 assert.equal((await request('GET','/api/v1/ready')).statusCode,200);
});

test('R3 OpenAPI JSON matches its generated contract with exact retained and nested schema variants',async()=>{
 assert.deepEqual(JSON.parse(await readFile(new URL('../server/openapi-r3.json',import.meta.url),'utf8')),openapiR3);
 assert.equal(openapiR3.components.schemas.GameSnapshot.oneOf.length,3);const snapshot=openapiR3.components.schemas.R3Snapshot;assert.equal(snapshot.properties.schemaVersion.const,4);assert.equal(snapshot.properties.heroes.items.properties.items.minItems,2);assert.equal(snapshot.properties.pendingRewards.maxItems,1);
 assert.equal(openapiR3.paths['/runs/{id}/checkpoint'].put.requestBody.content['application/json'].schema.properties.snapshot.additionalProperties,undefined);
});
