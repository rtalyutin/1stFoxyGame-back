// Independent held-out cases, derived from TZ v0.3 rather than author test outcomes.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createGameStore} from '../db/game-store.mjs';
import {readContent,canonicalJson} from '../db/content.mjs';
import {parseContentProjection,defaultR1Content} from '../core/content-r1.ts';
import {createGame,submitCommand,advanceTicks,drainEvents,createSnapshot,restoreSnapshot,getFinishResult,validateSnapshot} from '../core/game-core.ts';
import {verifyRelease} from '../ops/artifacts.mjs';
let db,store,content;
const query=async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)||{rows:[]};
const pool={query,connect:async()=>({query,release(){}})};
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const pins={clientReleaseId:'r1-qa-independent',coreVersion:'r1-core-1',contentVersion:'r1-content-1',metadataSchemaVersion:'r1-meta-1',snapshotSchemaVersion:2};
before(async()=>{db=new PGlite();await migrate(pool);store=createGameStore(pool);content=parseContentProjection(await readContent(pool,pins.contentVersion));});
after(async()=>{await db?.close();});
const guest=async()=> (await store.createGuest(hash(randomUUID()),new Date(Date.now()+600000).toISOString())).profileId;
const run=(owner,seed=918273)=>store.createRun(owner,{clientRunId:randomUUID(),clientReleaseId:pins.clientReleaseId,coreVersion:pins.coreVersion,contentVersion:pins.contentVersion,seed},pins);
function controls(game){let sequence=0;return(type,payload={},actorId)=>{const command={commandId:`independent-${sequence}`,tick:game.simTick+(game.phase==='wave'?1:0),sequence:sequence++,type,payload,...(actorId?{actorId}:{})};return{command,result:submitCommand(game,command)};};}
function opening(game,send){for(const [padId,kind] of [['pad-n1','magic_tower'],['pad-s1','magic_tower'],['pad-m2','ballista'],['pad-m1','ballista']])assert.equal(send('build',{padId,kind}).result.status,'accepted');assert.equal(send('upgrade',{},'pudge').result.status,'accepted');}

test('QA held-out EAV-driven five-wave path: ledger, immutable checkpoints and one terminal',async()=>{
 const g=createGame(content,918273),send=controls(g),history=[],frozen=[];opening(g,send);assert.equal(g.gold,20);
 for(let wave=1;wave<=5;wave++){
  if(wave===5)assert.equal(send('teleport',{anchorId:'anchor-m1'},'pudge').result.status,'accepted');
  if(wave>1){for(const b of g.buildings){const d=content.buildings.find(d=>d.kind===b.kind);if(b.level<2&&g.gold>=d.upgradeCosts[b.level-1])send('upgrade',{},b.id);}if(g.gold>=140&&!g.buildings.some(b=>b.padId==='pad-n3'))send('build',{padId:'pad-n3',kind:'magic_tower'});if(g.gold>=100&&!g.buildings.some(b=>b.padId==='pad-s3'))send('build',{padId:'pad-s3',kind:'ballista'});}
  const checkpoint=createSnapshot(g);frozen.push({checkpoint,text:canonicalJson(checkpoint)});send('start_wave');
  if(wave===1){advanceTicks(g,50);const target=g.enemies.find(e=>e.lane===1);assert(target);const hook=send('cast',{targetId:target.id},'pudge');assert.equal(hook.result.status,'queued');assert.deepEqual(submitCommand(g,hook.command),hook.result);send('cast',{x:160,y:-460},'shaman');}
  if(wave===4){assert(g.gold>=content.scrollCost);send('buy_scroll');const teleport=send('teleport',{anchorId:'anchor-s2'},'pudge');assert.deepEqual(submitCommand(g,teleport.command),teleport.result);}
  advanceTicks(g,20000);history.push(...drainEvents(g));
  assert.equal(g.lastCompletedWave,wave);assert.equal(g.phase,wave===5?'victory':'preparation');assert.equal(g.summons.length,0);assert.equal(g.projectiles.length,0);assert(g.buildings.every(b=>b.constructionTicks===0));
  for(const old of frozen)assert.equal(canonicalJson(old.checkpoint),old.text,'later combat mutated an old checkpoint');
  if(wave<5)assert(validateSnapshot(createSnapshot(g),content).valid);
 }
 assert.equal(g.gold,content.initialGold+history.filter(e=>e.type==='gold_changed').reduce((sum,e)=>sum+e.amount,0));
 assert.deepEqual(history.filter(e=>e.type==='wave_finished').map(e=>e.wave),[1,2,3,4,5]);
 const deaths=history.filter(e=>e.type==='unit_died'&&e.sourceId.startsWith('enemy-'));assert.equal(new Set(deaths.map(e=>e.sourceId)).size,deaths.length);assert.equal(g.statistics.kills,deaths.length);
 assert.equal(history.filter(e=>e.type==='run_finished').length,1);assert.equal(getFinishResult(g).outcome,'victory');assert.throws(()=>createSnapshot(g),/UNSAFE_CHECKPOINT/);
 assert.equal(history.filter(e=>e.type==='cast_started'&&e.effectId==='hook_cast').length,1);assert.equal(history.filter(e=>e.type==='summon_created').length,4);assert.equal(history.filter(e=>e.type==='teleport_started').length,1);assert.equal(g.scrolls,0);
 const terminal=canonicalJson(getFinishResult(g));advanceTicks(g,9999);send('start_wave');assert.equal(canonicalJson(getFinishResult(g)),terminal);
});

