import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { catalog, type ContentCatalog, type EnemyDefinition } from './catalog.js';

export type RunEvent =
  | {eventId:string;sequence:number;tick:number;type:'cast';castId:number}
  | {eventId:string;sequence:number;tick:number;type:'hit';castId:number;enemyId:string}
  | {eventId:string;sequence:number;tick:number;type:'end';reason:'hero_hit'|'contact'|'breakthrough';enemyId:string};
export interface EventBatch { batchId:string;catalogVersion:string;rulesVersion:string;events:RunEvent[] }
interface EnemyState {code:EnemyDefinition['code'];hits:number;spawnTick:number;alive:boolean}
interface MutableRun {
  runId:string;accountId:string;seed:number;catalogVersion:string;rulesVersion:string;
  terminal:boolean;terminalReason:string|null;nextEnemy:number;nextSequence:number;lastTick:number;
  enemies:Map<string,EnemyState>;casts:Map<number,{tick:number;hitEnemy:string|null}>;
  events:Map<string,string>;batches:Map<string,{hash:string;result:BatchResult}>;kills:number;
}
export interface RunSnapshot {
  runId:string;accountId:string;seed:number;catalogVersion:string;rulesVersion:string;
  terminal:boolean;terminalReason:string|null;nextSequence:number;kills:number;
}
export interface BatchResult {accepted:number;nextSequence:number;terminal:boolean;kills:number;replayed:boolean}
export class RunProtocolError extends Error {
  constructor(readonly code:string) {super(code);this.name='RunProtocolError';}
}
const uuid = (v: unknown): v is string => typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const safe = (v:unknown,min=0): v is number => Number.isSafeInteger(v)&&(v as number)>=min;
function canonical(value:unknown):string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value&&typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = (v:unknown) => createHash('sha256').update(canonical(v)).digest('hex');
function exact(v:unknown,keys:string[]):asserts v is Record<string,unknown> {
  if (!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))) throw new RunProtocolError('INVALID_EVENT_BATCH');
}
export function validateEventBatch(value:unknown):EventBatch {
  exact(value,['batchId','catalogVersion','rulesVersion','events']);
  if (!uuid(value.batchId)||typeof value.catalogVersion!=='string'||typeof value.rulesVersion!=='string'||!Array.isArray(value.events)||value.events.length<1||value.events.length>128) throw new RunProtocolError('INVALID_EVENT_BATCH');
  for (const event of value.events) {
    const type=event&&typeof event==='object'?(event as Record<string,unknown>).type:undefined;
    const keys=type==='cast'?['eventId','sequence','tick','type','castId']:type==='hit'?['eventId','sequence','tick','type','castId','enemyId']:type==='end'?['eventId','sequence','tick','type','reason','enemyId']:[];
    exact(event,keys);
    if (!uuid(event.eventId)||!safe(event.sequence,1)||!safe(event.tick)) throw new RunProtocolError('INVALID_EVENT_BATCH');
    if ((type==='cast'||type==='hit')&&!safe(event.castId,1)) throw new RunProtocolError('INVALID_EVENT_BATCH');
    if ((type==='hit'||type==='end')&&(typeof event.enemyId!=='string'||event.enemyId.length>96)) throw new RunProtocolError('INVALID_EVENT_BATCH');
    if (type==='end'&&!['hero_hit','contact','breakthrough'].includes(event.reason as string)) throw new RunProtocolError('INVALID_EVENT_BATCH');
  }
  return structuredClone(value) as unknown as EventBatch;
}

/** Internal R2 protocol service. The account subject is supplied by trusted code,
 * never a public unauthenticated request. Geometry/replay verification and durable
 * economic commit belong to R3; accepting this ledger does not prove fair play. */
