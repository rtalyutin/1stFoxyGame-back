import type {randomUUID} from 'node:crypto';
import {Pool,type PoolConfig,type PoolClient,type Client} from 'pg';
import {EntityStore} from '../db/entity-store.js';
import type {Profile,OperationResult,ConsumableId,ItemDefinitionId,Slot,Components} from './contracts.js';
import {createEmptyProfile,validateProfile} from './equipment.js';
import {validateProvisionAccount,PASSWORD_HASH_PATTERN,type ProvisionAccount} from './auth.js';

export interface Account {id:string;login:string;passwordHash:string}
export interface Session {tokenHash:string;accountId:string;login:string;csrf:string;expiresAt:string}
export interface StoredRun {runId:string;snapshot:unknown;ownerClientId:string;ownerEpoch:number;updatedAt:string;wallAnchorMs:number;simAnchorTime:number;rewardedEnemyIds:string[];statsCommitted:boolean;loot?:{goldMilli:string;components:Components}}
export interface StoredOperation {hash:string;result:OperationResult}
export interface TransactionContext {profile:Profile;run:StoredRun|null;operations:Map<string,StoredOperation>}
export interface Repository {
 transaction<T>(accountId:string,fn:(tx:TransactionContext)=>Promise<T>|T,operationId?:string):Promise<T>;
 getProfile(accountId:string):Promise<Profile>;
 getRun(accountId:string):Promise<StoredRun|null>;
 getOperation(accountId:string,operationId:string):Promise<StoredOperation|null>;
 findAccount(login:string):Promise<Account|null>;
 createSession(accountId:string,tokenHash:string,csrf:string,expiresAt:string,expectedPasswordHash?:string):Promise<void>;
 getSession(tokenHash:string):Promise<Session|null>;
 revokeSession(tokenHash:string):Promise<void>;
 provision(accounts:ProvisionAccount[]):Promise<void>;
 rotatePassword(accountId:string,passwordHash:string):Promise<void>;
 readiness():Promise<void>;
 close():Promise<void>;
}
export class StorageError extends Error {
 readonly code='PROFILE_STORAGE_UNAVAILABLE';readonly statusCode=503;
 constructor(){super('Profile storage is inconsistent or unavailable.');}
}
type Values=Record<string,string|boolean|null>;
type TypedRow={code:string;data_type:string;value_text:string|null;value_integer:string|null;value_decimal:string|null;value_boolean:boolean|null;value_reference:string|null};
const slots:Slot[]=['weapon','body','legs','talisman'];
const clone=<T>(v:T):T=>structuredClone(v);
function safeInteger(value:unknown):number {const n=Number(value);if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(n))throw new StorageError();return n;}
function text(value:unknown):string {if(typeof value!=='string')throw new StorageError();return value;}
function integerDecimal(value:unknown):string {const v=text(value);if(!/^\d+(?:\.0+)?$/.test(v))throw new StorageError();return v.replace(/\.0+$/,'');}
const typeIds=['ca5d0000-0000-5000-a000-000000000001','ca5d0000-0000-5000-a000-000000000002','ca5d0000-0000-5000-a000-000000000003','ca5d0000-0000-5000-a000-000000000004'];
const expectedParameters=[['account','login'],['account','password-hash'],...['owner','gold-milli','steel','ember','core','slow-dust','collector-vial','runs','total-kills','best-distance'].map(code=>['profile',code]),...['owner','definition','level'].map(code=>['item-instance',code]),...['owner','hero','weapon','body','legs','talisman','quick-0','quick-1'].map(code=>['loadout',code])];
const expectedEconomyParameters=[...['code','label','version'].map(code=>['component-definition',code]),...['code','version','base-gold-milli','common-drops','core-drops','steel-probability'].map(code=>['reward-definition',code])];

