import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildApp} from '../dist/app.js';
import {MemoryRepository,StorageError} from '../dist/profile/repository.js';
import {ProfileService,publicOperationResult} from '../dist/profile/service.js';
import {hashPassword} from '../dist/profile/auth.js';
import {RunSimulation} from '../dist/combat/simulation.js';
import {DEFAULT_BALANCE_VALUES,BALANCE_PARAMETERS,compileBalance,LEGACY_BALANCE} from '../dist/balance/model.js';
import {balanceSeedSql} from '../dist/balance/seed.js';
const password='balance-test-password',passwordHash=await hashPassword(password);
async function fixture(){const repo=new MemoryRepository(),accountId=randomUUID(),clientId=randomUUID();let now=Date.now();await repo.provision([{accountId,login:'balance.account',passwordHash}]);const service=new ProfileService(repo,()=>now);const perform=async(type,payload={})=>service.perform(accountId,{operationId:randomUUID(),expectedRevision:(await repo.getProfile(accountId)).revision,clientId,type,payload});return{repo,accountId,clientId,service,perform,advanceClock:ms=>now+=ms};}
async function publish(f,patch){await f.repo.setBalanceAdmin(f.accountId,true);const before=await f.repo.getBalance();return f.repo.publishBalance(f.accountId,before.revision,{...before.values,...patch});}
async function shop(f){await f.repo.transaction(f.accountId,tx=>{const sim=RunSimulation.restore(tx.run.snapshot);sim.resume();const id=sim.state.runId+':fixture-shop';sim.state.shopCandidates.push({id,x:sim.state.hero.x,z:sim.state.hero.z,at:sim.state.time});assert.equal(sim.enterShop(id),true);tx.run.snapshot=sim.exportSnapshot();});}
function own(result){return{runId:result.run.runId,ownerEpoch:result.run.ownerEpoch};}

test('balance API enforces authentication, explicit privilege, CSRF, compare-and-swap and unavailable authority',async t=>{
 const f=await fixture(),app=buildApp({profileRepository:f.repo});t.after(()=>app.close());
 const initial=(await app.inject('/api/v1/balance')).json();assert.equal(initial.compiled.runtime.shopMinDistance,250);assert.equal(initial.compiled.runtime.shopMaxDistance,250);assert.equal(initial.parameters.length,BALANCE_PARAMETERS.length);
 assert.equal((await app.inject('/api/v1/admin/balance')).statusCode,401);
 const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{login:'balance.account',password}}),cookie=login.headers['set-cookie'].split(';')[0],csrf=login.json().csrfToken;
 assert.equal((await app.inject({url:'/api/v1/admin/balance',headers:{cookie}})).statusCode,403);
 await f.repo.setBalanceAdmin(f.accountId,true);assert.equal((await app.inject({url:'/api/v1/admin/balance',headers:{cookie}})).statusCode,200);
 const body={expectedRevision:initial.revision,values:{...initial.values,'runtime.shopMinDistance':300,'runtime.shopMaxDistance':300}};
 assert.equal((await app.inject({method:'PUT',url:'/api/v1/admin/balance',headers:{cookie},payload:body})).statusCode,403);
 assert.equal((await app.inject({method:'PUT',url:'/api/v1/admin/balance',headers:{cookie,'x-csrf-token':csrf,origin:'https://wrong.example'},payload:body})).statusCode,403);
 const first=await app.inject({method:'PUT',url:'/api/v1/admin/balance',headers:{cookie,'x-csrf-token':csrf},payload:body});assert.equal(first.statusCode,200,first.body);assert.notEqual(first.json().revision,initial.revision);
 const stale=await app.inject({method:'PUT',url:'/api/v1/admin/balance',headers:{cookie,'x-csrf-token':csrf},payload:body});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'BALANCE_REVISION_CONFLICT');
 await f.repo.setBalanceAdmin(f.accountId,false);assert.equal((await app.inject({url:'/api/v1/admin/balance',headers:{cookie}})).statusCode,403);
 f.repo.getBalance=async()=>{throw new StorageError();};const unavailable=await app.inject('/api/v1/balance');assert.equal(unavailable.statusCode,503);assert.equal(unavailable.headers['cache-control'],'no-store');
});

