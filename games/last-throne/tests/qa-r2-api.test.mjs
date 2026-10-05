// Independent mixed-generation HTTP and EAV scenarios. Fastify injection + fresh real PGlite SQL, no VPS claim.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {fixtureRelease} from './fixtures.mjs';
import {createGameStore} from '../db/game-store.mjs';
import {readContent,canonicalJson} from '../db/content.mjs';
import {seedR2} from '../db/seed-r2.mjs';
import {parseContentProjection,contentRows} from '../core/content-r2.ts';
import {createGame,createSnapshot,restoreSnapshot,submitCommand} from '../core/game-core-r2.ts';
import {parseContentProjection as parseR1} from '../core/content-r1.ts';
import {createGame as gameR1,createSnapshot as snapshotR1} from '../core/game-core.ts';
let db,pool,app,dir,content,oldContent,store;
const hash=x=>createHash('sha256').update(canonicalJson(x)).digest('hex');
const pins={clientReleaseId:'r2-qa-http',coreVersion:'r2-core-1',contentVersion:'r2-content-1',metadataSchemaVersion:'r2-meta-1',snapshotSchemaVersion:3};
before(async()=>{
 db=new PGlite();const query=async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)||{rows:[]};pool={query,connect:async()=>({query,release(){}})};await migrate(pool);store=createGameStore(pool);
 content=parseContentProjection(await readContent(pool,'r2-content-1'));oldContent=parseR1(await readContent(pool,'r1-content-1'));
 dir=await mkdtemp(join(tmpdir(),'qa-r2-http-'));
 const compatibility={compatibleApi:[1],compatibleSaveFormats:[1,2,3],compatibleMetadataSchemas:['r0-meta-1','r1-meta-1','r2-meta-1'],compatibleClientReleases:['*','r1-*','r2-*'],rollbackMode:'frontend_only'};
 for(const family of ['r1','r2'])await fixtureRelease(dir,`${family}-qa-http`,{...compatibility,versions:{frontend:`${family}-web-qa`,backend:'r2-api-qa',core:`${family}-core-1`,content:`${family}-content-1`,metadataSchema:`${family}-meta-1`,saveFormat:family==='r1'?2:3,api:1}});
 app=await createApp({pool,releasesDir:dir,releaseId:'r2-qa-http',publicOrigin:'http://localhost',secureCookies:false});await app.ready();
});
after(async()=>{await app?.close();await db?.close();if(dir)await rm(dir,{recursive:true,force:true});});
async function request(method,url,cookie,payload){return app.inject({method,url,headers:{origin:'http://localhost',...(cookie?{cookie}:{})},...(payload===undefined?{}:{payload})});}
async function guest(){const r=await request('POST','/api/v1/guest-session',null,{});assert.equal(r.statusCode,201);return{cookie:r.headers['set-cookie'].split(';')[0],owner:r.json().profileId};}
async function newRun(cookie,family='r2',seed=7721){const payload={clientRunId:randomUUID(),clientReleaseId:`${family}-qa-http`,coreVersion:`${family}-core-1`,contentVersion:`${family}-content-1`,seed};const r=await request('POST','/api/v1/runs',cookie,payload);assert.equal(r.statusCode,201,r.body);return r.json();}
const envelope=snapshot=>({requestId:randomUUID(),expectedRevision:1,snapshotSchemaVersion:snapshot.schemaVersion,snapshot});

