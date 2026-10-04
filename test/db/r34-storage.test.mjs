import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Client,Pool} from 'pg';
import {migrate} from '../../dist/db/migrate.js';
import {EntityStore} from '../../dist/db/entity-store.js';
import {PgRepository} from '../../dist/profile/repository.js';
import {hashPassword,verifyPassword,hashToken,newSessionToken,newCsrfToken} from '../../dist/profile/auth.js';

const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL is required; real PostgreSQL storage tests are never skipped.');
const ident=s=>`"${s.replaceAll('"','""')}"`;
async function atomic(c,fn){await c.query('BEGIN');try{await fn();await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}}
const hash='a'.repeat(64);

test('R3/R4 typed profile, idempotent provisioning, transactional journals and runtime grants',async t=>{
 const admin=new Client({connectionString:url});await admin.connect();
 const schema=`foxy_r34_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA ${ident(schema)}`);await admin.query(`SET search_path TO ${ident(schema)},public`);
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema},public`}),repo=new PgRepository(pool);
 const runtimeRole=`foxy_runtime_${randomUUID().replaceAll('-','')}`;
 t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${ident(schema)} CASCADE`);await admin.query(`DROP ROLE IF EXISTS ${ident(runtimeRole)}`);await admin.end();});
 await migrate(admin);await repo.readiness();
 const accountId=randomUUID(),otherId=randomUUID(),login=`a_${accountId.replaceAll('-','')}`,otherLogin=`b_${otherId.replaceAll('-','')}`;
 const password='a-valid-password-123',passwordHash=await hashPassword(password);
 await repo.provision([{accountId,login,passwordHash},{accountId:otherId,login:otherLogin,passwordHash}]);

 await t.test('typed zero profile survives re-provision, new repository and password input changes',async()=>{
  const empty=await repo.getProfile(accountId);assert.equal(empty.goldMilli,'0');assert.deepEqual(empty.items,[]);assert.equal(empty.revision,0);
  await repo.transaction(accountId,tx=>{tx.profile.goldMilli='9007199254740993000';tx.profile.components.steel=20;tx.profile.revision=2;});
  const changed=await hashPassword('another-valid-password');await repo.provision([{accountId,login,passwordHash:changed}]);
  assert.equal((await repo.getProfile(accountId)).goldMilli,'9007199254740993000');assert.equal((await repo.findAccount(login)).passwordHash,passwordHash);
  const restarted=new PgRepository(pool);assert.equal((await restarted.getProfile(accountId)).revision,2);await restarted.close();
  assert.equal(await verifyPassword(password,(await restarted.findAccount(login)).passwordHash),true);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entities e ON e.id=v.entity_id JOIN entity_types t ON t.id=e.entity_type_id WHERE t.code='profile' AND p.code='gold-milli' AND v.value_decimal=9007199254740993000`)).rows[0].n,1);
 });
 await t.test('duplicate login and identity changes roll back provisioning atomically',async()=>{
  await assert.rejects(repo.provision([{accountId:randomUUID(),login,passwordHash}]));
  await assert.rejects(repo.provision([{accountId,login:otherLogin,passwordHash}]));
  assert.equal((await repo.findAccount(login)).id,accountId);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM entities e JOIN entity_types t ON t.id=e.entity_type_id WHERE t.code='account' AND e.state='active'")).rows[0].n,2);
 });
 await t.test('account-scoped concurrency commits two spends without a lost update',async()=>{
  await repo.transaction(accountId,tx=>{tx.profile.goldMilli='10000';});
  let release,entered;const gate=new Promise(r=>{release=r;});const ready=new Promise(r=>{entered=r;});
  const first=repo.transaction(accountId,async tx=>{entered();await gate;tx.profile.goldMilli=String(BigInt(tx.profile.goldMilli)-2000n);tx.profile.revision++;});await ready;
  const second=repo.transaction(accountId,tx=>{tx.profile.goldMilli=String(BigInt(tx.profile.goldMilli)-3000n);tx.profile.revision++;});release();await Promise.all([first,second]);
  assert.equal((await repo.getProfile(accountId)).goldMilli,'5000');
 });
 await t.test('wallet, owned items, loadout, run and receipt share one durable transaction',async()=>{
  const itemId=randomUUID(),operationId=randomUUID(),runId=randomUUID(),ownerClientId=randomUUID();
  const result=await repo.transaction(accountId,tx=>{
   tx.profile.goldMilli='4000';tx.profile.items.push({id:itemId,definitionId:'fast_reel',level:1});tx.profile.loadouts.pudge.weapon=itemId;tx.profile.consumables.slow_dust=3;tx.profile.loadouts.pudge.quick=['slow_dust',null];tx.profile.revision++;
   tx.run={runId,snapshot:{fixture:'storage-snapshot'},ownerClientId,ownerEpoch:1,updatedAt:new Date().toISOString(),wallAnchorMs:Date.now(),simAnchorTime:0,rewardedEnemyIds:['enemy-1'],statsCommitted:false,loot:{goldMilli:'5000',components:{steel:2,ember:1,core:0}}};
   const receipt={operationId,status:'committed',profile:structuredClone(tx.profile),run:null,replayed:false};tx.operations.set(operationId,{hash,result:receipt});return receipt;
  });
  assert.equal((await repo.getProfile(accountId)).loadouts.pudge.weapon,itemId);assert.equal((await repo.getRun(accountId)).runId,runId);assert.deepEqual((await repo.getOperation(accountId,operationId)).result,result);
  assert.deepEqual((await new PgRepository(pool).getRun(accountId)).loot,{goldMilli:'5000',components:{steel:2,ember:1,core:0}});
  assert.equal(await repo.getOperation(otherId,operationId),null);assert.equal(await repo.getRun(otherId),null);
  const before=await repo.getProfile(accountId),priorRun=await repo.getRun(accountId),failedId=randomUUID();
  await assert.rejects(repo.transaction(accountId,tx=>{tx.profile.goldMilli='0';tx.profile.consumables.slow_dust--;tx.run=null;tx.operations.set(failedId,{hash,result});throw new Error('intentional rollback');}),/intentional rollback/);
  assert.deepEqual(await repo.getProfile(accountId),before);assert.deepEqual(await repo.getRun(accountId),priorRun);assert.equal(await repo.getOperation(accountId,failedId),null);
  await repo.transaction(accountId,tx=>{assert.deepEqual([...tx.operations.keys()],[operationId]);},operationId);
  await assert.rejects(repo.transaction(accountId,tx=>{tx.operations.get(operationId).result.profile.goldMilli='0';},operationId));
  assert.deepEqual((await repo.getOperation(accountId,operationId)).result,result);
 });
 await t.test('database rejects fractional/negative currency, missing required values and cross-owner equipment',async()=>{
  const profileId=(await admin.query("SELECT v.entity_id FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entity_types t ON t.id=v.entity_type_id WHERE t.code='profile' AND p.code='owner' AND v.value_reference=$1",[accountId])).rows[0].entity_id;
  await atomic(admin,()=>new EntityStore(admin).set(profileId,'gold-milli',{type:'decimal',value:'4000.000'}));assert.equal((await repo.getProfile(accountId)).goldMilli,'4000');
  for(const value of ['-1','0.5'])await assert.rejects(atomic(admin,()=>new EntityStore(admin).set(profileId,'gold-milli',{type:'decimal',value})),e=>e.code==='23514');
  await assert.rejects(atomic(admin,()=>admin.query("DELETE FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=(SELECT p.id FROM entity_parameters p JOIN entity_types t ON t.id=p.entity_type_id WHERE t.code='profile' AND p.code='gold-milli')",[profileId])),e=>e.code==='23514');
  const itemId=(await repo.getProfile(accountId)).items[0].id;
  for(const invalid of ['-1','0.5','9223372036854775808'])await assert.rejects(atomic(admin,()=>admin.query('UPDATE profile_runs SET loot_gold_milli=$2 WHERE account_id=$1',[accountId,invalid])),e=>e.code==='23514');
  await assert.rejects(atomic(admin,()=>admin.query('UPDATE profile_runs SET loot_steel=-1 WHERE account_id=$1',[accountId])),e=>e.code==='23514');
  await assert.rejects(atomic(admin,()=>new EntityStore(admin).set(itemId,'owner',{type:'reference',value:otherId})),e=>e.code==='23514');
  await assert.rejects(atomic(admin,()=>admin.query('INSERT INTO profile_sessions(token_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval \'1 day\')',[hashToken('typed-account-fk'),profileId,newCsrfToken()])),e=>e.code==='23503');
  assert.equal((await repo.getProfile(accountId)).items[0].id,itemId);
 });
 await t.test('expiring/revocable sessions and explicit password rotation preserve property',async()=>{
  const token=hashToken(newSessionToken()),csrf=newCsrfToken();await repo.createSession(accountId,token,csrf,new Date(Date.now()+86400000).toISOString());
  assert.equal((await repo.getSession(token)).csrf,csrf);assert.equal((await repo.getSession(token)).login,login);
  const expired=hashToken(newSessionToken());await repo.createSession(accountId,expired,newCsrfToken(),new Date(Date.now()-1000).toISOString());assert.equal(await repo.getSession(expired),null);
  const before=await repo.getProfile(accountId);const rotated=await hashPassword('rotated-valid-password');await repo.rotatePassword(accountId,rotated);assert.equal(await repo.getSession(token),null);assert.deepEqual(await repo.getProfile(accountId),before);
  const staleToken=hashToken(newSessionToken());await assert.rejects(repo.createSession(accountId,staleToken,newCsrfToken(),new Date(Date.now()+86400000).toISOString(),passwordHash));assert.equal(await repo.getSession(staleToken),null);
  await repo.provision([{accountId,login,passwordHash}]);assert.equal((await repo.findAccount(login)).passwordHash,rotated);
 });
 await t.test('least-privilege runtime can play and save; cannot provision or mutate metadata/credentials',async()=>{
  await admin.query(`CREATE ROLE ${ident(runtimeRole)} NOLOGIN`);
  const sql=readFileSync(new URL('../../src/profile/runtime-grants.sql',import.meta.url),'utf8').replaceAll('foxy_runtime',runtimeRole).replace('GRANT USAGE ON SCHEMA public',`GRANT USAGE ON SCHEMA ${ident(schema)}`);
  await admin.query(sql);
  const runtime=new Pool({connectionString:url,options:`-c search_path=${schema},public`});runtime.on('connect',client=>{void client.query(`SET ROLE ${ident(runtimeRole)}`);});const limited=new PgRepository(runtime);
  try{
   await limited.readiness();assert.equal((await limited.findAccount(login)).id,accountId);
   await limited.transaction(accountId,tx=>{tx.profile.components.ember++;tx.profile.revision++;});
   const token=hashToken(newSessionToken());await limited.createSession(accountId,token,newCsrfToken(),new Date(Date.now()+86400000).toISOString());assert.equal((await limited.getSession(token)).accountId,accountId);await limited.revokeSession(token);
   await assert.rejects(limited.rotatePassword(accountId,passwordHash));
   await assert.rejects(limited.provision([{accountId:randomUUID(),login:'unauthorized-account',passwordHash}]));
   const c=await runtime.connect();try{await assert.rejects(c.query("UPDATE entity_types SET code='altered' WHERE code='profile'"),e=>e.code==='42501');await assert.rejects(c.query('UPDATE entity_types SET id=$1 WHERE code=\'profile\'',[randomUUID()]),e=>e.code==='23514');}finally{c.release();}
  }finally{await runtime.end();}
 });
});
