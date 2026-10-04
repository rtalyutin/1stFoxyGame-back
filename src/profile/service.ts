import { LEGACY_BALANCE } from '../balance/model.js';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { FIXED_STEP } from '../combat/config.js';
import { RunSimulation, type Command, type GameEvent } from '../combat/simulation.js';
import { rewardFor } from '../game/rewards.js';
import { EQUIPMENT_CATALOG, computeModifiers, recipeCost, canCraft, getItemDefinition, validateProfile, parseGoldMilli } from './equipment.js';
import type { Profile, Operation, OperationResult, RunView, Slot, ConsumableId } from './contracts.js';
import type { Repository, StoredRun, TransactionContext } from './repository.js';

const MAX_GOLD = 9_223_372_036_854_775_807n;
const MAX_COMPONENT = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ProfileError extends Error {
  constructor(readonly code: string, readonly statusCode = 422, message = 'Operation cannot be completed.') { super(message); }
}
function reject(code: string, status = 422): never { throw new ProfileError(code, status); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function exactKeys(object: unknown, keys: string[]): asserts object is Record<string, unknown> {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k=>!keys.includes(k))) reject('INVALID_OPERATION');
}
export function validateOperation(input: unknown): asserts input is Operation {
  exactKeys(input,['operationId','expectedRevision','clientId','type','payload']);
  if (typeof input.operationId !== 'string' || !UUID.test(input.operationId) || typeof input.clientId !== 'string' || !UUID.test(input.clientId) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision)<0) reject('INVALID_OPERATION');
  const fields: Record<string,string[]> = {
    start_run: [],advance_run:['runId','ownerEpoch','frames'], pause_run:['runId','ownerEpoch'],resume_run:['runId','ownerEpoch'],leave_shop:['runId','ownerEpoch'],end_run:['runId','ownerEpoch'],takeover_run:['runId'],
    craft:['definitionId'],upgrade:['itemId'],equip:['slot','itemId'],quick_slots:['slots'],consume:['runId','ownerEpoch','definitionId'],
  };
  if (typeof input.type !== 'string' || !Object.hasOwn(fields,input.type)) reject('INVALID_OPERATION');
  exactKeys(input.payload,fields[input.type]!);
  const p = input.payload;
  if (fields[input.type]!.some(k=> !(k in p))) reject('INVALID_OPERATION');
  if ('runId' in p && (typeof p.runId !== 'string' || !UUID.test(p.runId))) reject('INVALID_OPERATION');
  if ('ownerEpoch' in p && (!Number.isSafeInteger(p.ownerEpoch) || Number(p.ownerEpoch)<1)) reject('INVALID_OPERATION');
  if ('definitionId' in p && (typeof p.definitionId !== 'string' || p.definitionId.length>80)) reject('INVALID_OPERATION');
  if ('itemId' in p && !(input.type==='equip' && p.itemId===null) && (typeof p.itemId !== 'string' || !UUID.test(p.itemId))) reject('INVALID_OPERATION');
  if (input.type==='equip' && !['weapon','body','legs','talisman'].includes(p.slot as string)) reject('INVALID_OPERATION');
  if (input.type==='quick_slots' && (!Array.isArray(p.slots) || p.slots.length!==2 || p.slots.some(s=>s!==null && !['slow_dust','collector_vial'].includes(s)))) reject('INVALID_OPERATION');
  if (input.type==='advance_run') {
    if (!Array.isArray(p.frames) || p.frames.length<1 || p.frames.length>120) reject('INVALID_FRAMES');
    for (const frame of p.frames) {
      if (!Array.isArray(frame) || frame.length>4) reject('INVALID_FRAMES');
      for (const command of frame) {
        if (!command || typeof command!=='object') reject('INVALID_COMMAND');
        switch(command.type) {
          case 'move': exactKeys(command,['type','axis']); if (typeof command.axis!=='number'||!Number.isFinite(command.axis) || Math.abs(command.axis)>1) reject('INVALID_COMMAND'); break;
          case 'cast': exactKeys(command,['type','aim']); exactKeys(command.aim,['x','z']); if (typeof command.aim.x!=='number'||typeof command.aim.z!=='number'||!Number.isFinite(command.aim.x)||!Number.isFinite(command.aim.z)||Math.abs(command.aim.x)>1000||Math.abs(command.aim.z)>1000) reject('INVALID_COMMAND'); break;
          case 'enterShop': exactKeys(command,['type','shopId','offset']); if (typeof command.shopId!=='string'||command.shopId.length>120||(command.offset!==undefined&&(typeof command.offset!=='number'||!Number.isFinite(command.offset)||command.offset<0||command.offset>FIXED_STEP))) reject('INVALID_COMMAND'); break;
          default: reject('INVALID_COMMAND');
        }
      }
    }
  }
}
export function publicRun(run: StoredRun|null, clientId: string): RunView|null {
  if (!run) return null;
  return {balance:structuredClone(run.balance??LEGACY_BALANCE),runId:run.runId,loot:structuredClone(run.loot??{goldMilli:'0',components:{steel:0,ember:0,core:0}}),snapshot:structuredClone(run.snapshot) as RunView['snapshot'], control:run.ownerClientId===clientId?'owner':'readOnly',ownerEpoch:run.ownerEpoch,updatedAt:run.updatedAt};
}
export function publicOperationResult(result:OperationResult):OperationResult {
 const output=structuredClone(result);
 if(output.run&&!output.run.balance){
  if(output.run.snapshot.version!=='r34.1')reject('BALANCE_STORAGE_UNAVAILABLE',503);
  output.run.balance=structuredClone(LEGACY_BALANCE);
 }
 return output;
}
export class ProfileService {
  constructor(readonly repository: Repository, private readonly clock: ()=>number = Date.now) {}
  async perform(accountId: string, operation: Operation): Promise<OperationResult> {
    validateOperation(operation);
    operation=structuredClone(operation);
    operation.operationId=operation.operationId.toLowerCase();operation.clientId=operation.clientId.toLowerCase();
    const identifiers=operation.payload as {runId?:string;itemId?:string|null};
    if(identifiers.runId)identifiers.runId=identifiers.runId.toLowerCase();
    if(identifiers.itemId)identifiers.itemId=identifiers.itemId.toLowerCase();
    const hash=createHash('sha256').update(canonical(operation)).digest('hex');
    return this.repository.transaction(accountId,async tx=>{
      const prior=tx.operations.get(operation.operationId);
      if (prior) {
        if (prior.hash!==hash) reject('OPERATION_CONFLICT',409);
        return {...publicOperationResult(prior.result),replayed:true};
      }
      validateProfile(tx.profile);
      if (operation.expectedRevision!==tx.profile.revision) reject('REVISION_CONFLICT',409);
      await this.apply(tx,operation);
      if (tx.profile.revision>=Number.MAX_SAFE_INTEGER) reject('PROFILE_OVERFLOW',503);
      tx.profile.revision++;
      tx.profile.items.sort((a,b)=>a.id.localeCompare(b.id));
      validateProfile(tx.profile);
      const result:OperationResult={operationId:operation.operationId,status:'committed',profile:structuredClone(tx.profile),run:publicRun(tx.run,operation.clientId),replayed:false};
      tx.operations.set(operation.operationId,{hash,result});
      return result;
    },operation.operationId);
  }
  private restore(run: StoredRun): RunSimulation {
    try { const simulation=RunSimulation.restore(run.snapshot);
      if(run.balanceRevision){const compiled=run.balance?.compiled;if(!compiled||canonical(simulation.config)!==canonical(compiled.config)||canonical(simulation.shopZone)!==canonical(compiled.shopZone)||canonical(simulation.runtimeBalance)!==canonical(compiled.runtime))reject('RUN_INCOMPATIBLE',409);}
      return simulation; } catch { return reject('RUN_INCOMPATIBLE',409); }
  }
  private owned(tx: TransactionContext, op: Operation): StoredRun {
    const payload=op.payload as {runId?:string;ownerEpoch?:number};
    if (!tx.run || tx.run.runId!==payload.runId) reject('RUN_NOT_FOUND',404);
    if (tx.run.ownerClientId!==op.clientId || tx.run.ownerEpoch!==payload.ownerEpoch) reject('RUN_NOT_OWNER',409);
    return tx.run;
  }
  private save(run:StoredRun,sim:RunSimulation):void { run.snapshot=sim.exportSnapshot();run.updatedAt=new Date(this.clock()).toISOString(); }
  private bankActiveTime(run:StoredRun):void {
    // Credit is granted once from real active wall time. Resuming never grants
    // another grace allowance, so pause/resume cannot accelerate the replay.
    run.simAnchorTime+=Math.max(0,(this.clock()-run.wallAnchorMs)/1000);
    run.wallAnchorMs=this.clock();
  }
  private finish(tx: TransactionContext, sim:RunSimulation):void {
    const run=tx.run!;
    if (run.statsCommitted) return;
    if(tx.profile.stats.runs>=Number.MAX_SAFE_INTEGER)reject('PROFILE_OVERFLOW',503);
    tx.profile.stats.runs++;
    tx.profile.stats.bestDistance=Math.max(tx.profile.stats.bestDistance,sim.state.distance);
    run.statsCommitted=true;
  }
  private reward(tx:TransactionContext,event:GameEvent):void {
    if (event.type!=='hit'||!event.lethal||!event.enemyId||!event.kind) return;
    const run=tx.run!;
    if(run.rewardedEnemyIds.includes(event.enemyId))return;
    if(tx.profile.stats.totalKills>=Number.MAX_SAFE_INTEGER)reject('PROFILE_OVERFLOW',503);
    run.loot??={goldMilli:'0',components:{steel:0,ember:0,core:0}};
    run.rewardedEnemyIds.push(event.enemyId);
    const reward=rewardFor(event.kind,(run.balance??LEGACY_BALANCE).compiled.rewards);
    const multiplier=BigInt(event.goldMultiplierMilli??1000);
    const rewardGold=parseGoldMilli(reward.baseGoldMilli)*multiplier/1000n;
    const gold=parseGoldMilli(tx.profile.goldMilli)+rewardGold;
    if(gold>MAX_GOLD)reject('PROFILE_OVERFLOW',503);
    tx.profile.goldMilli=gold.toString();
    const lootGold=parseGoldMilli(run.loot.goldMilli)+rewardGold;
    if(lootGold>MAX_GOLD)reject('PROFILE_OVERFLOW',503);run.loot.goldMilli=lootGold.toString();
    const increment=(key:'steel'|'ember'|'core')=>{if(tx.profile.components[key]>=MAX_COMPONENT||run.loot!.components[key]>=MAX_COMPONENT)reject('PROFILE_OVERFLOW',503);tx.profile.components[key]++;run.loot!.components[key]++;};
    for(let i=0;i<reward.coreDrops;i++)increment('core');
    for(let i=0;i<reward.commonDrops;i++){
      const sample=createHash('sha256').update(`${run.runId}:${event.enemyId}:loot:${i}`).digest().readUInt32BE(0)/0x1_0000_0000;
      increment(sample<reward.steelProbability?'steel':'ember');
    }
    tx.profile.stats.totalKills++;
  }
  private spend(profile:Profile,definitionId:string,currentLevel=0,catalog=EQUIPMENT_CATALOG):void {
    let cost;try{cost=recipeCost(definitionId,currentLevel,catalog);}catch{return reject('UNKNOWN_RECIPE');}
    if(!canCraft(profile,cost))reject('INSUFFICIENT_RESOURCES');
    profile.goldMilli=(parseGoldMilli(profile.goldMilli)-parseGoldMilli(cost.goldMilli)).toString();
    for(const key of ['steel','ember','core'] as const)profile.components[key]-=cost.components[key];
  }
  private shop(tx:TransactionContext):RunSimulation {
    if(!tx.run)reject('SHOP_REQUIRED');
    const sim=this.restore(tx.run);if(sim.state.phase!=='shop')reject('SHOP_REQUIRED');return sim;
  }
  private galleryOrShop(tx:TransactionContext):RunSimulation|null {
    if(!tx.run)return null;
    const sim=this.restore(tx.run);if(sim.state.phase!=='shop'&&sim.state.phase!=='gameOver')reject('INVALID_PHASE');return sim;
  }
  private async apply(tx: TransactionContext,op:Operation):Promise<void> {
    const p=op.payload as Record<string,unknown>;
    if(tx.run&&['craft','upgrade','equip','quick_slots'].includes(op.type)) {
      const sim=this.restore(tx.run);
      if(sim.state.phase!=='gameOver'&&tx.run.ownerClientId!==op.clientId)reject('RUN_NOT_OWNER',409);
    }
    switch(op.type) {
      case 'start_run': {
        if(tx.run){const sim=this.restore(tx.run);if(sim.state.phase!=='gameOver')reject('RUN_BUSY',409);}
        const balance=tx.currentBalance;if(!balance)reject('BALANCE_STORAGE_UNAVAILABLE',503);const compiled=balance.compiled;
        const runId=randomUUID(); const sim=new RunSimulation(runId,randomInt(0,0x1_0000_0000),{config:compiled.config,shopZone:compiled.shopZone,...(compiled.runtime===undefined?{}:{runtimeBalance:compiled.runtime})});sim.pause();sim.setEquipment(computeModifiers(tx.profile,compiled.equipment,compiled.baseModifiers));
        tx.run={balanceRevision:balance.revision,balance:structuredClone(balance),runId,loot:{goldMilli:'0',components:{steel:0,ember:0,core:0}},snapshot:sim.exportSnapshot(),ownerClientId:op.clientId,ownerEpoch:1,updatedAt:new Date(this.clock()).toISOString(),wallAnchorMs:this.clock(),simAnchorTime:0.25,rewardedEnemyIds:[],statsCommitted:false};break;
      }
      case 'advance_run': {
        const run=this.owned(tx,op),sim=this.restore(run);
        if(sim.state.phase!=='running')reject('INVALID_PHASE');
        const frames=p.frames as Command[][];
        const budget=run.simAnchorTime+Math.max(0,(this.clock()-run.wallAnchorMs)/1000);
        if(sim.state.time+frames.length*FIXED_STEP>budget+1e-8)reject('ADVANCE_TOO_FAST',409);
        for(const frame of frames){
          if(sim.state.phase!=='running')break;
          sim.step(frame);
          for(const event of sim.state.events)this.reward(tx,event);
        }
        if((sim.state.phase as string)!=='running')this.bankActiveTime(run);
        if((sim.state.phase as string)==='gameOver')this.finish(tx,sim);
        this.save(run,sim);break;
      }
      case 'pause_run': {const run=this.owned(tx,op),sim=this.restore(run);if(sim.state.phase==='running')this.bankActiveTime(run);sim.pause();this.save(run,sim);break;}
      case 'resume_run': {const run=this.owned(tx,op),sim=this.restore(run);if(sim.state.phase!=='paused')reject('INVALID_PHASE');sim.resume();run.wallAnchorMs=this.clock();this.save(run,sim);break;}
      case 'leave_shop': {const run=this.owned(tx,op),sim=this.restore(run);if(!sim.leaveShop())reject('INVALID_PHASE');this.save(run,sim);break;}
      case 'end_run': {
        const run=this.owned(tx,op);
        try{const sim=RunSimulation.restore(run.snapshot);if(sim.state.phase==='running')this.bankActiveTime(run);sim.abandon();this.finish(tx,sim);this.save(run,sim);}catch(error){if(error instanceof ProfileError)throw error;tx.run=null;}
        break;
      }
      case 'takeover_run': {
        if(!tx.run||tx.run.runId!==p.runId)reject('RUN_NOT_FOUND',404);
        const sim=this.restore(tx.run);if(sim.state.phase==='running')this.bankActiveTime(tx.run);sim.pause();if(tx.run.ownerEpoch>=Number.MAX_SAFE_INTEGER)reject('RUN_OVERFLOW',503);tx.run.ownerClientId=op.clientId;tx.run.ownerEpoch++;this.save(tx.run,sim);break;
      }
      case 'craft': {
        const sim=this.shop(tx),definitionId=p.definitionId as string;
        const catalog=(tx.run!.balance??LEGACY_BALANCE).compiled.equipment;
        const definition=catalog.items.find(i=>i.id===definitionId),consumable=catalog.consumables.find(i=>i.id===definitionId);
        if(!definition&&!consumable)reject('UNKNOWN_RECIPE');
        this.spend(tx.profile,definitionId,0,catalog);
        if(definition)tx.profile.items.push({id:randomUUID(),definitionId:definition.id,level:1});
        else {const key=definitionId as ConsumableId;if(tx.profile.consumables[key]>=MAX_COMPONENT)reject('PROFILE_OVERFLOW',503);tx.profile.consumables[key]++;}
        this.save(tx.run!,sim);break;
      }
      case 'upgrade': {
        const sim=this.shop(tx),item=tx.profile.items.find(i=>i.id===p.itemId);if(!item)reject('ITEM_NOT_FOUND',403);
        const compiled=(tx.run!.balance??LEGACY_BALANCE).compiled;this.spend(tx.profile,item.definitionId,item.level,compiled.equipment);item.level++;sim.setEquipment(computeModifiers(tx.profile,compiled.equipment,compiled.baseModifiers));this.save(tx.run!,sim);break;
      }
      case 'equip': {
        const sim=this.galleryOrShop(tx),slot=p.slot as Slot,itemId=p.itemId as string|null;
        if(itemId!==null){const item=tx.profile.items.find(i=>i.id===itemId);if(!item)reject('ITEM_NOT_FOUND',403);const definition=getItemDefinition(item.definitionId);if(!definition||definition.slot!==slot)reject('INCOMPATIBLE_ITEM');}
        tx.profile.loadouts.pudge[slot]=itemId;
        if(sim){const compiled=(tx.run!.balance??LEGACY_BALANCE).compiled;sim.setEquipment(computeModifiers(tx.profile,compiled.equipment,compiled.baseModifiers));this.save(tx.run!,sim);}break;
      }
      case 'quick_slots': {this.galleryOrShop(tx);tx.profile.loadouts.pudge.quick=p.slots as [ConsumableId|null,ConsumableId|null];break;}
      case 'consume': {
        const run=this.owned(tx,op),sim=this.restore(run),definitionId=p.definitionId as ConsumableId;
        if(!(run.balance??LEGACY_BALANCE).compiled.equipment.consumables.some(i=>i.id===definitionId)||!tx.profile.loadouts.pudge.quick.includes(definitionId))reject('CONSUMABLE_UNAVAILABLE');
        if(tx.profile.consumables[definitionId]<=0)reject('CONSUMABLE_UNAVAILABLE');
        try { if(!sim.applyConsumable(definitionId))reject('CONSUMABLE_UNAVAILABLE'); }catch{return reject('CONSUMABLE_UNAVAILABLE');}
        tx.profile.consumables[definitionId]--;this.save(run,sim);break;
      }
      default: reject('INVALID_OPERATION');
    }
  }
}
export { EQUIPMENT_CATALOG };