test('QA R2 HTTP mixed owner history preserves R1/save2 while R2/save3 carries new scalar state',async()=>{
 const {cookie}=await guest(),r1=await newRun(cookie,'r1'),r2=await newRun(cookie),s1=snapshotR1(gameR1(oldContent,7721)),s2=createSnapshot(createGame(content,7721));
 s2.heroes.find(h=>h.kind==='rubick').stolenSpell='temporary_shield';s2.heroes.find(h=>h.kind==='rubick').stealCooldown=103;s2.heroes.find(h=>h.kind==='rubick').abilityCooldown=51;s2.heroes.find(h=>h.kind==='sniper').priority='strongest';
 const oldBody=envelope(s1),newBody=envelope(s2);assert.equal((await request('PUT',`/api/v1/runs/${r1.id}/checkpoint`,cookie,oldBody)).statusCode,200);assert.equal((await request('PUT',`/api/v1/runs/${r2.id}/checkpoint`,cookie,newBody)).statusCode,200);
 const oldRead=(await request('GET',`/api/v1/runs/${r1.id}/checkpoint`,cookie)).json(),newRead=(await request('GET',`/api/v1/runs/${r2.id}/checkpoint`,cookie)).json();assert.deepEqual(oldRead.snapshot,s1);assert.deepEqual(newRead.snapshot,s2);
 const restored=restoreSnapshot(content,newRead.snapshot);assert.equal(restored.heroes.find(h=>h.kind==='rubick').stolenSpell,'temporary_shield');assert.equal(restored.heroes.find(h=>h.kind==='sniper').priority,'strongest');
 const mixed=(await request('GET','/api/v1/runs',cookie)).json();const text=JSON.stringify(mixed);assert(text.includes(r1.id)&&text.includes(r2.id));assert.equal(oldRead.snapshot.schemaVersion,2);assert.equal(oldContent.waves.length,5);assert.equal(oldContent.heroes.length,2);assert.equal(content.waves.length,10);
 const wrongToR1=await request('PUT',`/api/v1/runs/${r1.id}/checkpoint`,cookie,{...newBody,requestId:randomUUID(),expectedRevision:2});assert.equal(wrongToR1.statusCode,422);
 const wrongToR2=await request('PUT',`/api/v1/runs/${r2.id}/checkpoint`,cookie,{...oldBody,requestId:randomUUID(),expectedRevision:2});assert.equal(wrongToR2.statusCode,422);assert.deepEqual((await request('GET',`/api/v1/runs/${r1.id}/checkpoint`,cookie)).json(),oldRead);
 const boot=(await request('GET','/api/v1/bootstrap?clientReleaseId=r1-qa-http',cookie)).json();assert.equal(boot.clientReleaseId,'r1-qa-http');assert.equal(boot.versions.saveFormat,2);assert.equal(boot.versions.core,'r1-core-1');
});

test('QA R2 HTTP exact replay precedes stale revision/terminal but not owner or canonical identity',async()=>{
 const a=await guest(),b=await guest(),r=await newRun(a.cookie),s=createSnapshot(createGame(content,7721)),saved=envelope(s),url=`/api/v1/runs/${r.id}/checkpoint`;
 const first=await request('PUT',url,a.cookie,saved);assert.equal(first.statusCode,200,first.body);const response=first.json();
 const stale=await request('PUT',url,a.cookie,{...saved,requestId:randomUUID()});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'REVISION_CONFLICT');
 const forbidden=await request('PUT',url,b.cookie,saved);assert.equal(forbidden.statusCode,404);assert.equal((await request('GET',url,b.cookie)).statusCode,404);
 const collision=await request('PUT',url,a.cookie,{...saved,snapshot:{...s,gold:s.gold+1}});assert.equal(collision.statusCode,409);assert.equal(collision.json().error.code,'IDEMPOTENCY_CONFLICT');
 const end={requestId:randomUUID(),expectedRevision:2,result:{outcome:'defeat',wave:1,lastCompletedWave:0,simTick:1000,gold:s.gold,throneHp:0,seed:s.seed,versions:s.versions,statistics:s.statistics}};
 const terminal=await request('POST',`/api/v1/runs/${r.id}/finish`,a.cookie,end);assert.equal(terminal.statusCode,200,terminal.body);
 const replay=await request('PUT',url,a.cookie,saved);assert.equal(replay.statusCode,200);assert.deepEqual(replay.json(),response);
 const newLate=await request('PUT',url,a.cookie,{...saved,requestId:randomUUID(),expectedRevision:3});assert.equal(newLate.statusCode,409);assert.equal(newLate.json().error.code,'RUN_FINISHED');
 assert.deepEqual((await request('POST',`/api/v1/runs/${r.id}/finish`,a.cookie,end)).json(),terminal.json());const run=(await request('GET',`/api/v1/runs/${r.id}`,a.cookie)).json();assert.equal(run.status,'defeat');assert.equal(run.revision,3);assert.equal((await request('GET',url,a.cookie)).json().revision,2);
});