export class PgRepository implements Repository {
 private readonly pool:Pool;private readonly ownsPool:boolean;
 constructor(connection:string|PoolConfig|Pool){this.ownsPool=!(connection instanceof Pool);this.pool=connection instanceof Pool?connection:new Pool(typeof connection==='string'?{connectionString:connection,connectionTimeoutMillis:10_000}:connection);}
 private async client<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  let c:PoolClient;try{c=await this.pool.connect();}catch{throw new StorageError();}
  try{return await fn(c);}catch(e){if(e&&typeof e==='object'&&'code'in e&&!('statusCode'in e))throw new StorageError();throw e;}finally{c.release();}
 }
 private async atom<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{return this.client(async c=>{await c.query('BEGIN');try{const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}});}
 private async locks(c:PoolClient,accountId:string):Promise<void>{
  // Acquire the constructor's shared type locks in one order before account
  // rows. Its triggers otherwise acquire them piecemeal during EAV writes.
  await c.query('SELECT id FROM entity_types WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[typeIds]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,34))',[accountId]);
  const r=await c.query("SELECT e.id FROM entities e JOIN entity_types t ON t.id=e.entity_type_id WHERE e.id=$1 AND t.code='account' AND e.state='active'",[accountId]);if(r.rowCount!==1)throw new StorageError();
 }
 private async values(c:PoolClient,id:string):Promise<Values>{
  const rows=(await c.query<TypedRow>('SELECT p.code,v.data_type,v.value_text,v.value_integer,v.value_decimal,v.value_boolean,v.value_reference FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1',[id])).rows;
  const out:Values={};for(const row of rows){if(row.code in out)throw new StorageError();out[row.code]=row.data_type==='text'?row.value_text:row.data_type==='integer'?row.value_integer:row.data_type==='decimal'?row.value_decimal:row.data_type==='reference'?row.value_reference:row.value_boolean;}return out;
 }
 private async owned(c:PoolClient,type:string,owner:string):Promise<{id:string;revision:string}[]>{return (await c.query<{id:string;revision:string}>(`SELECT e.id,e.revision FROM entities e JOIN entity_types t ON t.id=e.entity_type_id JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id WHERE t.code=$1 AND e.state='active' AND p.code='owner' AND v.value_reference=$2 ORDER BY e.id`,[type,owner])).rows;}
 private async loadProfile(c:PoolClient,accountId:string):Promise<Profile>{
  const profiles=await this.owned(c,'profile',accountId),loadouts=await this.owned(c,'loadout',accountId);if(profiles.length!==1||loadouts.length!==1)throw new StorageError();
  const pv=await this.values(c,profiles[0]!.id),lv=await this.values(c,loadouts[0]!.id);if(pv.owner!==accountId||lv.owner!==accountId||lv.hero!=='pudge')throw new StorageError();
  const items:Profile['items']=[];for(const item of await this.owned(c,'item-instance',accountId)){const iv=await this.values(c,item.id);if(iv.owner!==accountId)throw new StorageError();items.push({id:item.id,definitionId:text(iv.definition) as ItemDefinitionId,level:safeInteger(iv.level)});}
  const best=Number(text(pv['best-distance']));if(!Number.isFinite(best)||best<0)throw new StorageError();
  const profile:Profile={accountId,revision:safeInteger(profiles[0]!.revision),goldMilli:integerDecimal(pv['gold-milli']),components:{steel:safeInteger(pv.steel),ember:safeInteger(pv.ember),core:safeInteger(pv.core)},items,loadouts:{pudge:{weapon:lv.weapon===undefined?null:text(lv.weapon),body:lv.body===undefined?null:text(lv.body),legs:lv.legs===undefined?null:text(lv.legs),talisman:lv.talisman===undefined?null:text(lv.talisman),quick:[lv['quick-0']===undefined?null:text(lv['quick-0']) as ConsumableId,lv['quick-1']===undefined?null:text(lv['quick-1']) as ConsumableId]}},consumables:{slow_dust:safeInteger(pv['slow-dust']),collector_vial:safeInteger(pv['collector-vial'])},stats:{runs:safeInteger(pv.runs),totalKills:safeInteger(pv['total-kills']),bestDistance:best}};
  try{return validateProfile(profile);}catch{throw new StorageError();}
 }
 private async saveProfile(c:PoolClient,profile:Profile,initial=false):Promise<void>{
  validateProfile(profile);const store=new EntityStore(c as unknown as Client);
  let profileId:string,loadoutId:string;const ownedProfiles=await this.owned(c,'profile',profile.accountId),ownedLoadouts=await this.owned(c,'loadout',profile.accountId);
  if(initial){if(ownedProfiles.length||ownedLoadouts.length)throw new StorageError();profileId=await store.create('profile');loadoutId=await store.create('loadout');await store.set(profileId,'owner',{type:'reference',value:profile.accountId});await store.set(loadoutId,'owner',{type:'reference',value:profile.accountId});await store.set(loadoutId,'hero',{type:'text',value:'pudge'});}else{if(ownedProfiles.length!==1||ownedLoadouts.length!==1)throw new StorageError();profileId=ownedProfiles[0]!.id;loadoutId=ownedLoadouts[0]!.id;}
  const integers:Record<string,number>={...profile.components,'slow-dust':profile.consumables.slow_dust,'collector-vial':profile.consumables.collector_vial,runs:profile.stats.runs,'total-kills':profile.stats.totalKills};
  for(const [code,value] of Object.entries(integers))await store.set(profileId,code,{type:'integer',value:BigInt(value)});
  await store.set(profileId,'gold-milli',{type:'decimal',value:profile.goldMilli});await store.set(profileId,'best-distance',{type:'decimal',value:String(profile.stats.bestDistance)});
  const existing=await this.owned(c,'item-instance',profile.accountId),ownedIds=new Set(existing.map(e=>e.id));
  if(existing.some(item=>!profile.items.some(i=>i.id===item.id)))throw new StorageError();
  for(const item of profile.items){
   if(!ownedIds.has(item.id)){if((await c.query('SELECT id FROM entities WHERE id=$1',[item.id])).rowCount)throw new StorageError();await store.create('item-instance',item.id as ReturnType<typeof randomUUID>);await store.set(item.id,'owner',{type:'reference',value:profile.accountId});await store.set(item.id,'definition',{type:'text',value:item.definitionId});}
   else {const iv=await this.values(c,item.id);if(iv.owner!==profile.accountId||iv.definition!==item.definitionId)throw new StorageError();}
   await store.set(item.id,'level',{type:'integer',value:BigInt(item.level)});if(!ownedIds.has(item.id))await store.publish(item.id);
  }
  for(const slot of slots){const instance=profile.loadouts.pudge[slot];if(instance===null)await c.query('DELETE FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=(SELECT id FROM entity_parameters WHERE entity_type_id=$2 AND code=$3)',[loadoutId,typeIds[3],slot]);else await store.set(loadoutId,slot,{type:'reference',value:instance});}
  for(const [i,key] of ['quick-0','quick-1'].entries()){const value=profile.loadouts.pudge.quick[i];if(value===null)await c.query('DELETE FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=(SELECT id FROM entity_parameters WHERE entity_type_id=$2 AND code=$3)',[loadoutId,typeIds[3],key]);else if(value!==undefined)await store.set(loadoutId,key,{type:'text',value});}
  if(initial){await store.publish(profileId);await store.publish(loadoutId);}
  await c.query('UPDATE entities SET revision=$2,updated_at=now() WHERE id=$1',[profileId,profile.revision]);
 }
 private async loadRun(c:PoolClient,accountId:string):Promise<StoredRun|null>{
  const r=(await c.query(`SELECT run_id,snapshot,owner_client_id,owner_epoch,updated_at,wall_anchor_ms,sim_anchor_time,rewarded_enemy_ids,stats_committed,loot_gold_milli,loot_steel,loot_ember,loot_core FROM profile_runs WHERE account_id=$1`,[accountId])).rows[0];if(!r)return null;
  return {runId:r.run_id,snapshot:r.snapshot,ownerClientId:r.owner_client_id,ownerEpoch:safeInteger(String(r.owner_epoch)),updatedAt:new Date(r.updated_at).toISOString(),wallAnchorMs:safeInteger(String(r.wall_anchor_ms)),simAnchorTime:Number(r.sim_anchor_time),rewardedEnemyIds:r.rewarded_enemy_ids,statsCommitted:r.stats_committed,loot:{goldMilli:integerDecimal(r.loot_gold_milli),components:{steel:safeInteger(String(r.loot_steel)),ember:safeInteger(String(r.loot_ember)),core:safeInteger(String(r.loot_core))}}} as StoredRun;
 }
 async transaction<T>(accountId:string,fn:(tx:TransactionContext)=>Promise<T>|T,operationId?:string):Promise<T>{return this.atom(async c=>{
  await this.locks(c,accountId);const profile=await this.loadProfile(c,accountId),run=await this.loadRun(c,accountId);
  const operations=new Map<string,StoredOperation>((await c.query(`SELECT operation_id,request_hash,result FROM profile_operations WHERE account_id=$1${operationId?' AND operation_id=$2':''}`,operationId?[accountId,operationId]:[accountId])).rows.map(r=>[r.operation_id,{hash:r.request_hash,result:r.result}]));
  const existingOps=clone(operations),ctx:TransactionContext={profile,run,operations};const before=JSON.stringify(profile),beforeRun=JSON.stringify(run);
  const result=await fn(ctx);if(ctx.profile.accountId!==accountId)throw new StorageError();
  if(JSON.stringify(ctx.profile)!==before)await this.saveProfile(c,ctx.profile);
  if(JSON.stringify(ctx.run)!==beforeRun){if(ctx.run===null)await c.query('DELETE FROM profile_runs WHERE account_id=$1',[accountId]);else{const r=ctx.run,loot=r.loot??{goldMilli:'0',components:{steel:0,ember:0,core:0}};await c.query(`INSERT INTO profile_runs(account_id,run_id,snapshot,owner_client_id,owner_epoch,updated_at,wall_anchor_ms,sim_anchor_time,rewarded_enemy_ids,stats_committed,loot_gold_milli,loot_steel,loot_ember,loot_core) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(account_id) DO UPDATE SET run_id=EXCLUDED.run_id,snapshot=EXCLUDED.snapshot,owner_client_id=EXCLUDED.owner_client_id,owner_epoch=EXCLUDED.owner_epoch,updated_at=EXCLUDED.updated_at,wall_anchor_ms=EXCLUDED.wall_anchor_ms,sim_anchor_time=EXCLUDED.sim_anchor_time,rewarded_enemy_ids=EXCLUDED.rewarded_enemy_ids,stats_committed=EXCLUDED.stats_committed,loot_gold_milli=EXCLUDED.loot_gold_milli,loot_steel=EXCLUDED.loot_steel,loot_ember=EXCLUDED.loot_ember,loot_core=EXCLUDED.loot_core`,[accountId,r.runId,r.snapshot,r.ownerClientId,r.ownerEpoch,r.updatedAt,r.wallAnchorMs,r.simAnchorTime,r.rewardedEnemyIds,r.statsCommitted,loot.goldMilli,loot.components.steel,loot.components.ember,loot.components.core]);}}
  for(const [id,op]of ctx.operations){const old=existingOps.get(id);if(old){if(JSON.stringify(old)!==JSON.stringify(op))throw new StorageError();}else await c.query('INSERT INTO profile_operations(account_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)',[accountId,id,op.hash,op.result]);}
  if([...existingOps.keys()].some(id=>!ctx.operations.has(id)))throw new StorageError();return clone(result);
 });}
 async getProfile(accountId:string):Promise<Profile>{return this.atom(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');return this.loadProfile(c,accountId);});}
 async getRun(accountId:string):Promise<StoredRun|null>{return this.client(c=>this.loadRun(c,accountId));}
 async getOperation(accountId:string,operationId:string):Promise<StoredOperation|null>{return this.client(async c=>{const r=(await c.query('SELECT request_hash,result FROM profile_operations WHERE account_id=$1 AND operation_id=$2',[accountId,operationId])).rows[0];return r?{hash:r.request_hash,result:r.result}:null;});}
 async findAccount(login:string):Promise<Account|null>{return this.client(async c=>{
  const rows=(await c.query(`SELECT e.id FROM entities e JOIN entity_types t ON t.id=e.entity_type_id JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id WHERE t.code='account' AND e.state='active' AND p.code='login' AND v.value_text=$1`,[login])).rows;if(!rows.length)return null;if(rows.length!==1)throw new StorageError();const v=await this.values(c,rows[0]!.id);if(!PASSWORD_HASH_PATTERN.test(text(v['password-hash'])))throw new StorageError();return {id:rows[0]!.id,login:text(v.login),passwordHash:text(v['password-hash'])};
 });}
 async createSession(accountId:string,tokenHash:string,csrf:string,expiresAt:string,expectedPasswordHash?:string):Promise<void>{await this.atom(async c=>{await this.locks(c,accountId);if(expectedPasswordHash!==undefined&&(await this.values(c,accountId))['password-hash']!==expectedPasswordHash)throw new StorageError();await c.query('INSERT INTO profile_sessions(token_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)',[tokenHash,accountId,csrf,expiresAt]);});}
 async getSession(tokenHash:string):Promise<Session|null>{return this.client(async c=>{const r=(await c.query(`SELECT s.*,v.value_text AS login FROM profile_sessions s JOIN entities e ON e.id=s.account_id AND e.state='active' JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id AND p.code='login' WHERE s.token_hash=$1 AND s.expires_at>now()`,[tokenHash])).rows[0];return r?{tokenHash:r.token_hash,accountId:r.account_id,login:r.login,csrf:r.csrf_token,expiresAt:new Date(r.expires_at).toISOString()}:null;});}
 async revokeSession(tokenHash:string):Promise<void>{await this.client(async c=>{await c.query('DELETE FROM profile_sessions WHERE token_hash=$1',[tokenHash]);});}
 async provision(accounts:ProvisionAccount[]):Promise<void>{
  const entries=accounts.map(validateProvisionAccount);if(new Set(entries.map(e=>e.accountId)).size!==entries.length||new Set(entries.map(e=>e.login)).size!==entries.length)throw new Error('Duplicate provision identity.');
  await this.atom(async c=>{await c.query('SELECT id FROM entity_types WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[typeIds]);const store=new EntityStore(c as unknown as Client);
   for(const e of entries){const found=(await c.query('SELECT id,entity_type_id,state FROM entities WHERE id=$1',[e.accountId])).rows[0];
    if(found){if(found.entity_type_id!==typeIds[0]||found.state!=='active')throw new StorageError();const value=await this.values(c,e.accountId);if(value.login!==e.login)throw new Error('Provision identity conflict.');await this.loadProfile(c,e.accountId);continue;}
    await store.create('account',e.accountId as ReturnType<typeof randomUUID>);await store.set(e.accountId,'login',{type:'text',value:e.login});await store.set(e.accountId,'password-hash',{type:'text',value:e.passwordHash});await store.publish(e.accountId);await this.saveProfile(c,createEmptyProfile(e.accountId),true);
   }
  });
 }
 async rotatePassword(accountId:string,passwordHash:string):Promise<void>{if(!PASSWORD_HASH_PATTERN.test(passwordHash))throw new Error('Invalid password hash.');await this.atom(async c=>{await this.locks(c,accountId);await new EntityStore(c as unknown as Client).set(accountId,'password-hash',{type:'text',value:passwordHash});await c.query('DELETE FROM profile_sessions WHERE account_id=$1',[accountId]);});}
 async readiness():Promise<void>{await this.client(async c=>{
  const migrations=['001-constructor.sql','002-content.sql','003-profile.sql','004-economy.sql'];
  const r=(await c.query('SELECT count(*)::int AS n FROM applied_migrations WHERE id=ANY($1::text[])',[migrations])).rows[0];if(r?.n!==migrations.length)throw new StorageError();
  const types=(await c.query('SELECT count(*)::int AS n FROM entity_types WHERE id=ANY($1::uuid[]) AND archived_at IS NULL',[typeIds])).rows[0];if(types?.n!==4)throw new StorageError();
  const economyTypes=(await c.query("SELECT count(*)::int AS n FROM entity_types WHERE code IN ('component-definition','reward-definition') AND archived_at IS NULL")).rows[0];if(economyTypes?.n!==2)throw new StorageError();
  const expected=[...expectedParameters,...expectedEconomyParameters];
  const parameters=(await c.query('SELECT count(*)::int AS n FROM entity_parameters p JOIN entity_types t ON t.id=p.entity_type_id JOIN unnest($1::text[],$2::text[]) x(type_code,code) ON x.type_code=t.code AND x.code=p.code WHERE p.archived_at IS NULL',[expected.map(e=>e[0]),expected.map(e=>e[1])])).rows[0];if(parameters?.n!==expected.length)throw new StorageError();
  const definitions=(await c.query(`SELECT count(*)::int AS n FROM entities e JOIN entity_types t ON t.id=e.entity_type_id JOIN entity_parameter_values code ON code.entity_id=e.id JOIN entity_parameters cp ON cp.id=code.parameter_id AND cp.code='code' JOIN entity_parameter_values version ON version.entity_id=e.id JOIN entity_parameters vp ON vp.id=version.parameter_id AND vp.code='version' WHERE e.state='active' AND version.value_text='r34.1' AND ((t.code='component-definition' AND code.value_text IN ('steel','ember','core')) OR (t.code='reward-definition' AND code.value_text IN ('normal','strong','boss')))`)).rows[0];if(definitions?.n!==6)throw new StorageError();
  await c.query('SELECT token_hash FROM profile_sessions LIMIT 0');await c.query('SELECT account_id FROM profile_operations LIMIT 0');await c.query('SELECT account_id,loot_gold_milli,loot_steel,loot_ember,loot_core FROM profile_runs LIMIT 0');
 });}
 async close():Promise<void>{if(this.ownsPool)await this.pool.end();}
}

/** Explicit test injection only; production never falls back to process memory. */
export class MemoryRepository implements Repository {
 private readonly accounts=new Map<string,Account>();private readonly state=new Map<string,TransactionContext>();private readonly sessions=new Map<string,Session>();private readonly queues=new Map<string,Promise<void>>();
 private async lock<T>(id:string,fn:()=>Promise<T>):Promise<T>{const prior=this.queues.get(id)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const tail=prior.then(()=>gate);this.queues.set(id,tail);await prior;try{return await fn();}finally{release();if(this.queues.get(id)===tail)this.queues.delete(id);}}
 async transaction<T>(id:string,fn:(tx:TransactionContext)=>Promise<T>|T):Promise<T>{return this.lock(id,async()=>{const state=this.state.get(id);if(!state)throw new StorageError();const next=clone(state),result=await fn(next);validateProfile(next.profile);if(next.profile.accountId!==id)throw new StorageError();this.state.set(id,next);return clone(result);});}
 async getProfile(id:string):Promise<Profile>{const s=this.state.get(id);if(!s)throw new StorageError();return clone(s.profile);}
 async getRun(id:string):Promise<StoredRun|null>{return clone(this.state.get(id)?.run??null);}
 async getOperation(id:string,op:string):Promise<StoredOperation|null>{return clone(this.state.get(id)?.operations.get(op)??null);}
 async findAccount(login:string):Promise<Account|null>{return clone([...this.accounts.values()].find(a=>a.login===login)??null);}
 async createSession(id:string,hash:string,csrf:string,expiresAt:string,expectedPasswordHash?:string):Promise<void>{const a=this.accounts.get(id);if(!a||expectedPasswordHash!==undefined&&a.passwordHash!==expectedPasswordHash)throw new StorageError();if(this.sessions.has(hash))throw new StorageError();this.sessions.set(hash,{tokenHash:hash,accountId:id,login:a.login,csrf,expiresAt});}
 async getSession(hash:string):Promise<Session|null>{const s=this.sessions.get(hash);return s&&Date.parse(s.expiresAt)>Date.now()?clone(s):null;}
 async revokeSession(hash:string):Promise<void>{this.sessions.delete(hash);}
 async provision(accounts:ProvisionAccount[]):Promise<void>{const entries=accounts.map(validateProvisionAccount);if(new Set(entries.map(e=>e.accountId)).size!==entries.length||new Set(entries.map(e=>e.login)).size!==entries.length)throw new Error('Duplicate provision identity.');const nextAccounts=clone(this.accounts),nextState=clone(this.state);for(const e of entries){const previous=nextAccounts.get(e.accountId);if(previous){if(previous.login!==e.login)throw new Error('Provision identity conflict.');continue;}if([...nextAccounts.values()].some(a=>a.login===e.login))throw new Error('Provision login conflict.');nextAccounts.set(e.accountId,{id:e.accountId,login:e.login,passwordHash:e.passwordHash});nextState.set(e.accountId,{profile:createEmptyProfile(e.accountId),run:null,operations:new Map()});}for(const [id,a]of nextAccounts)this.accounts.set(id,a);for(const [id,s]of nextState)this.state.set(id,s);}
 async rotatePassword(id:string,passwordHash:string):Promise<void>{if(!PASSWORD_HASH_PATTERN.test(passwordHash))throw new Error('Invalid password hash.');const a=this.accounts.get(id);if(!a)throw new StorageError();a.passwordHash=passwordHash;for(const [h,s]of this.sessions)if(s.accountId===id)this.sessions.delete(h);}
 async close():Promise<void>{}
 async readiness():Promise<void>{}
}
