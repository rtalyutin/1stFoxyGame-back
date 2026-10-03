import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {RunLedger,validateEventBatch} from '../dist/game/run-ledger.js';
const owner=randomUUID();
const batch=events=>({batchId:randomUUID(),catalogVersion:'r2.1',rulesVersion:'r2.1',events});
const cast=(sequence,tick,castId)=>({eventId:randomUUID(),sequence,tick,type:'cast',castId});
const hit=(sequence,tick,castId,enemyId)=>({eventId:randomUUID(),sequence,tick,type:'hit',castId,enemyId});
const end=(sequence,tick,enemyId,reason='contact')=>({eventId:randomUUID(),sequence,tick,type:'end',reason,enemyId});
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('owner-bound run has generated stable ID/seed/version and rejects foreign owner',()=>{
  const ledger=new RunLedger(),run=ledger.createRun(owner);
  assert.match(run.runId,/^[0-9a-f-]{36}$/);assert.ok(Number.isSafeInteger(run.seed));
  assert.equal(run.rulesVersion,'r2.1');
  rejects(()=>ledger.getRun(randomUUID(),run.runId),'RUN_NOT_OWNED');
  rejects(()=>ledger.registerEnemy(randomUUID(),run.runId,'boss',0),'RUN_NOT_OWNED');
  rejects(()=>ledger.appendBatch(randomUUID(),run.runId,batch([cast(1,0,1)])),'RUN_NOT_OWNED');
  rejects(()=>ledger.createRun('caller-text'),'INVALID_OWNER');
});

test('boss requires three distinct casts; duplicate hit cannot reduce health and failed batch is atomic',()=>{
  const ledger=new RunLedger(),run=ledger.createRun(owner),id=ledger.registerEnemy(owner,run.runId,'boss',0);
  assert.equal(id,`${run.runId}:enemy:1`);
  ledger.appendBatch(owner,run.runId,batch([cast(1,0,1),hit(2,1,1,id)]));
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([hit(3,2,1,id)])),'CAST_ALREADY_HIT');
  assert.equal(ledger.getRun(owner,run.runId).nextSequence,3);
  ledger.appendBatch(owner,run.runId,batch([cast(3,120,2),hit(4,121,2,id)]));
  assert.equal(ledger.getRun(owner,run.runId).kills,0);
  ledger.appendBatch(owner,run.runId,batch([cast(5,240,3),hit(6,241,3,id)]));
  assert.equal(ledger.getRun(owner,run.runId).kills,1);
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(7,360,4),hit(8,361,4,id)])),'ENEMY_DEAD');
  assert.equal(ledger.getRun(owner,run.runId).nextSequence,7);
  assert.ok(ledger.registerEnemy(owner,run.runId,'boss',400));
});

test('batch/event deduplication is exact, canonical and safe after terminal',()=>{
  const ledger=new RunLedger(),run=ledger.createRun(owner),id=ledger.registerEnemy(owner,run.runId,'strong',0);
  const b=batch([cast(1,0,1),hit(2,1,1,id)]),first=ledger.appendBatch(owner,run.runId,b);
  assert.equal(first.kills,1);assert.equal(ledger.appendBatch(owner,run.runId,{...b,events:structuredClone(b.events)}).replayed,true);
  const changed=structuredClone(b);changed.events[1].tick=2;
  rejects(()=>ledger.appendBatch(owner,run.runId,changed),'BATCH_CONFLICT');
  assert.equal(ledger.appendBatch(owner,run.runId,batch([b.events[0]])).accepted,0);
  const eventConflict=structuredClone(b.events[0]);eventConflict.tick=2;
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([eventConflict])),'EVENT_CONFLICT');
  // Already-fired bullet may still kill after its source died.
  const terminal=batch([end(3,2,id,'hero_hit')]);
  assert.equal(ledger.appendBatch(owner,run.runId,terminal).terminal,true);
  assert.equal(ledger.appendBatch(owner,run.runId,terminal).replayed,true);
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(4,120,2)])),'RUN_TERMINAL');
  rejects(()=>ledger.registerEnemy(owner,run.runId,'normal',20),'RUN_TERMINAL');
});

test('ordering, cooldown, references, versions and terminal sources are validated without partial changes',()=>{
  const ledger=new RunLedger(),run=ledger.createRun(owner),id=ledger.registerEnemy(owner,run.runId,'normal',5);
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(2,0,1)])),'EVENT_ORDER');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(1,0,1),hit(2,1,1,id)])),'UNKNOWN_ENEMY');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([hit(1,5,1,id)])),'UNKNOWN_CAST');
  rejects(()=>ledger.appendBatch(owner,run.runId,{...batch([cast(1,0,1)]),rulesVersion:'r1.0'}),'VERSION_MISMATCH');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([end(1,5,id,'hero_hit')])),'INVALID_TERMINAL_SOURCE');
  ledger.appendBatch(owner,run.runId,batch([cast(1,5,1)]));
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(2,124,2)])),'CAST_COOLDOWN');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([hit(2,5,1,`${run.runId}:enemy:999`)])),'UNKNOWN_ENEMY');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([hit(2,4,1,id)])),'EVENT_ORDER');
  assert.equal(ledger.getRun(owner,run.runId).nextSequence,2);
});

test('only one live boss and one outbound target per cast are allowed',()=>{
  const ledger=new RunLedger(),run=ledger.createRun(owner),a=ledger.registerEnemy(owner,run.runId,'boss',0),b=ledger.registerEnemy(owner,run.runId,'normal',0);
  rejects(()=>ledger.registerEnemy(owner,run.runId,'boss',0),'BOSS_LIMIT');
  rejects(()=>ledger.appendBatch(owner,run.runId,batch([cast(1,0,1),hit(2,1,1,a),hit(3,1,1,b)])),'CAST_ALREADY_HIT');
  assert.equal(ledger.getRun(owner,run.runId).nextSequence,1);
});

test('payload schema rejects rewards, extra trusted fields, oversized batches and invalid numeric/ID data',()=>{
  for(const bad of [batch([{type:'reward',gold:1}]),{...batch([cast(1,0,1)]),accountId:owner},batch([]),
    batch(Array.from({length:129},()=>cast(1,0,1))),batch([cast(1,-1,1)]),batch([cast(1,0,1.5)]),
    {...batch([cast(1,0,1)]),batchId:'not-uuid'},batch([{...cast(1,0,1),gold:1}])]) {
    rejects(()=>validateEventBatch(bad),'INVALID_EVENT_BATCH');
  }
});