test('QA checkpoint restore preserves integer state across step batching and exact prior command rejection',()=>{
 const g=createGame(content,31337),send=controls(g);opening(g,send);send('start_wave');advanceTicks(g,20000);assert.equal(g.phase,'preparation');
 const checkpoint=createSnapshot(g),a=restoreSnapshot(content,checkpoint),b=restoreSnapshot(content,checkpoint);assert.equal(a.commandEpoch,checkpoint.commandEpoch+1);
 const command={commandId:'same-fresh-command',tick:a.simTick,sequence:0,type:'start_wave',payload:{}};submitCommand(a,command);submitCommand(b,command);
 const queued={commandId:'sell-rejected-during-wave',tick:a.simTick+300,sequence:1,type:'sell',actorId:a.buildings[0].id,payload:{}};submitCommand(a,queued);submitCommand(b,queued);
 for(let i=0;i<20000&&a.phase==='wave';i++)advanceTicks(a,1);while(b.phase==='wave')advanceTicks(b,137);
 assert.deepEqual(createSnapshot(a),createSnapshot(b));assert.equal(submitCommand(a,queued).code,'PREPARATION_ONLY');assert.equal(a.phase,'preparation');assert.equal(a.buildings.length,4);
});

test('QA late partial checkpoint failure cannot publish child prefix; corrected same request can commit',async()=>{
 const owner=await guest(),r=await run(owner),g=createGame(content,918273),send=controls(g);opening(g,send);const initial=createSnapshot(g);
 const e1={requestId:randomUUID(),expectedRevision:1};const old=await store.commitCheckpoint(owner,r.id,e1,hash(['checkpoint',e1,initial]),initial);
 const oldRows=(await query('SELECT id,revision,status FROM last_throne.entities WHERE checkpoint_id=$1 ORDER BY id',[old.checkpointId])).rows;
 const broken=structuredClone(initial);delete broken.buildings.at(-1).spentGold;const e2={requestId:randomUUID(),expectedRevision:2};
 await assert.rejects(()=>store.commitCheckpoint(owner,r.id,e2,hash(['checkpoint',e2,broken]),broken));
 assert.deepEqual((await query('SELECT id,revision,status FROM last_throne.entities WHERE checkpoint_id=$1 ORDER BY id',[old.checkpointId])).rows,oldRows);
 assert.equal((await store.getCheckpoint(owner,r.id)).checkpointId,old.checkpointId);
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.entities WHERE run_id=$1 AND checkpoint_id IS NOT NULL',[r.id])).rows[0].n,oldRows.length);
 assert.equal((await query('SELECT count(*)::int n FROM last_throne.save_operations WHERE run_id=$1',[r.id])).rows[0].n,1);
 const corrected=await store.commitCheckpoint(owner,r.id,e2,hash(['checkpoint',e2,initial]),initial);assert.equal(corrected.revision,3);assert.notEqual(corrected.checkpointId,old.checkpointId);
});

