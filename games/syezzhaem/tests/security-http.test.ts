import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.ts';
import {createAuthRuntime,type AuthMail} from '../server/auth.ts';
import {createDatabase,type Database} from '../server/database.ts';
import {R1Store} from '../server/r1-store.ts';
import {seedR1Metadata} from '../server/r1-metadata.ts';
import {CURRENT_BUILD_CONTEXT as BUILD_CONTEXT} from '../src/snapshot-v1.ts';
// @ts-expect-error The isolated PostgreSQL harness is plain JS.
import {startPostgresFixture} from './data-pg-helper.mjs';

let fixture:any,db:Database,auth:Awaited<ReturnType<typeof createAuthRuntime>>,app:Awaited<ReturnType<typeof createApp>>;
const origin='https://security-game.example.test',mails:AuthMail[]=[],password='Synthetic-security-password-123!';
const accounts:Array<{id:string;cookie:string;rawCookie:string}>=[];
function post(path:string,body:unknown,cookie?:string,extra:Record<string,string>={}){
  const known=accounts.find(x=>x.cookie===cookie);
  return app.inject({method:'POST',url:path,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(known&&path.includes('/v1/rpc/')?{'x-syezzhaem-expected-user':known.id}:{}),...extra},payload:JSON.stringify(body)});
}
const rpcPath=(op:string)=>`/api/syezzhaem/v1/rpc/${op}`;
before(async()=>{
  fixture=await startPostgresFixture({auth:true});
  await fixture.admin.query('BEGIN');
  try{await seedR1Metadata({exec:async sql=>{await fixture.admin.query(sql);},query:(sql,params)=>fixture.admin.query(sql,params)});await fixture.admin.query('COMMIT');}
  catch(error){await fixture.admin.query('ROLLBACK');throw error;}
  auth=await createAuthRuntime({origin,secret:'synthetic-security-test-secret-with-32-characters',databaseUrl:fixture.authUrl,mode:'production',mailer:{verify:async()=>{},send:async mail=>{mails.push(mail);}}});
  db=await createDatabase({databaseUrl:fixture.runtimeUrl});app=await createApp({auth,store:new R1Store(db)});
  for(const suffix of ['a','b']){
    const email=`security-${suffix}@example.test`;
    assert.equal((await post('/api/syezzhaem/auth/sign-up/email',{email,password,name:`Synthetic ${suffix}`,callbackURL:`${origin}/games/syezzhaem/`})).statusCode,200);
    await auth.flushMail();
    const tokenMail=[...mails].reverse().find(x=>x.to===email)!;
    const url=new URL(tokenMail.text.match(/https?:\/\/\S+/)![0]);
    assert.ok([200,302].includes((await app.inject({method:'GET',url:url.pathname+url.search})).statusCode));
    const response=await post('/api/syezzhaem/auth/sign-in/email',{email,password});assert.equal(response.statusCode,200);
    const cookies=response.headers['set-cookie'];
    const rawCookie=(Array.isArray(cookies)?cookies:[cookies]).find(x=>x?.includes('syezzhaem.session_token='))!;
    accounts.push({id:response.json().user.id,cookie:rawCookie.split(';')[0],rawCookie});
  }
});
after(async()=>{await app?.close();await auth?.close();await db?.close();await fixture?.close();});

test('SEC-04 HTTPS configuration issues private host-only Secure session cookie with game path',()=>{
  for(const account of accounts){assert.match(account.rawCookie,/^__Secure-syezzhaem\.session_token=/);assert.match(account.rawCookie,/; Secure/i);assert.match(account.rawCookie,/; HttpOnly/i);assert.match(account.rawCookie,/; SameSite=Lax/i);assert.match(account.rawCookie,/; Path=\/api\/syezzhaem(?:;|$)/i);assert.doesNotMatch(account.rawCookie,/; Domain=/i);}
});

test('SEC-04 auth and game mutations reject foreign and null browser origins before effect',async()=>{
  const usersBefore=Number((await fixture.admin.query('SELECT count(*) AS count FROM syezzhaem_auth."user"')).rows[0].count);
  for(const bad of ['https://attacker.example.test','null']){
    const headers={origin:bad,'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'};
    assert.equal((await post('/api/syezzhaem/auth/sign-up/email',{email:`bad-${bad==='null'?'null':'foreign'}@example.test`,password,name:'Synthetic blocked'},undefined,headers)).statusCode,403);
    assert.equal((await post(rpcPath('bootstrap_v1'),{client_build:BUILD_CONTEXT.client_build_id},accounts[0].cookie,headers)).statusCode,403);
  }
  const missing=await app.inject({method:'POST',url:rpcPath('bootstrap_v1'),headers:{'content-type':'application/json',cookie:accounts[0].cookie},payload:{client_build:BUILD_CONTEXT.client_build_id}});assert.equal(missing.statusCode,403);
  assert.equal(Number((await fixture.admin.query('SELECT count(*) AS count FROM syezzhaem_auth."user"')).rows[0].count),usersBefore);
});

test('SEC-04 untrusted callback and password-reset redirect cannot receive auth links',async()=>{
  const count=mails.length;
  const signup=await post('/api/syezzhaem/auth/sign-up/email',{email:'external-callback@example.test',password,name:'Synthetic blocked',callbackURL:'https://attacker.example.test/callback'});
  assert.ok(signup.statusCode>=400);
  const reset=await post('/api/syezzhaem/auth/request-password-reset',{email:'security-a@example.test',redirectTo:'https://attacker.example.test/reset'});assert.ok(reset.statusCode>=400);
  await auth.flushMail();assert.equal(mails.length,count);
});

test('SEC-04 altered signed session cannot access authenticated game RPC',async()=>{
  const original=accounts[0].cookie;
  const malformed=original.slice(0,-1)+(original.endsWith('A')?'B':'A');
  assert.equal((await post(rpcPath('bootstrap_v1'),{client_build:BUILD_CONTEXT.client_build_id},malformed)).statusCode,401);
});

test('SEC-04 game request body cannot choose another authenticated owner',async()=>{
  const response=await post(rpcPath('bootstrap_v1'),{client_build:BUILD_CONTEXT.client_build_id,owner_user_id:accounts[1].id},accounts[0].cookie);
  assert.equal(response.json().error.code,'VALIDATION_FAILED');assert.equal(response.json().error.path,'owner_user_id');
});

test('SEC-05 expected-owner binding rejects cookie-account race before run creation',async()=>{
  const countBefore=Number((await fixture.admin.query("SELECT count(*) AS count FROM syezzhaem.entities WHERE entity_type_id='game_run'")).rows[0].count);
  const body={client_build_id:BUILD_CONTEXT.client_build_id,content_version:BUILD_CONTEXT.content_version,level_id:BUILD_CONTEXT.level_id,request_id:randomUUID()};
  // The queued command belongs to A; a different tab has replaced the shared cookie with B.
  const response=await post(rpcPath('run_start_v1'),body,accounts[1].cookie,{'x-syezzhaem-expected-user':accounts[0].id});
  assert.ok([401,403].includes(response.statusCode),'mismatched expected owner must be an authentication boundary failure');
  assert.equal(Number((await fixture.admin.query("SELECT count(*) AS count FROM syezzhaem.entities WHERE entity_type_id='game_run'")).rows[0].count),countBefore);
  const legitimate=await post(rpcPath('run_start_v1'),body,accounts[0].cookie,{'x-syezzhaem-expected-user':accounts[0].id});
  assert.equal(legitimate.json().ok,true,'the original account must still be able to commit the unchanged request');
});