test('new balance affects next run and pins prices, equipment, consumables, config and rewards through pause/resume',async()=>{
 const f=await fixture();await f.repo.transaction(f.accountId,tx=>{tx.profile.goldMilli='9999999';tx.profile.components={steel:100,ember:100,core:100};tx.profile.consumables.slow_dust=3;tx.profile.consumables.collector_vial=3;tx.profile.loadouts.pudge.quick=['slow_dust','collector_vial'];});
 const old=await f.perform('start_run'),oldRevision=old.run.balance.revision;assert.equal(old.run.snapshot.version,'r34.2');assert.equal(old.run.snapshot.config.heroSpeed,2);
 const edited=await publish(f,{'config.heroSpeed':3,'runtime.shopMinDistance':300,'runtime.shopMaxDistance':300,'items.fast_reel.levels.1.recipe.goldMilli':'333000','items.fast_reel.levels.2.recipe.goldMilli':'444000','items.fast_reel.levels.1.modifiers.returnSpeedMultiplier':1.4,'rewards.normal.baseGoldMilli':'9000','consumables.slow_dust.effect.durationSeconds':7,'consumables.collector_vial.effect.kills':15});
 await f.perform('resume_run',own(old));const used=await f.perform('consume',{...own(old),definitionId:'slow_dust'});assert.equal(used.run.snapshot.state.effects.slowRemaining,3);await f.perform('pause_run',own(old));const restored=RunSimulation.restore((await f.repo.getRun(f.accountId)).snapshot);assert.equal(restored.runtimeBalance.slowDurationSeconds,3);assert.equal(restored.config.heroSpeed,2);
 await shop(f);const before=(await f.repo.getProfile(f.accountId)).goldMilli,crafted=await f.perform('craft',{definitionId:'fast_reel'});assert.equal(BigInt(before)-BigInt(crafted.profile.goldMilli),100000n);assert.equal(crafted.run.balance.revision,oldRevision);
 const itemId=crafted.profile.items[0].id,equipped=await f.perform('equip',{slot:'weapon',itemId});assert.equal(equipped.run.snapshot.equipment.returnSpeedMultiplier,1.2);
 const beforeUpgrade=equipped.profile.goldMilli,upgraded=await f.perform('upgrade',{itemId});assert.equal(BigInt(beforeUpgrade)-BigInt(upgraded.profile.goldMilli),200000n);assert.equal(upgraded.run.snapshot.equipment.returnSpeedMultiplier,1.3);
 await f.perform('end_run',own(old));const next=await f.perform('start_run');assert.equal(next.run.balance.revision,edited.revision);assert.equal(next.run.snapshot.config.heroSpeed,3);assert.equal(next.run.snapshot.runtimeBalance.shopMinDistance,300);assert.equal(next.run.balance.compiled.rewards.rewards[0].baseGoldMilli,'9000');
 await f.perform('resume_run',own(next));const collected=await f.perform('consume',{...own(next),definitionId:'collector_vial'});assert.equal(collected.run.snapshot.state.effects.collectorKillsRemaining,15);
 await shop(f);const beforeNew=(await f.repo.getProfile(f.accountId)).goldMilli,newCraft=await f.perform('craft',{definitionId:'fast_reel'});assert.equal(BigInt(beforeNew)-BigInt(newCraft.profile.goldMilli),333000n);
});

test('legacy snapshots retain original shop schedule, economy and effects after publication; old receipts normalize without changing journal',async()=>{
 const f=await fixture(),runId=randomUUID(),legacy=new RunSimulation(runId,43,{config:{spawning:false}});legacy.pause();const snapshot=legacy.exportSnapshot();assert.equal(snapshot.version,'r34.1');
 await f.repo.transaction(f.accountId,tx=>{tx.run={runId,snapshot,ownerClientId:f.clientId,ownerEpoch:1,updatedAt:new Date().toISOString(),wallAnchorMs:Date.now(),simAnchorTime:0.25,rewardedEnemyIds:[],statsCommitted:false};tx.profile.goldMilli='9999999';tx.profile.components={steel:100,ember:100,core:100};});
 await publish(f,{'items.fast_reel.levels.1.recipe.goldMilli':'333000','consumables.slow_dust.effect.durationSeconds':7});await shop(f);const crafted=await f.perform('craft',{definitionId:'fast_reel'});assert.equal(crafted.profile.goldMilli,'9899999');assert.equal(crafted.run.balance.revision,'legacy-r34.1');assert.equal(crafted.run.snapshot.version,'r34.1');assert.equal(crafted.run.snapshot.runtimeBalance,undefined);assert.equal(crafted.run.snapshot.generator.shopDistanceRemaining,snapshot.generator.shopDistanceRemaining);
 const historical=structuredClone(crafted);delete historical.run.balance;assert.equal(publicOperationResult(historical).run.balance.revision,'legacy-r34.1');assert.equal(historical.run.balance,undefined);
 const corrupted=structuredClone(crafted);corrupted.run.snapshot.version='r34.2';delete corrupted.run.balance;assert.throws(()=>publicOperationResult(corrupted),e=>e.code==='BALANCE_STORAGE_UNAVAILABLE');assert.deepEqual(LEGACY_BALANCE.compiled.equipment.items[0].levels[0].recipe.goldMilli,'100000');
});