test('QA current R1 metadata rejects cross-generation hero references even for same owner/run',async()=>{
 const owner=await guest(),r=await run(owner),s=createSnapshot(createGame(content,918273));const e={requestId:randomUUID(),expectedRevision:1};const committed=await store.commitCheckpoint(owner,r.id,e,hash(e),s);
 const hero=(await query("SELECT id FROM last_throne.entities WHERE checkpoint_id=$1 AND entity_type_id=last_throne.r1_type('saved_hero') LIMIT 1",[committed.checkpointId])).rows[0].id;
 const proposed=randomUUID();await query('BEGIN');
 try{await query("SELECT last_throne.r1_new('checkpoint',$1,$2,$3,$1,'r1-content-1')",[proposed,owner,r.id]);await assert.rejects(()=>query("SELECT last_throne.r1_set($1,'heroes',to_jsonb($2::uuid),0)",[proposed,hero]),/REFERENCE_SCOPE_MISMATCH|reference.*checkpoint|scope/i);}finally{await query('ROLLBACK');}
 assert.equal((await store.getRun(owner,r.id)).revision,2);assert.equal((await store.getCheckpoint(owner,r.id)).checkpointId,committed.checkpointId);
});

test('QA terminal freezes history while canonical checkpoint replay returns its original preterminal revision',async()=>{
 const owner=await guest(),other=await guest(),r=await run(owner),s=createSnapshot(createGame(content,918273));const a={requestId:randomUUID(),expectedRevision:1},h=hash(['checkpoint',a,s]);
 const first=await store.commitCheckpoint(owner,r.id,a,h,s);const end={requestId:randomUUID(),expectedRevision:2,result:{outcome:'defeat',lastCompletedWave:0,wave:1,simTick:1000,gold:620,throneHp:0,seed:918273,versions:s.versions,statistics:s.statistics}};
 const ended=await store.finishRun(owner,r.id,end,hash(['finish',end]));assert.equal(ended.revision,3);
 const replay=await store.commitCheckpoint(owner,r.id,a,h,()=>{throw Error('historical retry must not reach current validator');});assert.deepEqual(replay,first);
 await assert.rejects(()=>store.commitCheckpoint(other,r.id,a,h,s),e=>e.code==='RUN_NOT_FOUND');
 await assert.rejects(()=>store.finishRun(owner,r.id,{...end,requestId:a.requestId},hash(['finish-collision',end])),e=>e.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(()=>store.commitCheckpoint(owner,r.id,{requestId:randomUUID(),expectedRevision:3},hash('new-after-finish'),s),e=>e.code==='RUN_FINISHED');
 assert.equal((await store.getRun(owner,r.id)).status,'defeat');assert.equal((await store.getRun(owner,r.id)).revision,3);assert.equal((await store.getCheckpoint(owner,r.id)).revision,2);
});

test('QA exact previously accepted R0 archive inventory and immutable EAV content survive R1 migrations',async()=>{
 const directory=fileURLToPath(new URL('../releases/r0-002/',import.meta.url));const archived=await verifyRelease(directory);const bytes=await readFile(new URL('../releases/r0-002/manifest.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6');
 assert.equal(archived.sourceHash,'62ab2127e3c88f1d76b530beb9e7d4e34b44a1df531b07d748a9573290e6227a');assert.equal(archived.releaseId,'r0-002');
 const old=await readContent(pool,archived.versions.content);assert.equal(old.contentVersion,'r0-content-1');assert.equal(old.entities[0].parameters.gameplay_available,false);assert.equal(old.metadataSchemaVersion,'r0-meta-1');
});
