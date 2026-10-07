import { createHash } from 'node:crypto';
import { canonicalJson } from './content.mjs';
import { createGameStore as createRetainedStore } from './game-store.mjs';

const codes = /\b(RUN_NOT_FOUND|PROFILE_NOT_FOUND|IDEMPOTENCY_CONFLICT|REVISION_CONFLICT|RUN_FINISHED|VERSION_MISMATCH|CONTENT_INCOMPATIBLE|SNAPSHOT_INVALID|RESULT_INVALID|REQUEST_INVALID|INVALID_PARAMETER(?:_TYPE)?|VALUE_CONSTRAINT_FAILED|REQUIRED_PARAMETER_MISSING)\b/;
const statuses = { RUN_NOT_FOUND:404, PROFILE_NOT_FOUND:404, IDEMPOTENCY_CONFLICT:409, REVISION_CONFLICT:409, RUN_FINISHED:409 };
function normalize(error) {
  const code = String(error.message ?? '').match(codes)?.[1];
  if (code) { error.code = code; error.statusCode = statuses[code] ?? 422; }
  return error;
}
async function call(client, name, args) {
  try { return (await client.query(`SELECT last_throne.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS value`, args)).rows[0].value; }
  catch (error) { throw normalize(error); }
}
async function transact(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await client.query("SET LOCAL statement_timeout='15s'");
    const value = await action(client); await client.query('COMMIT'); return value;
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw normalize(error); }
  finally { client.release(); }
}
async function metadata(client, owner, id) {
  const { rows } = await client.query('SELECT metadata_schema_version FROM last_throne.entities WHERE id=$1 AND owner_id=$2 AND run_id=id', [id,owner]);
  if (!rows.length) throw Object.assign(new Error('RUN_NOT_FOUND'), { code:'RUN_NOT_FOUND', statusCode:404 });
  return rows[0].metadata_schema_version;
}
function r3Pins(run) {
  return run.coreVersion === 'r3-core-1' && run.metadataSchemaVersion === 'r3-meta-1' && run.snapshotSchemaVersion === 4
    && typeof run.contentVersion === 'string' && run.contentVersion.startsWith('r3-content-');
}
/** Old operations remain routed through their unchanged store and SQL functions. */
export function createGameStore(pool) {
  const retained = createRetainedStore(pool);
  const isR3 = async (owner,id) => await metadata(pool,owner,id) === 'r3-meta-1';
  async function prepare(client, owner, id, envelope, canonicalHash) {
    const args = [owner,id,envelope.requestId,canonicalHash,envelope.expectedRevision];
    const gate = await call(client,'r3_prepare_save',args);
    if (!gate.duplicate && !r3Pins(gate.run)) throw Object.assign(new Error('VERSION_MISMATCH'), {code:'VERSION_MISMATCH',statusCode:422});
    return { args,gate };
  }
  return {
    ...retained,
    createRun(owner,payload,pins) {
      if (pins.metadataSchemaVersion !== 'r3-meta-1') return retained.createRun(owner,payload,pins);
      if (!r3Pins(pins)) throw Object.assign(new Error('VERSION_MISMATCH'), {code:'VERSION_MISMATCH',statusCode:422});
      const hash = createHash('sha256').update(canonicalJson({canonicalization:1,payload,pins})).digest('hex');
      return call(pool,'r3_create_run',[owner,JSON.stringify(payload),JSON.stringify(pins),hash]);
    },
    listRuns: (owner,cursor=null) => call(pool,'r3_list_runs',[owner,cursor===null?null:JSON.stringify(cursor)]),
    getRun: async (owner,id) => await isR3(owner,id) ? call(pool,'r3_run',[owner,id]) : retained.getRun(owner,id),
    getCheckpoint: async (owner,id) => await isR3(owner,id) ? call(pool,'r3_checkpoint',[owner,id]) : retained.getCheckpoint(owner,id),
    async commitCheckpoint(owner,id,envelope,canonicalHash,validate) {
      if (!await isR3(owner,id)) return retained.commitCheckpoint(owner,id,envelope,canonicalHash,validate);
      return transact(pool,async client=>{
        const {args,gate}=await prepare(client,owner,id,envelope,canonicalHash);
        if (gate.duplicate) return gate.response;
        const snapshot = typeof validate === 'function' ? await validate(gate.run,client) : validate;
        if (!snapshot) throw Object.assign(new Error('SNAPSHOT_INVALID'), {code:'SNAPSHOT_INVALID',statusCode:422});
        return call(client,'r3_commit_checkpoint',[...args,JSON.stringify(snapshot)]);
      });
    },
    async finishRun(owner,id,envelope,canonicalHash) {
      if (!await isR3(owner,id)) return retained.finishRun(owner,id,envelope,canonicalHash);
      return transact(pool,async client=>{
        const {args,gate}=await prepare(client,owner,id,envelope,canonicalHash);
        return gate.duplicate ? gate.response : call(client,'r3_finish',[...args,JSON.stringify(envelope.result)]);
      });
    },
  };
}
