import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {MemoryRepository} from '../dist/profile/repository.js';
import {ProfileService} from '../dist/profile/service.js';
import {hashPassword} from '../dist/profile/auth.js';
import {RunSimulation} from '../dist/combat/simulation.js';
import {buildApp} from '../dist/app.js';
const password='forge-unit-account-only',passwordHash=await hashPassword(password);
async function fixture(){let now=1000;const repo=new MemoryRepository(()=>now),service=new ProfileService(repo,()=>now),accountId=randomUUID(),clientId=randomUUID();await repo.provision([{accountId,login:'forge.fixture',passwordHash}]);await repo.setBalanceAdmin(accountId,true);
 const command=async(type,payload={},client=clientId)=>({operationId:randomUUID(),expectedRevision:(await repo.getProfile(accountId)).revision,clientId:client,type,payload});
 const perform=async(type,payload={},client=clientId)=>service.perform(accountId,await command(type,payload,client));
 const quote=async()=>(await repo.getBalance()).revision;
 return {repo,service,accountId,clientId,command,perform,quote,now:()=>now,advance:ms=>now+=ms,publish:async(patch)=>{const balance=await repo.getBalance();return repo.publishBalance(accountId,balance.revision,{...balance.values,...patch});}};
}
async function funded(f,gold='1000000000'){await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli=gold;});}
async function buy(f,id='apprentice'){return f.perform('forge_buy',{productionId:id,balanceRevision:await f.quote()});}
const ownership=result=>({runId:result.run.runId,ownerEpoch:result.run.ownerEpoch});

test('automatic income caps actual credit, advances marker and leaves a full wallet able to spend',async()=>{
 const f=await fixture(),max=9223372036854775807n;
 await f.publish({'forge.productions.apprentice.rateGoldMilliPerSecond':max.toString()});
 await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli=(max-10n).toString();tx.forge.counts.apprentice=1;});
 f.advance(2000);const command=await f.command('forge_settle');const settled=await f.service.perform(f.accountId,command);
 assert.equal(settled.profile.goldMilli,max.toString());assert.equal(settled.workshop.lastSettlement.goldMilli,'10');assert.equal(settled.workshop.settledAtMs,f.now());
 f.advance(2000);const replay=await f.service.perform(f.accountId,command);assert.equal(replay.replayed,true);assert.deepEqual(replay.workshop,settled.workshop);
 const bought=await buy(f,'smelter');assert.equal(bought.workshop.lastSettlement.goldMilli,'0');assert.equal(bought.workshop.settledAtMs,f.now());assert.equal(bought.profile.goldMilli,(max-250000n).toString());
});

test('maximum affordable production count rejects before mutation and has no buy quote',async()=>{
 const f=await fixture();await f.publish({'forge.productions.apprentice.baseCostGoldMilli':'0','forge.productions.apprentice.rateGoldMilliPerSecond':'0'});
 await f.repo.transaction(f.accountId,tx=>{tx.forge.counts.apprentice=2147483647;});
 const before=await f.repo.getProfile(f.accountId),command=await f.command('forge_buy',{productionId:'apprentice',balanceRevision:await f.quote()});
 await assert.rejects(f.service.perform(f.accountId,command),e=>e.code==='PROFILE_OVERFLOW'&&e.statusCode===503);
 assert.deepEqual(await f.repo.getProfile(f.accountId),before);assert.equal(await f.repo.getOperation(f.accountId,command.operationId),null);
 const view=await f.service.getWorkshop(f.accountId);assert.equal(view.productions[0].owned,2147483647);assert.equal(view.productions[0].nextCostGoldMilli,null);
});

