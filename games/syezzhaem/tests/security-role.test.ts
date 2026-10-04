import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {createDatabase} from '../server/database.ts';
import {createAuthRuntime} from '../server/auth.ts';

/** Disposable SQL fixture. Never connects to an external database. */
async function fixture(schema:'syezzhaem'|'syezzhaem_auth',inherited:boolean){
  const db=new PGlite();await db.waitReady;
  await db.exec(`CREATE ROLE sec_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE sec_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS INHERIT;
    ${inherited?'GRANT sec_owner TO sec_runtime;':''}
    CREATE SCHEMA ${schema} AUTHORIZATION sec_owner;
    SET ROLE sec_owner;
    CREATE TABLE ${schema}.sec_probe(owner_user_id text);
    INSERT INTO ${schema}.sec_probe VALUES('synthetic-other-user');
    ALTER TABLE ${schema}.sec_probe ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sec_deny ON ${schema}.sec_probe USING(false);
    GRANT USAGE ON SCHEMA ${schema} TO sec_runtime;
    GRANT SELECT ON ${schema}.sec_probe TO sec_runtime;
    RESET ROLE;SET ROLE sec_runtime;`);
  return db;
}

test('SEC-01 game runtime rejects inherited table-owner privileges',async()=>{
  const db=await fixture('syezzhaem',true);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int FROM syezzhaem.sec_probe')).rows[0]?.count,1,'fixture must expose effective-owner RLS bypass');
  const original=pg.Pool;
  const pool={query:(sql:string,params:unknown[]=[])=>db.query(sql,params),end:async()=>{}};
  (pg as unknown as {Pool:unknown}).Pool=class {constructor(){return pool;}};
  try{await assert.rejects(createDatabase({databaseUrl:'postgresql://synthetic-fixture/unused'}),/runtime.*(owner|privileg|migrat)/i);}
  finally{pg.Pool=original;await db.close();}
});

test('SEC-01 auth runtime rejects inherited table-owner privileges before mail/library startup',async()=>{
  const db=await fixture('syezzhaem_auth',true);
  let mailChecks=0;
  const pool={query:(sql:string,params:unknown[]=[])=>db.query(sql,params)} as unknown as pg.Pool;
  try{
    await assert.rejects(createAuthRuntime({origin:'http://localhost',secret:'synthetic-test-secret-with-32-characters',mode:'test',pool,
      mailer:{send:async()=>{},verify:async()=>{mailChecks++;}}}),/runtime.*(owner|privileg|migrat)/i);
    assert.equal(mailChecks,0,'unsafe role must be rejected before other startup work');
  }finally{await db.close();}
});

test('SEC-01 game runtime accepts least-privilege role and RLS denies unrelated rows',async()=>{
  const db=await fixture('syezzhaem',false);
  const original=pg.Pool;
  const pool={query:(sql:string,params:unknown[]=[])=>db.query(sql,params),end:async()=>{}};
  (pg as unknown as {Pool:unknown}).Pool=class {constructor(){return pool;}};
  try{
    const runtime=await createDatabase({databaseUrl:'postgresql://synthetic-fixture/unused'});
    assert.equal((await runtime.query<{count:number}>('SELECT count(*)::int FROM syezzhaem.sec_probe')).rows[0]?.count,0);
    await runtime.close();
  }finally{pg.Pool=original;await db.close();}
});

test('SEC-01 game runtime rejects membership allowing SET ROLE into unrelated BYPASSRLS role',async()=>{
  const db=await fixture('syezzhaem',false);
  await db.exec(`RESET ROLE;CREATE ROLE sec_elevated NOLOGIN NOSUPERUSER BYPASSRLS;
    GRANT USAGE ON SCHEMA syezzhaem TO sec_elevated;
    GRANT SELECT ON syezzhaem.sec_probe TO sec_elevated;
    GRANT sec_elevated TO sec_runtime;SET ROLE sec_runtime;SET ROLE sec_elevated;`);
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int FROM syezzhaem.sec_probe')).rows[0]?.count,1,'fixture must prove SET ROLE can bypass the deny-all policy');
  await db.exec('RESET ROLE;SET ROLE sec_runtime;');
  const original=pg.Pool;
  const pool={query:(sql:string,params:unknown[]=[])=>db.query(sql,params),end:async()=>{}};
  (pg as unknown as {Pool:unknown}).Pool=class {constructor(){return pool;}};
  try{await assert.rejects(createDatabase({databaseUrl:'postgresql://synthetic-fixture/unused'}),/runtime.*(owner|privileg|migrat|bypass)/i);}
  finally{pg.Pool=original;await db.close();}
});