export class RunLedger {
  private readonly runs=new Map<string,MutableRun>();
  constructor(private readonly content:ContentCatalog=catalog) {}
  createRun(accountId:string):RunSnapshot {
    if (!uuid(accountId)) throw new RunProtocolError('INVALID_OWNER');
    const run:MutableRun={runId:randomUUID(),accountId,seed:randomBytes(4).readUInt32LE(),catalogVersion:this.content.catalogVersion,rulesVersion:this.content.rulesVersion,
      terminal:false,terminalReason:null,nextEnemy:1,nextSequence:1,lastTick:0,enemies:new Map(),casts:new Map(),events:new Map(),batches:new Map(),kills:0};
    this.runs.set(run.runId,run);
    return this.snapshot(run);
  }
  getRun(accountId:string,runId:string):RunSnapshot {return this.snapshot(this.owned(accountId,runId));}
  registerEnemy(accountId:string,runId:string,code:EnemyDefinition['code'],spawnTick:number):string {
    const run=this.owned(accountId,runId);
    if (run.terminal) throw new RunProtocolError('RUN_TERMINAL');
    if (!safe(spawnTick)||!this.content.enemies.some(e=>e.code===code)) throw new RunProtocolError('INVALID_ENEMY');
    if (code==='boss'&&[...run.enemies.values()].some(e=>e.code==='boss'&&e.alive)) throw new RunProtocolError('BOSS_LIMIT');
    const enemyId=`${run.runId}:enemy:${run.nextEnemy++}`;
    run.enemies.set(enemyId,{code,hits:0,spawnTick,alive:true});
    return enemyId;
  }
  appendBatch(accountId:string,runId:string,untrusted:unknown):BatchResult {
    const original=this.owned(accountId,runId);
    const batch=validateEventBatch(untrusted);
    if (batch.catalogVersion!==original.catalogVersion||batch.rulesVersion!==original.rulesVersion) throw new RunProtocolError('VERSION_MISMATCH');
    const payloadHash=hash(batch);const previous=original.batches.get(batch.batchId);
    if (previous) {
      if (previous.hash!==payloadHash) throw new RunProtocolError('BATCH_CONFLICT');
      return {...previous.result,replayed:true};
    }
    if (original.terminal) throw new RunProtocolError('RUN_TERMINAL');
    const run=structuredClone(original);let accepted=0;
    for (const event of batch.events) {
      const eventHash=hash(event); const old=run.events.get(event.eventId);
      if (old) {if(old!==eventHash) throw new RunProtocolError('EVENT_CONFLICT');continue;}
      if (run.terminal) throw new RunProtocolError('RUN_TERMINAL');
      if (event.sequence!==run.nextSequence||event.tick<run.lastTick) throw new RunProtocolError('EVENT_ORDER');
      if (event.type==='cast') {
        if (run.casts.has(event.castId)||event.castId!==run.casts.size+1) throw new RunProtocolError('CAST_ORDER');
        const previousCast=run.casts.get(event.castId-1);
        if (previousCast&&event.tick-previousCast.tick<Math.ceil(this.content.rules.hookCooldown*60)) throw new RunProtocolError('CAST_COOLDOWN');
        run.casts.set(event.castId,{tick:event.tick,hitEnemy:null});
      } else {
        const enemy=run.enemies.get(event.enemyId);
        if (!enemy||event.tick<enemy.spawnTick) throw new RunProtocolError('UNKNOWN_ENEMY');
        if (event.type==='hit') {
          const cast=run.casts.get(event.castId);
          if (!cast||event.tick<cast.tick) throw new RunProtocolError('UNKNOWN_CAST');
          if (!enemy.alive) throw new RunProtocolError('ENEMY_DEAD');
          if (cast.hitEnemy!==null) throw new RunProtocolError('CAST_ALREADY_HIT');
          cast.hitEnemy=event.enemyId;enemy.hits++;
          const definition=this.content.enemies.find(e=>e.code===enemy.code)!;
          if (enemy.hits>=definition.requiredHits) {enemy.alive=false;run.kills++;}
        } else {
          const definition=this.content.enemies.find(e=>e.code===enemy.code)!;
          if (event.reason==='hero_hit'?!definition.weaponCode:!enemy.alive) throw new RunProtocolError('INVALID_TERMINAL_SOURCE');
          run.terminal=true;run.terminalReason=event.reason;
        }
      }
      run.events.set(event.eventId,eventHash);run.nextSequence++;run.lastTick=event.tick;accepted++;
    }
    const result={accepted,nextSequence:run.nextSequence,terminal:run.terminal,kills:run.kills,replayed:false};
    run.batches.set(batch.batchId,{hash:payloadHash,result});
    this.runs.set(runId,run); // One synchronous atomic replacement; failed batches have no partial state.
    return result;
  }
  private owned(accountId:string,runId:string):MutableRun {
    const run=this.runs.get(runId);
    if (!run||run.accountId!==accountId) throw new RunProtocolError('RUN_NOT_OWNED');
    return run;
  }
  private snapshot(run:MutableRun):RunSnapshot {
    return {runId:run.runId,accountId:run.accountId,seed:run.seed,catalogVersion:run.catalogVersion,rulesVersion:run.rulesVersion,
      terminal:run.terminal,terminalReason:run.terminalReason,nextSequence:run.nextSequence,kills:run.kills};
  }
}