test('workshop reads bypass the mutation transaction and operation journal',async()=>{
 const f=await fixture();const before=await f.repo.getProfile(f.accountId);
 f.repo.transaction=()=>{throw new Error('Workshop GET loaded the mutation journal');};
 const view=await f.service.getWorkshop(f.accountId);assert.equal(view.productions[0].owned,0);assert.equal(view.lastSettlement,undefined);
 assert.deepEqual(await f.repo.getProfile(f.accountId),before);
});
test('manual tap and production share authoritative wallet, exact growing price and immutable receipt',async()=>{
 const f=await fixture();const command=await f.command('forge_tap',{balanceRevision:await f.quote()});const first=await f.service.perform(f.accountId,command);assert.equal(first.profile.goldMilli,'1000');assert.equal(first.workshop.tapGoldMilli,'1000');
 f.advance(60000);const replay=await f.service.perform(f.accountId,command);assert.equal(replay.replayed,true);assert.deepEqual(replay.workshop,first.workshop);assert.equal((await f.repo.getProfile(f.accountId)).goldMilli,'1000');
 await funded(f,'25000');const bought=await buy(f);assert.equal(bought.profile.goldMilli,'0');assert.equal(bought.workshop.productions[0].owned,1);assert.equal(bought.workshop.productions[0].nextCostGoldMilli,'30000');
 f.advance(20000);const settled=await f.perform('forge_settle');assert.equal(settled.profile.goldMilli,'1000');assert.equal(settled.workshop.lastSettlement.goldMilli,'1000');
});
test('settlement before purchases and upgrades keeps past rates and price quote changes roll back',async()=>{
 const f=await fixture();await funded(f);await buy(f);f.advance(20000);const before=await f.repo.getProfile(f.accountId);const upgraded=await f.perform('forge_upgrade',{upgrade:'organization',balanceRevision:await f.quote()});assert.equal(BigInt(upgraded.profile.goldMilli)-BigInt(before.goldMilli),1000n-1000000n);assert.deepEqual(upgraded.workshop.productionRate,{numerator:'62500',denominator:1000});
 const old=await f.quote();f.advance(8000);await f.publish({'forge.productions.apprentice.rateGoldMilliPerSecond':'100'});const profile=await f.repo.getProfile(f.accountId);let state;await f.repo.transaction(f.accountId,tx=>{state=structuredClone(tx.forge);});
 await assert.rejects(f.perform('forge_buy',{productionId:'apprentice',balanceRevision:old}),e=>e.code==='BALANCE_REVISION_CONFLICT');assert.deepEqual(await f.repo.getProfile(f.accountId),profile);await f.repo.transaction(f.accountId,tx=>assert.deepEqual(tx.forge,state));
 f.advance(8000);const next=await f.perform('forge_settle');assert.equal(next.workshop.lastSettlement.goldMilli,'1500');
});
test('one cap credits eight-hour prefix through many publications then advances entire marker',async()=>{
 const f=await fixture();await funded(f);await buy(f);f.advance(4*3600000);await f.publish({'forge.productions.apprentice.rateGoldMilliPerSecond':'100'});f.advance(16*3600000);const result=await f.perform('forge_settle');assert.deepEqual(result.workshop.lastSettlement,{elapsedMs:20*3600000,creditedMs:8*3600000,discardedMs:12*3600000,goldMilli:'2160000'});assert.equal(result.workshop.settledAtMs,f.now());assert.equal((await f.perform('forge_settle')).workshop.lastSettlement.goldMilli,'0');
});
test('tap upgrades use exact accepted levels and completed upgrades do not spend again',async()=>{
 const f=await fixture();await funded(f);for(const [level,value]of [[1,'2000'],[2,'4000'],[3,'8000']]){const result=await f.perform('forge_upgrade',{upgrade:'tap',balanceRevision:await f.quote()});assert.equal(result.workshop.tapLevel,level);assert.equal(result.workshop.tapGoldMilli,value);}
 const before=await f.repo.getProfile(f.accountId);await assert.rejects(f.perform('forge_upgrade',{upgrade:'tap',balanceRevision:await f.quote()}),e=>e.code==='MAX_UPGRADE');assert.deepEqual(await f.repo.getProfile(f.accountId),before);
});
test('concurrent purchases share revision and one gold cost, altered operation conflicts',async()=>{
 const f=await fixture();await funded(f,'25000');const first=await f.command('forge_buy',{productionId:'apprentice',balanceRevision:await f.quote()}),second={...first,operationId:randomUUID()};const results=await Promise.allSettled([f.service.perform(f.accountId,first),f.service.perform(f.accountId,second)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');await assert.rejects(f.service.perform(f.accountId,{...first,payload:{...first.payload,productionId:'smelter'}}),e=>e.code==='OPERATION_CONFLICT');
});
test('running and countdown states reject clicks while passive settlement and closed income continue',async()=>{
 const f=await fixture();await funded(f);await buy(f);const started=await f.perform('start_run');await assert.rejects(f.perform('forge_tap',{balanceRevision:await f.quote()}),e=>e.code==='INVALID_PHASE');f.advance(20000);const pausedIncome=await f.perform('forge_settle');assert.equal(pausedIncome.workshop.lastSettlement.goldMilli,'1000');assert.equal(pausedIncome.run.snapshot.state.phase,'paused');await f.perform('resume_run',ownership(started));f.advance(20000);const passive=await f.perform('forge_settle');assert.equal(passive.workshop.lastSettlement.goldMilli,'1000');assert.equal(passive.run.snapshot.state.phase,'running');await assert.rejects(buy(f),e=>e.code==='INVALID_PHASE');
});
test('shop ownership protects workshop mutations, read-only account can settle its passive income',async()=>{
 const f=await fixture();await funded(f);await buy(f);const started=await f.perform('start_run');await f.repo.transaction(f.accountId,tx=>{const sim=RunSimulation.restore(tx.run.snapshot);sim.state.shopCandidates.push({id:'test-shop',x:sim.state.hero.x,z:sim.state.hero.z,at:sim.state.time});sim.resume();assert.equal(sim.enterShop('test-shop'),true);tx.run.snapshot=sim.exportSnapshot();});f.advance(20000);const foreign=randomUUID();await assert.rejects(f.perform('forge_tap',{balanceRevision:await f.quote()},foreign),e=>e.code==='RUN_NOT_OWNER');const settled=await f.perform('forge_settle',{},foreign);assert.equal(settled.workshop.lastSettlement.goldMilli,'1000');assert.equal(settled.run.control,'readOnly');assert.equal(settled.run.runId,started.run.runId);
});
test('trusted authority rejects forged counts, durations, wallet and unknown production before any receipt',async()=>{
 const f=await fixture();for(const [type,payload]of [['forge_tap',{balanceRevision:await f.quote(),amount:'999999'}],['forge_settle',{elapsedMs:28800000}],['forge_buy',{balanceRevision:await f.quote(),productionId:'unknown'}],['forge_upgrade',{balanceRevision:await f.quote(),upgrade:'reset'}]])await assert.rejects(f.perform(type,payload),e=>e.code==='INVALID_OPERATION');assert.equal((await f.repo.getProfile(f.accountId)).revision,0);
});
test('workshop GET is authenticated and read-only, mutation keeps CSRF and exact schema',async t=>{
 const f=await fixture();f.advance(Date.now()-f.now());const app=buildApp({profileRepository:f.repo,clock:f.now});t.after(()=>app.close());assert.equal((await app.inject('/api/v1/workshop')).statusCode,401);const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{login:'forge.fixture',password}});assert.equal(login.statusCode,200,login.body);const cookie=login.headers['set-cookie'].split(';')[0];f.advance(30000);const before=await f.repo.getProfile(f.accountId);const view=await app.inject({url:'/api/v1/workshop',headers:{cookie}});assert.equal(view.statusCode,200,view.body);assert.equal(view.json().lastSettlement,undefined);assert.deepEqual(await f.repo.getProfile(f.accountId),before);assert.equal((await app.inject({url:'/api/v1/workshop?elapsed=999',headers:{cookie}})).statusCode,400);const operation=await f.command('forge_tap',{balanceRevision:await f.quote()});assert.equal((await app.inject({method:'POST',url:'/api/v1/operations',headers:{cookie},payload:operation})).statusCode,403);const result=await app.inject({method:'POST',url:'/api/v1/operations',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:operation});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().workshop.schemaVersion,'runner-workshop.1');
});
test('Clock of Debtor every tenth deduplicated kill grants current production, preserving settlement marker',async()=>{
 const f=await fixture();await funded(f);await buy(f);const itemId=randomUUID();await f.repo.transaction(f.accountId,tx=>{tx.profile.items.push({id:itemId,definitionId:'debt_clock',level:1});tx.profile.loadouts.pudge.talisman=itemId;});const started=await f.perform('start_run');const originalMarker=f.now();f.advance(10000);await f.publish({'forge.productions.apprentice.rateGoldMilliPerSecond':'100','forge.clockSeconds':300});await f.repo.transaction(f.accountId,tx=>{tx.run.rewardedEnemyIds=Array.from({length:9},(_,i)=>'previous-'+i);tx.run.snapshot.state.enemies.push({id:started.run.runId+':tenth',kind:'normal',x:0,z:tx.run.snapshot.state.hero.z+4,radius:tx.run.snapshot.config.enemyRadius,status:'alive',requiredHits:1,hitsRemaining:1,hitCastIds:[],shooting:null});});await f.perform('resume_run',ownership(started));f.advance(1200);const command=await f.command('advance_run',{...ownership(started),frames:Array.from({length:60},(_,i)=>i===0?[{type:'cast',aim:{x:0,z:1}}]:[])});const result=await f.service.perform(f.accountId,command);assert.equal(result.run.loot.goldMilli,'8000');assert.equal(result.visualRewards.length,1);assert.equal(result.visualRewards[0].clockGoldMilli,'3000');assert.equal(result.visualRewards[0].clockSeconds,30);assert.equal(result.visualRewards[0].goldMilli,'5000');assert.equal(result.workshop.lastSettlement.goldMilli,'120');assert.equal(result.workshop.settledAtMs,f.now());assert.equal(originalMarker+11200,result.workshop.settledAtMs);const replay=await f.service.perform(f.accountId,command);assert.deepEqual(replay.visualRewards,result.visualRewards);assert.deepEqual(replay.profile,result.profile);assert.equal(replay.replayed,true);
});
test('legacy run restores when account later owns new Clock, without receiving its effect',async()=>{
 const f=await fixture();await funded(f);await buy(f);const runId=randomUUID(),sim=new RunSimulation(runId,12),itemId=randomUUID();sim.pause();await f.repo.transaction(f.accountId,tx=>{tx.profile.items.push({id:itemId,definitionId:'debt_clock',level:1});tx.profile.loadouts.pudge.talisman=itemId;tx.run={runId,balanceRevision:null,snapshot:sim.exportSnapshot(),ownerClientId:f.clientId,ownerEpoch:1,updatedAt:new Date(f.now()).toISOString(),wallAnchorMs:f.now(),simAnchorTime:.25,rewardedEnemyIds:[],statsCommitted:false};});const result=await f.perform('forge_settle');assert.equal(result.run.balance.revision,'legacy-r34.1');assert.equal(result.profile.items[0].definitionId,'debt_clock');
});
