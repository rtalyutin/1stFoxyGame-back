import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {buildApp} from '../dist/app.js';
import {MemoryRepository,StorageError} from '../dist/profile/repository.js';
import {hashPassword,verifyPassword} from '../dist/profile/auth.js';
import {ProfileService} from '../dist/profile/service.js';
import {RunSimulation} from '../dist/combat/simulation.js';
import {recipeCost} from '../dist/profile/equipment.js';

const password='local-fixture-only-1294';
const passwordHash=await hashPassword(password);
async function fixture(){
 const repo=new MemoryRepository(),accountId=randomUUID(),clientId=randomUUID();let now=Date.now();
 await repo.provision([{accountId,login:'test.account',passwordHash}]);
 const service=new ProfileService(repo,()=>now);
 const op=(type,payload={},extra={})=>({operationId:randomUUID(),expectedRevision:0,clientId,type,payload,...extra});
 const perform=async(type,payload={},extra={})=>service.perform(accountId,op(type,payload,{expectedRevision:(await repo.getProfile(accountId)).revision,...extra}));
 return {repo,accountId,clientId,service,op,perform,clock:()=>now,advanceClock:ms=>{now+=ms;}};
}
async function seedRun(f,phase='shop',options={}){
 const runId=randomUUID(),sim=new RunSimulation(runId,44,options);
 if(phase==='shop'){sim.state.shopCandidates.push({id:runId+':shop:fixture',x:0,z:0,at:0});assert.equal(sim.enterShop(runId+':shop:fixture'),true);}
 else if(phase==='paused')sim.pause();
 else if(phase==='gameOver')sim.abandon();
 await f.repo.transaction(f.accountId,tx=>{tx.run={runId,snapshot:sim.exportSnapshot(),ownerClientId:f.clientId,ownerEpoch:1,updatedAt:new Date(f.clock()).toISOString(),wallAnchorMs:f.clock(),simAnchorTime:0,rewardedEnemyIds:[],statsCommitted:false};});
 return {runId,ownerEpoch:1};
}
test('login is provisioned only, credential bounded, secure session revocable, CSRF enforced',async t=>{
 const f=await fixture(),app=buildApp({profileRepository:f.repo,clock:f.clock,secureCookies:true});t.after(()=>app.close());
 assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{}})).statusCode,404);
 assert.equal((await app.inject('/api/v1/profile')).statusCode,401);
 const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{login:'test.account',password}});
 assert.equal(login.statusCode,200,login.body);const cookie=login.headers['set-cookie'].split(';')[0];
 assert.match(login.headers['set-cookie'],/^__Host-foxy-session=.*HttpOnly; SameSite=Strict;.*Secure$/);
 const session=login.json();assert.equal(session.account.id,f.accountId);assert.ok(session.csrfToken);
 assert.equal((await app.inject({url:'/api/v1/profile',headers:{cookie}})).json().accountId,f.accountId);
 const mutation=f.op('start_run');
 assert.equal((await app.inject({method:'POST',url:'/api/v1/operations',headers:{cookie},payload:mutation})).statusCode,403);
 const changed=await app.inject({method:'POST',url:'/api/v1/operations',headers:{cookie,'x-csrf-token':session.csrfToken},payload:mutation});
 assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().run.snapshot.state.phase,'paused');
 const logout=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie,'x-csrf-token':session.csrfToken},payload:{}});assert.equal(logout.statusCode,200);
 assert.equal((await app.inject({url:'/api/v1/profile',headers:{cookie}})).statusCode,401);
});
test('authentication rate limits both login and caller, origin attack cannot log in',async t=>{
 const f=await fixture(),app=buildApp({profileRepository:f.repo});t.after(()=>app.close());
 const payload={login:'test.account',password:'wrong-password-long'};
 assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'https://foreign.example'},payload})).statusCode,403);
 for(let i=0;i<5;i++)assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',payload})).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',payload})).statusCode,429);
 assert.equal(await verifyPassword(password,passwordHash),true);assert.equal(await verifyPassword('wrong-password-long',passwordHash),false);
});
test('idempotent identity migration preserves property and credentials',async()=>{
 const f=await fixture();await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli='123456';tx.profile.components.core=1;});
 const otherHash=await hashPassword('changed-password-123');await f.repo.provision([{accountId:f.accountId,login:'test.account',passwordHash:otherHash}]);
 assert.equal((await f.repo.getProfile(f.accountId)).goldMilli,'123456');assert.equal((await f.repo.findAccount('test.account')).passwordHash,passwordHash);
});
test('craft atomically spends all resources, identical receipt replays and altered payload conflicts',async()=>{
 const f=await fixture();await seedRun(f);const cost=recipeCost('fast_reel');
 await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli=cost.goldMilli;tx.profile.components={...cost.components};});
 const command=f.op('craft',{definitionId:'fast_reel'}),first=await f.service.perform(f.accountId,command);
 assert.equal(first.profile.goldMilli,'0');assert.deepEqual(first.profile.components,{steel:0,ember:0,core:0});assert.equal(first.profile.items.length,1);
 const repeated=await f.service.perform(f.accountId,structuredClone(command));assert.equal(repeated.replayed,true);assert.deepEqual(repeated.profile,first.profile);
 await assert.rejects(f.service.perform(f.accountId,{...command,payload:{definitionId:'long_link'}}),e=>e.code==='OPERATION_CONFLICT');
 assert.equal((await f.repo.getProfile(f.accountId)).items.length,1);
});
test('missing a single component rolls back wallet, item, run snapshot and receipt',async()=>{
 const f=await fixture();await seedRun(f);const cost=recipeCost('piercing_tooth');
 await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli=cost.goldMilli;tx.profile.components={...cost.components,core:0};});
 const before=await f.repo.getProfile(f.accountId),run=await f.repo.getRun(f.accountId),command=f.op('craft',{definitionId:'piercing_tooth'});
 await assert.rejects(f.service.perform(f.accountId,command),e=>e.code==='INSUFFICIENT_RESOURCES');
 assert.deepEqual(await f.repo.getProfile(f.accountId),before);assert.deepEqual(await f.repo.getRun(f.accountId),run);assert.equal(await f.repo.getOperation(f.accountId,command.operationId),null);
});
test('simultaneous spend of one revision creates one item and serializes balance',async()=>{
 const f=await fixture();await seedRun(f);const cost=recipeCost('fast_reel');await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli=cost.goldMilli;tx.profile.components={...cost.components};});
 const results=await Promise.allSettled([f.service.perform(f.accountId,f.op('craft',{definitionId:'fast_reel'})),f.service.perform(f.accountId,f.op('craft',{definitionId:'fast_reel'}))]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'REVISION_CONFLICT');assert.equal((await f.repo.getProfile(f.accountId)).items.length,1);
});
test('readOnly client cannot change live profile; takeover pauses and invalidates previous epoch',async()=>{
 const f=await fixture();const ownership=await seedRun(f);const second=randomUUID();
 for(const [type,payload]of [['quick_slots',{slots:['slow_dust',null]}],['craft',{definitionId:'fast_reel'}],['equip',{slot:'weapon',itemId:null}],['upgrade',{itemId:randomUUID()}]])await assert.rejects(f.perform(type,payload,{clientId:second}),e=>e.code==='RUN_NOT_OWNER');
 const stolen=await f.perform('takeover_run',{runId:ownership.runId},{clientId:second});assert.equal(stolen.run.ownerEpoch,2);assert.equal(stolen.run.snapshot.state.phase,'shop');
 await assert.rejects(f.perform('pause_run',ownership),e=>e.code==='RUN_NOT_OWNER');
});
test('server starts ID/seed, rejects forged reward and snapshot, enforces wall clock and terminal stats once',async()=>{
 const f=await fixture();const start=await f.perform('start_run'),runId=start.run.snapshot.state.runId;const own={runId,ownerEpoch:1};
 assert.equal(start.run.snapshot.state.phase,'paused');await f.perform('resume_run',own);
 await assert.rejects(f.perform('advance_run',{...own,frames:Array.from({length:120},()=>[])}),e=>e.code==='ADVANCE_TOO_FAST');
 await assert.rejects(f.perform('advance_run',{...own,frames:[[]],gold:9999}),e=>e.code==='INVALID_OPERATION');
 const after=await f.perform('end_run',own);assert.equal(after.profile.stats.runs,1);assert.equal(after.run.snapshot.state.phase,'gameOver');
 const afterAgain=await f.perform('end_run',own);assert.equal(afterAgain.profile.stats.runs,1);
});
test('server replay generates exactly one reward, receipt+snapshot agree, death keeps inventory',async()=>{
 const f=await fixture(),own=await seedRun(f,'running',{initialEnemies:[{id:'ordinary-fixture',x:0,z:4}]});f.advanceClock(2000);
 const frames=Array.from({length:120},(_,i)=>i===0?[{type:'cast',aim:{x:0,z:1}}]:[]);
 const command=f.op('advance_run',{...own,frames}),result=await f.service.perform(f.accountId,command);
 assert.equal(result.profile.goldMilli,'5000');assert.equal(result.profile.stats.totalKills,1);
 assert.equal(result.run.loot.goldMilli,'5000');assert.deepEqual(result.run.loot.components,{steel:0,ember:0,core:0});
 assert.equal((await f.service.perform(f.accountId,command)).profile.goldMilli,'5000');
 const end=await f.perform('end_run',own);assert.equal(end.profile.goldMilli,'5000');assert.equal(end.profile.stats.totalKills,1);
});
test('consumable spend 3 to 2 is atomic with effect, never refunded by death or repeated activation',async()=>{
 const f=await fixture();const own=await seedRun(f,'running');await f.repo.transaction(f.accountId,tx=>{tx.profile.consumables.collector_vial=3;tx.profile.loadouts.pudge.quick=['collector_vial',null];});
 const command=f.op('consume',{...own,definitionId:'collector_vial'}),used=await f.service.perform(f.accountId,command);assert.equal(used.profile.consumables.collector_vial,2);assert.equal(used.run.snapshot.state.effects.collectorKillsRemaining,10);
 assert.equal((await f.service.perform(f.accountId,command)).profile.consumables.collector_vial,2);
 await assert.rejects(f.perform('consume',{...own,definitionId:'collector_vial'}),e=>e.code==='CONSUMABLE_UNAVAILABLE');
 const end=await f.perform('end_run',own);assert.equal(end.profile.consumables.collector_vial,2);assert.equal(end.run.snapshot.state.effects.collectorKillsRemaining,0);
});
test('foreign session cannot see receipts or references belonging to another account',async t=>{
 const f=await fixture();const secondId=randomUUID();await f.repo.provision([{accountId:secondId,login:'foreign.account',passwordHash}]);
 const command=f.op('start_run'),first=await f.service.perform(f.accountId,command);assert.ok(first.run);
 const app=buildApp({profileRepository:f.repo});t.after(()=>app.close());const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{login:'foreign.account',password}}),cookie=login.headers['set-cookie'].split(';')[0];
 assert.equal((await app.inject({url:'/api/v1/operations/'+command.operationId,headers:{cookie}})).statusCode,404);
 const foreign=await app.inject({method:'POST',url:'/api/v1/operations',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:{...f.op('takeover_run',{runId:first.run.snapshot.state.runId}),clientId:randomUUID()}});assert.equal(foreign.statusCode,404);
 assert.equal((await app.inject({url:'/api/v1/profile?accountId='+f.accountId,headers:{cookie}})).statusCode,400);
});
test('storage unavailable fails closed, preserves cache prohibition, ready gate responds 503',async t=>{
 const repo=new MemoryRepository();repo.getSession=async()=>{throw new StorageError();};repo.readiness=async()=>{throw new StorageError();};
 const app=buildApp({profileRepository:repo});t.after(()=>app.close());const response=await app.inject({url:'/api/v1/profile',headers:{cookie:'foxy-session='+'a'.repeat(43)}});assert.equal(response.statusCode,503);assert.equal(response.json().error.code,'PROFILE_STORAGE_UNAVAILABLE');assert.equal(response.headers['cache-control'],'no-store');assert.equal((await app.inject('/readyz')).statusCode,503);
});
test('pause/resume at a frozen wall clock never renews the replay grace budget',async()=>{
 const f=await fixture();const started=await f.perform('start_run'),own={runId:started.run.snapshot.state.runId,ownerEpoch:1};await f.perform('resume_run',own);
 await f.perform('advance_run',{...own,frames:Array.from({length:15},()=>[])});await f.perform('pause_run',own);await f.perform('resume_run',own);
 await assert.rejects(f.perform('advance_run',{...own,frames:[[]]}),e=>e.code==='ADVANCE_TOO_FAST');
});
test('password rotation between verification and session insert cannot authorize old credentials',async t=>{
 const f=await fixture(),app=buildApp({profileRepository:f.repo});t.after(()=>app.close());const insert=f.repo.createSession.bind(f.repo);const newHash=await hashPassword('rotated-password-1834');
 f.repo.createSession=async(...args)=>{await f.repo.rotatePassword(f.accountId,newHash);return insert(...args);};
 const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{login:'test.account',password}});assert.equal(login.statusCode,503);assert.equal(login.headers['set-cookie'],undefined);
});
test('prototype operation names are bounded rules errors without profile mutation',async()=>{
 const f=await fixture();for(const type of ['constructor','__proto__','toString'])await assert.rejects(f.service.perform(f.accountId,f.op(type)),e=>e.code==='INVALID_OPERATION'&&e.statusCode===422);assert.equal((await f.repo.getProfile(f.accountId)).revision,0);
});
test('UUID case is normalized consistently for owner, operation receipt and run references',async()=>{
 const f=await fixture(),command=f.op('start_run',{}, {clientId:f.clientId.toUpperCase()}),started=await f.service.perform(f.accountId,command);assert.equal(started.run.control,'owner');
 assert.equal((await f.service.perform(f.accountId,{...command,operationId:command.operationId.toUpperCase()})).replayed,true);
 await f.perform('resume_run',{runId:started.run.runId.toUpperCase(),ownerEpoch:1},{clientId:f.clientId.toUpperCase()});
});