test('QA R2 SQL late scalar write failure leaves complete old generation and request reusable',async()=>{
 const {owner}=await guest(),r=await store.createRun(owner,{clientRunId:randomUUID(),clientReleaseId:pins.clientReleaseId,coreVersion:pins.coreVersion,contentVersion:pins.contentVersion,seed:7721},pins),g=createGame(content,7721);
 for(const [n,padId]of ['pad-n1','pad-m1','pad-s1'].entries())submitCommand(g,{commandId:`build-${n}`,sequence:n,tick:0,type:'build',payload:{padId,kind:'ballista'}});
 const s=createSnapshot(g),one={requestId:randomUUID(),expectedRevision:1},first=await store.commitCheckpoint(owner,r.id,one,hash([one,s]),s);
 const oldRows=(await pool.query('SELECT id,revision,status FROM last_throne.entities WHERE checkpoint_id=$1 ORDER BY id',[first.checkpointId])).rows;
 const broken=structuredClone(s);delete broken.buildings.at(-1).spentGold;const next={requestId:randomUUID(),expectedRevision:2};await assert.rejects(()=>store.commitCheckpoint(owner,r.id,next,hash([next,broken]),broken));
 assert.deepEqual((await pool.query('SELECT id,revision,status FROM last_throne.entities WHERE checkpoint_id=$1 ORDER BY id',[first.checkpointId])).rows,oldRows);assert.equal((await store.getCheckpoint(owner,r.id)).checkpointId,first.checkpointId);assert.equal((await pool.query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1',[r.id])).rows[0].n,1);
 const corrected=await store.commitCheckpoint(owner,r.id,next,hash([next,s]),s);assert.equal(corrected.revision,3);assert.notEqual(corrected.checkpointId,first.checkpointId);
 const savedHero=(await pool.query("SELECT id FROM last_throne.entities WHERE checkpoint_id=$1 AND entity_type_id=last_throne.r2_type('saved_hero') LIMIT 1",[first.checkpointId])).rows[0].id;
 await pool.query('BEGIN');try{const cp=randomUUID();await pool.query("SELECT last_throne.r2_new('checkpoint',$1,$2,$3,$1,'r2-content-1')",[cp,owner,r.id]);await assert.rejects(()=>pool.query("SELECT last_throne.r2_set($1,'heroes',to_jsonb($2::uuid),0)",[cp,savedHero]),/REFERENCE_SCOPE_MISMATCH|reference.*checkpoint|scope/i);}finally{await pool.query('ROLLBACK');}
});

test('QA R2 publishing unknown stolen behavior fails atomically before any published catalog exists',async()=>{
 const isolated=new PGlite(),query=async(sql,params)=>params?isolated.query(sql,params):(await isolated.exec(sql)).at(-1)||{rows:[]},p={query,connect:async()=>({query,release(){}})};
 try{for(const name of ['001_typed_eav.sql','002_r0_catalog.sql','003_r1_persistence.sql','004_r1_catalog.sql','005_r2_persistence.sql'])await isolated.exec(await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8'));
  const bad=contentRows();bad.find(r=>r.type==='spell_definition').parameters.behavior_id='arbitrary_code';await assert.rejects(()=>seedR2(p,bad));
  assert.equal((await query("SELECT count(*)::int n FROM last_throne.content_releases WHERE content_version='r2-content-1'")).rows[0].n,0);assert.equal((await query("SELECT status FROM last_throne.metadata_schema_versions WHERE version='r2-meta-1'")).rows[0].status,'draft');
  await seedR2(p,contentRows());assert.equal((await readContent(p,'r2-content-1')).entities.filter(e=>e.type==='spell_definition').length,3);
 }finally{await isolated.close();}
});
