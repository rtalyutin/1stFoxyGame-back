import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRuntime, type AuthMail } from '../server/auth.ts';
import { createApp } from '../server/app.ts';
import { createDatabase } from '../server/database.ts';
import { R1Store } from '../server/r1-store.ts';
import { seedR1Metadata } from '../server/r1-metadata.ts';
// @ts-expect-error The disposable native PostgreSQL harness is intentionally plain JS.
import { startPostgresFixture } from './data-pg-helper.mjs';

test('Better Auth real PostgreSQL: verification, reset, persistent session and owner API',async t=> {
  const pg=await startPostgresFixture({auth:true});
  try {
    await pg.admin.query('BEGIN');
    await seedR1Metadata({exec:async sql=>{await pg.admin.query(sql)},query:async<T>(sql:string,params:unknown[]=[])=>({rows:(await pg.admin.query(sql,params)).rows as T[]})});
    await pg.admin.query('COMMIT');
  } catch(error) {await pg.admin.query('ROLLBACK');await pg.close();throw error;}
  const mails:AuthMail[]=[];
  const origin='http://127.0.0.1:8091';
  const authOptions={origin,secret:'synthetic-isolated-test-secret-longer-than-32',databaseUrl:pg.authUrl,mode:'test' as const,
    mailer:{verify:async()=>{},send:async(mail:AuthMail)=>{mails.push(mail)}}};
  const auth=await createAuthRuntime(authOptions);
  const db=await createDatabase({databaseUrl:pg.runtimeUrl});
  const store=new R1Store(db);
  const drainToken='synthetic-operator-drain-secret-longer-than-32';
  const app=await createApp({auth,store,drainToken});
  const post=(path:string,body:unknown,cookie?:string)=>app.inject({method:'POST',url:path,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},payload:JSON.stringify(body)});
  const authPost=(path:string,body:unknown,cookie?:string)=>post(`/api/syezzhaem/auth/${path}`,body,cookie);
  const rpc=(op:string,body:unknown,cookie?:string,expectedOwner=owner)=>app.inject({method:'POST',url:`/api/syezzhaem/v1/rpc/${op}`,headers:{origin,'content-type':'application/json','x-syezzhaem-expected-user':expectedOwner,...(cookie?{cookie}:{})},payload:JSON.stringify(body)});
  const link=(email:string)=>{const mail=[...mails].reverse().find(x=>x.to===email);assert.ok(mail);const match=mail.text.match(/https?:\/\/\S+/);assert.ok(match);return new URL(match[0]);};
  const password='Synthetic-password-123!';
  let cookie='',owner='',runId='';
  try {
    await t.test('unverified signup cannot create an authenticated game profile',async()=> {
      const signup=await authPost('sign-up/email',{email:'one@example.test',password,name:'One',callbackURL:`${origin}/games/syezzhaem/`});
      assert.equal(signup.statusCode,200);await auth.flushMail();assert.equal(mails.length,1);
      const signin=await authPost('sign-in/email',{email:'one@example.test',password});
      assert.equal(signin.statusCode,403);
      const result=await rpc('bootstrap_v1',{client_build:'r1-local-001'});
      assert.equal(result.statusCode,401);
      assert.equal(Number((await pg.admin.query("SELECT count(*) AS n FROM syezzhaem.entities WHERE entity_type_id='player_profile'")).rows[0].n),0);
    });
    await t.test('confirmation uses library token and cookie is HttpOnly with game prefix/path',async()=> {
      await auth.flushMail();const url=link('one@example.test');
      const verify=await app.inject({method:'GET',url:url.pathname+url.search});assert.ok([200,302].includes(verify.statusCode));
      const response=await authPost('sign-in/email',{email:'one@example.test',password});assert.equal(response.statusCode,200);
      const cookies=response.headers['set-cookie'];const value=Array.isArray(cookies)?cookies[0]:cookies;
      assert.ok(value);assert.ok(value.includes('syezzhaem.session_token='));assert.match(value,/HttpOnly/i);assert.match(value,/Path=\/api\/syezzhaem/i);assert.match(value,/SameSite=Lax/i);
      cookie=value.split(';')[0];owner=response.json().user.id;assert.ok(owner);
    });
    await t.test('legitimate repeated account checks exceed the old global 100/min budget',async()=> {
      for(let i=0;i<120;i++) {
        const session=await app.inject({method:'GET',url:'/api/syezzhaem/auth/get-session',headers:{cookie}});
        assert.equal(session.statusCode,200);assert.equal(session.json().user.id,owner);
      }
    });
    await t.test('bootstrap is idempotent; server chooses owner; successful start retries same run',async()=> {
      const first=(await rpc('bootstrap_v1',{client_build:'r1-local-001'},cookie)).json();assert.equal(first.ok,true);
      const second=(await rpc('bootstrap_v1',{client_build:'r1-local-001'},cookie)).json();assert.deepEqual(first.data.profile,second.data.profile);
      const forged=(await rpc('bootstrap_v1',{client_build:'r1-local-001',owner_user_id:'other'},cookie)).json();assert.equal(forged.error.code,'VALIDATION_FAILED');assert.equal(forged.error.path,'owner_user_id');
      const body={client_build_id:'r1-local-001',level_id:'house-bridge-portal',content_version:'r1-map-1',request_id:crypto.randomUUID()};
      const start=(await rpc('run_start_v1',body,cookie)).json();assert.equal(start.ok,true);runId=start.data.run_id;
      const retry=(await rpc('run_start_v1',body,cookie)).json();assert.deepEqual(retry.data,start.data);
      assert.equal(Number((await pg.admin.query('SELECT count(*) AS n FROM syezzhaem.profile_identity_index WHERE user_id=$1',[owner])).rows[0].n),1);
    });
    await t.test('another API process configuration accepts the persistent signed session',async()=> {
      const nextAuth=await createAuthRuntime(authOptions);const nextApp=await createApp({auth:nextAuth,store,apiBuildId:'r1-api-next-test'});
      try {
        const response=await nextApp.inject({method:'GET',url:'/api/syezzhaem/auth/get-session',headers:{cookie}});assert.equal(response.json().user.id,owner);
        const get=await nextApp.inject({method:'POST',url:'/api/syezzhaem/v1/rpc/run_get_v1',headers:{origin,'content-type':'application/json',cookie,'x-syezzhaem-expected-user':owner},payload:{run_id:runId}});
        assert.equal(get.json().data.run_id,runId);
      } finally {await nextApp.close();await nextAuth.close();}
    });
    await t.test('second account cannot read or abandon a foreign run',async()=> {
      await authPost('sign-up/email',{email:'two@example.test',password,name:'Two'});await auth.flushMail();const url=link('two@example.test');
      await app.inject({method:'GET',url:url.pathname+url.search});
      const signin=await authPost('sign-in/email',{email:'two@example.test',password});assert.equal(signin.statusCode,200);
      const cookies=signin.headers['set-cookie'];const c=(Array.isArray(cookies)?cookies[0]:cookies)!.split(';')[0];
      const secondOwner=signin.json().user.id;
      assert.equal((await rpc('run_get_v1',{run_id:runId},c,secondOwner)).json().error.code,'NOT_FOUND');
      assert.equal((await rpc('run_abandon_v1',{run_id:runId,expected_revision:0,request_id:crypto.randomUUID()},c,secondOwner)).json().error.code,'NOT_FOUND');
      const switched=await rpc('run_start_v1',{client_build_id:'r1-local-001',level_id:'house-bridge-portal',content_version:'r1-map-1',request_id:crypto.randomUUID()},c,owner);
      assert.equal(switched.statusCode,401);assert.equal(switched.json().code,'AUTH_CONTEXT_CHANGED');
      assert.equal(Number((await pg.admin.query('SELECT count(*) AS n FROM syezzhaem.active_run_index WHERE user_id=$1',[secondOwner])).rows[0].n),0);
    });
    await t.test('password recovery consumes library token and revokes earlier sessions',async()=> {
      const reset=await authPost('request-password-reset',{email:'one@example.test',redirectTo:`${origin}/games/syezzhaem/`});assert.equal(reset.statusCode,200);await auth.flushMail();
      const url=link('one@example.test');const redirect=await app.inject({method:'GET',url:url.pathname+url.search});assert.equal(redirect.statusCode,302);
      const target=new URL(redirect.headers.location!);const token=target.searchParams.get('token');assert.ok(token);
      const changed=await authPost('reset-password',{token,newPassword:'New-synthetic-password-456!'});assert.equal(changed.statusCode,200);
      assert.equal((await rpc('bootstrap_v1',{client_build:'r1-local-001'},cookie)).statusCode,401);
      const old=await authPost('sign-in/email',{email:'one@example.test',password});assert.equal(old.statusCode,401);
      const fresh=await authPost('sign-in/email',{email:'one@example.test',password:'New-synthetic-password-456!'});assert.equal(fresh.statusCode,200);
      const cookies=fresh.headers['set-cookie'];cookie=(Array.isArray(cookies)?cookies[0]:cookies)!.split(';')[0];
      const again=await authPost('reset-password',{token,newPassword:'Other-synthetic-password-789!'});assert.ok(again.statusCode>=400);
    });
    await t.test('readiness checks actual Auth/DB; authenticated loopback drain preserves accepted work',async()=> {
      const ready=await app.inject({method:'GET',url:'/api/syezzhaem/v1/ready'});assert.equal(ready.statusCode,200);assert.deepEqual(ready.json().checks,{auth:true,db:true,releases:true});
      const address=await app.listen({port:0,host:'127.0.0.1'});
      assert.equal((await fetch(`${address}/internal/syezzhaem/drain-status`)).status,404);
      let started!:()=>void,unblock!:()=>void;
      const entered=new Promise<void>(resolve=>{started=resolve}),gate=new Promise<void>(resolve=>{unblock=resolve});
      const original=store.get.bind(store);store.get=async(...args)=>{started();await gate;return original(...args)};
      const accepted=fetch(`${address}/api/syezzhaem/v1/rpc/run_get_v1`,{method:'POST',headers:{origin,'content-type':'application/json',cookie,'x-syezzhaem-expected-user':owner},body:JSON.stringify({run_id:runId})});
      await entered;
      try {
        const draining=await fetch(`${address}/internal/syezzhaem/drain`,{method:'POST',headers:{'x-syezzhaem-operator-token':drainToken}});assert.equal(draining.status,200);
        const status=await draining.json() as {draining:boolean;in_flight:number};assert.equal(status.draining,true);assert.equal(status.in_flight,1);
      } finally {unblock();store.get=original;}
      assert.equal((await (await accepted).json() as {ok:boolean}).ok,true);
      const status=await (await fetch(`${address}/internal/syezzhaem/drain-status`,{headers:{'x-syezzhaem-operator-token':drainToken}})).json() as {in_flight:number};assert.equal(status.in_flight,0);
      assert.equal((await rpc('run_get_v1',{run_id:runId},cookie)).statusCode,503);
      const version=await app.inject({method:'GET',url:'/api/syezzhaem/v1/version'});assert.equal(version.json().process_id,process.pid);
    });
  } finally {await app.close();await auth.close();await db.close();await pg.close();}
});