test('shop candidates appear every 250 metres across speed changes and saved restores, retaining spawn lookahead',()=>{
 const compiled=compileBalance(DEFAULT_BALANCE_VALUES);
 for(const heroSpeed of [2,3]){let sim=new RunSimulation('shops-'+heroSpeed,7,{config:{...compiled.config,heroSpeed,spawnMinSeconds:1000,spawnMaxSeconds:1000},runtimeBalance:compiled.runtime});const milestones=[];
  for(let tick=0;tick<Math.ceil(510/heroSpeed*60);tick++){sim.step();for(const event of sim.state.events)if(event.type==='shopCandidate'){const candidate=sim.state.shopCandidates.at(-1);milestones.push(candidate.z-sim.config.spawnDistance);}if(tick===1000)sim=RunSimulation.restore(sim.exportSnapshot());}
  assert.equal(milestones.length,2);assert.ok(Math.abs(milestones[0]-250)<1e-7);assert.ok(Math.abs(milestones[1]-500)<1e-7);
 }
});

test('complete balance schema rejects unknown/missing values, fractional integer/money, huge drops, invalid probabilities and unsafe combinations atomically',async()=>{
 const f=await fixture(),before=await f.repo.getBalance();await f.repo.setBalanceAdmin(f.accountId,true);
 const mutations=[v=>{v.unknown=1;},v=>{delete v['config.heroSpeed'];},v=>{v['rewards.normal.baseGoldMilli']='5.5';},v=>{v['rewards.normal.baseGoldMilli']='9223372036854775808';},v=>{v['config.maxEnemies']=1.5;},v=>{v['rewards.boss.commonDrops']=1000000;},v=>{v['runtime.shopMinDistance']=1000;},v=>{v['runtime.shopRightProbability']=1.1;},v=>{v['config.shooterTelegraph']=10;},v=>{v['baseModifiers.returnHitTargets']=1;},v=>{v['config.heroSpeed']=Number.NaN;},v=>{v['config.projectileLifetime']=30.01;},v=>{v['config.shooterTelegraph']=10.01;},v=>{v['config.bossTelegraph']=10.01;}];
 for(const change of mutations){const values=structuredClone(before.values);change(values);await assert.rejects(f.repo.publishBalance(f.accountId,before.revision,values),e=>e.code==='INVALID_BALANCE');assert.equal((await f.repo.getBalance()).revision,before.revision);}
 const precise=await publish(f,{'rewards.normal.baseGoldMilli':'9007199254740993000','rewards.normal.commonDrops':1});assert.equal(precise.values['rewards.normal.baseGoldMilli'],'9007199254740993000');assert.equal(precise.compiled.rewards.rewards[0].commonDrops,1);
 assert.equal(balanceSeedSql(),readFileSync(new URL('../migrations/005-balance.sql',import.meta.url),'utf8'));
});

test('version fence rejects relabeled new snapshots and missing runtime, preserving legacy exports',()=>{
 const compiled=compileBalance(DEFAULT_BALANCE_VALUES),newer=new RunSimulation('version-new',1,{runtimeBalance:compiled.runtime}).exportSnapshot();assert.equal(newer.version,'r34.2');assert.equal(RunSimulation.restore(newer).exportSnapshot().version,'r34.2');
 const relabeled=structuredClone(newer);relabeled.version='r34.1';assert.throws(()=>RunSimulation.restore(relabeled));delete newer.runtimeBalance;assert.throws(()=>RunSimulation.restore(newer));assert.equal(new RunSimulation('version-old',1).exportSnapshot().version,'r34.1');
});

test('authoritative kill payout uses the run reward revision after publication and on the next run',async()=>{
 const f=await fixture(),old=await f.perform('start_run');await publish(f,{'rewards.normal.baseGoldMilli':'9000','rewards.normal.commonDrops':1,'rewards.normal.steelProbability':1});
 async function kill(result){await f.repo.transaction(f.accountId,tx=>{tx.run.snapshot.state.enemies.push({id:result.run.runId+':test-enemy',kind:'normal',x:0,z:tx.run.snapshot.state.hero.z+4,radius:tx.run.snapshot.config.enemyRadius,status:'alive',requiredHits:1,hitsRemaining:1,hitCastIds:[],shooting:null});});await f.perform('resume_run',own(result));f.advanceClock(1200);return f.perform('advance_run',{...own(result),frames:Array.from({length:60},(_,i)=>i===0?[{type:'cast',aim:{x:0,z:1}}]:[])});}
 const first=await kill(old);assert.equal(first.profile.goldMilli,'5000');assert.equal(first.profile.components.steel,0);await f.perform('end_run',own(old));const next=await f.perform('start_run'),second=await kill(next);assert.equal(second.profile.goldMilli,'14000');assert.equal(second.profile.components.steel,1);assert.equal(second.run.loot.goldMilli,'9000');
});
