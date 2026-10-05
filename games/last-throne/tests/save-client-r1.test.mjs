import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveManager,ApiError} from '../web/src/save-client.ts';
globalThis.window ??= new EventTarget();
const base = () => ({key:'branch',runId:'run',clientRunId:'client',pins:{snapshotSchemaVersion:2},seed:7,serverRevision:1,localGeneration:0,confirmedGeneration:0,latestLocalCheckpoint:null,terminalRecord:null,pendingOperation:null,conflict:null,updatedAt:0});
class Store {
  constructor(record=base()){this.value=structuredClone(record);}
  async get(){return structuredClone(this.value);}
  async put(r){this.value=structuredClone(r);}
  async update(_key,change){const next=structuredClone(this.value);change(next);this.value=next;return structuredClone(next);}
  async list(){return [await this.get()];}
}
const waitFor=async(predicate)=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,1));}throw Error('condition timeout');};
test('pending A remains exact while local C advances; after reload A then C use successive revisions',async()=>{
  const store=new Store();let calls=[];let online=false;
  const send=async(_run,op)=>{calls.push(structuredClone(op));if(!online)throw Error('network lost');return{revision:op.body.expectedRevision+1};};
  let manager=new SaveManager('branch',store,()=>{},send);
  await manager.checkpoint({wave:1,gold:100});await waitFor(()=>calls.length===1);
  const pending=structuredClone(store.value.pendingOperation);
  await manager.checkpoint({wave:2,gold:140});await manager.checkpoint({wave:3,gold:220});
  await waitFor(()=>calls.length>=2);manager.dispose();
  assert.deepEqual(store.value.pendingOperation,pending);assert.equal(store.value.latestLocalCheckpoint.wave,3);
  calls=[];online=true;manager=new SaveManager('branch',store,()=>{},send);await manager.sync();
  assert.deepEqual(calls[0],pending);assert.equal(calls.length,2);
  assert.deepEqual(calls[1].body.snapshot,{wave:3,gold:220});assert.equal(calls[1].body.expectedRevision,2);
  assert.notEqual(calls[1].body.requestId,pending.body.requestId);assert.equal(store.value.serverRevision,3);
  assert.equal(store.value.confirmedGeneration,3);manager.dispose();
});
test('offline terminal settles pending checkpoint then finish and never sends newer checkpoint',async()=>{
  const store=new Store();let online=false;const calls=[];
  const send=async(_run,op)=>{if(!online)throw Error('offline');calls.push(structuredClone(op));return{revision:op.body.expectedRevision+1};};
  const m=new SaveManager('branch',store,()=>{},send);
  await m.checkpoint({wave:1});await new Promise(r=>setTimeout(r,5));
  await m.checkpoint({wave:2});await m.finish({outcome:'defeat',wave:2});await new Promise(r=>setTimeout(r,5));
  online=true;await m.sync();assert.deepEqual(calls.map(c=>c.kind),['checkpoint','finish']);
  assert.equal(calls[0].body.snapshot.wave,1);assert.equal(calls[1].body.expectedRevision,2);
  assert.equal(store.value.terminalRecord.outcome,'defeat');assert.equal(store.value.pendingOperation,null);m.dispose();
});
test('revision conflict preserves both local generation and immutable pending body',async()=>{
  const store=new Store();const statuses=[];let calls=0;
  const m=new SaveManager('branch',store,(s)=>statuses.push(s),async()=>{calls++;throw new ApiError(409,'REVISION_CONFLICT','another tab');});
  await m.checkpoint({wave:3,gold:999});await waitFor(()=>store.value.conflict!==null);
  const before=await store.get();await m.sync();assert.equal(calls,1);
  assert.deepEqual(store.value.pendingOperation,before.pendingOperation);assert.deepEqual(store.value.latestLocalCheckpoint,{wave:3,gold:999});
  assert.equal(statuses.at(-1),'conflict');m.dispose();
});
test('failed local transaction prevents checkpoint acceptance and any cloud request',async()=>{
  let sent=0;const store={get:async()=>base(),update:async()=>{throw Error('quota');}};
  const m=new SaveManager('branch',store,()=>{},async()=>{sent++;return{revision:2};});
  await assert.rejects(m.checkpoint({wave:1}),/quota/);assert.equal(sent,0);m.dispose();
});
test('late A response acknowledges A only; newer C is independently sent',async()=>{
  const store=new Store();let release;const calls=[];
  const m=new SaveManager('branch',store,()=>{},async(_run,op)=>{calls.push(structuredClone(op));if(calls.length===1)return await new Promise(r=>{release=r;});return{revision:op.body.expectedRevision+1};});
  await m.checkpoint({wave:1});await waitFor(()=>release);await m.checkpoint({wave:3});
  assert.equal(store.value.confirmedGeneration,0);release({revision:2});await waitFor(()=>store.value.pendingOperation===null);
  assert.equal(calls.length,2);assert.equal(calls[1].body.snapshot.wave,3);assert.equal(store.value.confirmedGeneration,2);m.dispose();
});
