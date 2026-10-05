import { createHash } from 'node:crypto';
import { canonicalJson } from './content.mjs';
const status = {RUN_NOT_FOUND:404,PROFILE_NOT_FOUND:404,IDEMPOTENCY_CONFLICT:409,REVISION_CONFLICT:409,RUN_FINISHED:409,SESSION_EXPIRED:401,METADATA_NOT_PUBLISHED:503,CONTENT_INCOMPATIBLE:422,VERSION_MISMATCH:422};
function normalizedError(error) {
 const code = String(error.message ?? '').match(/\b(?:RUN_NOT_FOUND|PROFILE_NOT_FOUND|IDEMPOTENCY_CONFLICT|REVISION_CONFLICT|RUN_FINISHED|SESSION_EXPIRED|METADATA_NOT_PUBLISHED|CONTENT_INCOMPATIBLE|VERSION_MISMATCH|SNAPSHOT_INVALID|RESULT_INVALID|SETTINGS_INVALID|SESSION_INVALID|REQUEST_INVALID|INVALID_PARAMETER(?:_TYPE)?|VALUE_CONSTRAINT_FAILED|REQUIRED_PARAMETER_MISSING)\b/)?.[0];
 if (code) { error.code = code; error.statusCode = status[code] ?? 422; }
 return error;
}
async function invoke(client,name,args) {
 try { const placeholders=args.map((_,i)=>`$${i+1}`).join(','); return (await client.query(`SELECT last_throne.${name}(${placeholders}) AS value`,args)).rows[0].value; }
 catch(error) { throw normalizedError(error); }
}
async function transaction(pool,operation) {
 const client=await pool.connect();
 try { await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='15s'"); const value=await operation(client); await client.query('COMMIT'); return value; }
 catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw normalizedError(error); }
 finally { client.release(); }
}
function pinFamily(pins) {
 const core=pins.coreVersion,meta=pins.metadataSchemaVersion,format=pins.snapshotSchemaVersion;
 if(core==='r1-core-1'&&meta==='r1-meta-1'&&format===2)return 'r1';
 if(core==='r2-core-1'&&meta==='r2-meta-1'&&format===3)return 'r2';
 throw Object.assign(new Error('VERSION_MISMATCH'),{code:'VERSION_MISMATCH',statusCode:422});
}
async function runFamily(client,owner,id) {
 // Read only the owning immutable type membership; the chosen gate performs the
 // authoritative row lock, replay, revision/status and semantic checks in order.
 const {rows}=await client.query("SELECT metadata_schema_version FROM last_throne.entities WHERE id=$1 AND owner_id=$2 AND run_id=id",[id,owner]);
 if(!rows.length)throw Object.assign(new Error('RUN_NOT_FOUND'),{code:'RUN_NOT_FOUND',statusCode:404});
 const meta=rows[0].metadata_schema_version;
 if(meta==='r1-meta-1')return 'r1';
 if(meta==='r2-meta-1')return 'r2';
 throw Object.assign(new Error('VERSION_MISMATCH'),{code:'VERSION_MISMATCH',statusCode:422});
}
export function createGameStore(pool) {
 const call=(name,args)=>invoke(pool,name,args);
 return {
 guestSession:tokenHash=>call('r1_guest',[tokenHash]),
 createGuest:(tokenHash,expiresAt)=>call('r1_create_guest',[tokenHash,expiresAt]),
 getProfile:owner=>call('r1_profile',[owner]),
 patchProfile:(owner,expectedRevision,settings)=>call('r1_patch_profile',[owner,expectedRevision,JSON.stringify(settings)]),
 createRun:(owner,payload,pins)=>call(`${pinFamily(pins)}_create_run`,[owner,JSON.stringify(payload),JSON.stringify(pins),createHash('sha256').update(canonicalJson({canonicalization:1,payload,pins})).digest('hex')]),
 listRuns:(owner,cursor=null)=>call('r2_list_runs',[owner,cursor===null?null:JSON.stringify(cursor)]),
 getRun:async(owner,id)=>call(`${await runFamily(pool,owner,id)}_run`,[owner,id]),
 getCheckpoint:async(owner,id)=>call(`${await runFamily(pool,owner,id)}_checkpoint`,[owner,id]),
 commitCheckpoint:(owner,id,envelope,canonicalHash,validatedSnapshot)=>transaction(pool,async client=>{
  const args=[owner,id,envelope.requestId,canonicalHash,envelope.expectedRevision];
  const family=await runFamily(client,owner,id);
  const gate=await invoke(client,`${family}_prepare_save`,args);
  if(gate.duplicate) return gate.response;
  if(pinFamily(gate.run)!==family)throw Object.assign(new Error('VERSION_MISMATCH'),{code:'VERSION_MISMATCH',statusCode:422});
  const snapshot=typeof validatedSnapshot==='function'?await validatedSnapshot(gate.run,client):validatedSnapshot;
  if(!snapshot) throw Object.assign(new Error('SNAPSHOT_INVALID'),{code:'SNAPSHOT_INVALID',statusCode:422});
  return invoke(client,`${family}_commit_checkpoint`,[...args,JSON.stringify(snapshot)]);
 }),
 finishRun:(owner,id,envelope,canonicalHash)=>transaction(pool,async client=>{
  const family=await runFamily(client,owner,id);
  const args=[owner,id,envelope.requestId,canonicalHash,envelope.expectedRevision];
  const gate=await invoke(client,`${family}_prepare_save`,args);
  if(gate.duplicate)return gate.response;
  if(pinFamily(gate.run)!==family)throw Object.assign(new Error('VERSION_MISMATCH'),{code:'VERSION_MISMATCH',statusCode:422});
  return invoke(client,`${family}_finish`,[...args,JSON.stringify(envelope.result)]);
 }),
 };
}
// Convenient pool-first aliases; every mutation still uses the bounded functions.
export const guestSession=(pool,...args)=>createGameStore(pool).guestSession(...args);
export const createGuest=(pool,...args)=>createGameStore(pool).createGuest(...args);
export const getProfile=(pool,...args)=>createGameStore(pool).getProfile(...args);
export const patchProfile=(pool,...args)=>createGameStore(pool).patchProfile(...args);
export const createRun=(pool,...args)=>createGameStore(pool).createRun(...args);
export const listRuns=(pool,...args)=>createGameStore(pool).listRuns(...args);
export const getRun=(pool,...args)=>createGameStore(pool).getRun(...args);
export const getCheckpoint=(pool,...args)=>createGameStore(pool).getCheckpoint(...args);
export const commitCheckpoint=(pool,...args)=>createGameStore(pool).commitCheckpoint(...args);
export const finishRun=(pool,...args)=>createGameStore(pool).finishRun(...args);
