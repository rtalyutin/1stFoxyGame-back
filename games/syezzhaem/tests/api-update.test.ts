import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { seedR1Metadata } from '../server/r1-metadata.ts';
import { fromSnapshotV1, toSnapshotV1 } from '../src/snapshot-v1.ts';
import { step } from '../src/core.ts';
import type { Envelope, RunDto } from '../src/r1-contracts.ts';
// @ts-expect-error Executable disposable native PostgreSQL fixture.
import { startPostgresFixture } from './data-pg-helper.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function bind(server:Server):Promise<number> {
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const address=server.address();assert.ok(address&&typeof address!=='string');return address.port;
}
async function freePort(){const server=createServer();const port=await bind(server);await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode)return;const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await exited;}

test('AT-36 live API process cutover resolves lost checkpoint/finish ACK using shared PostgreSQL',async()=> {
  const fixture=await startPostgresFixture({auth:true});
  const directory=await mkdtemp(join(tmpdir(),'syezzhaem-api-update-'));
  const children:ChildProcess[]=[];
  let upstream=0,armed:string|null=null;
  const captured=new Map<string,{status:number;ack:unknown;body_hash:string;upstream:number}>();
  const attempts:{operation:string;body_hash:string;upstream:number}[]=[];
  const bridge=createServer(async(clientRequest,clientResponse)=> {
    try {
      const chunks:Buffer[]=[];for await(const chunk of clientRequest)chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks),path=clientRequest.url??'/',port=upstream;
      const operation=path.startsWith('/api/syezzhaem/v1/rpc/')?path.slice('/api/syezzhaem/v1/rpc/'.length):'';
      if(operation)attempts.push({operation,body_hash:hash(body),upstream:port});
      const request=httpRequest({host:'127.0.0.1',port,path,method:clientRequest.method,headers:{...clientRequest.headers,host:`127.0.0.1:${port}`,connection:'close'}},response=> {
        const output:Buffer[]=[];response.on('data',chunk=>output.push(Buffer.from(chunk)));
        response.on('end',()=> {
          const ack=Buffer.concat(output);
          if(armed===operation) {
            armed=null;
            // The upstream has completed a full successful response: commit and dedup
            // are durable before the client is deliberately left without an ACK.
            captured.set(operation,{status:response.statusCode??0,ack:JSON.parse(ack.toString()),body_hash:hash(body),upstream:port});
            clientResponse.destroy();return;
          }
          clientResponse.writeHead(response.statusCode??502,response.headers);clientResponse.end(ack);
        });
      });
      request.on('error',()=> {if(!clientResponse.headersSent)clientResponse.writeHead(502);clientResponse.end('Upstream unavailable');});request.end(body);
    } catch {clientResponse.destroy();}
  });
  try {
    await fixture.admin.query('BEGIN');
    await seedR1Metadata({exec:async sql=>{await fixture.admin.query(sql)},query:async<T>(sql:string,params:unknown[]=[])=>({rows:(await fixture.admin.query(sql,params)).rows as T[]})});
    await fixture.admin.query('COMMIT');
    const releaseRoot=join(directory,'published'),mailDirectory=join(directory,'mail');
    const manifestBytes=await readFile(join(root,'dist/release-manifest.json'));
    const manifest=JSON.parse(manifestBytes.toString());
    const releaseDirectory=join(releaseRoot,'releases',manifest.build_id);
    await mkdir(releaseDirectory,{recursive:true});
    for(const file of [...Object.keys(manifest.files),'release-manifest.json']) {
      await mkdir(dirname(join(releaseDirectory,file)),{recursive:true});await copyFile(join(root,'dist',file),join(releaseDirectory,file));
    }
    const {files:_,...identity}=manifest,descriptor={...identity,manifest_sha256:hash(manifestBytes)};
    await writeFile(join(releaseRoot,'active.json'),JSON.stringify(descriptor));
    await writeFile(join(releaseRoot,'catalog.json'),JSON.stringify({manifest_version:1,builds:{[manifest.build_id]:descriptor}}));
    await copyFile(join(root,'deploy/launcher.html'),join(releaseRoot,'index.html'));
    const bridgePort=await bind(bridge),origin=`http://127.0.0.1:${bridgePort}`;
    const secret='synthetic-shared-secret-for-isolated-process-update-32';
    async function launch(buildId:string) {
      const port=await freePort();
      const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),AUTH_ORIGIN:origin,AUTH_SECRET:secret,
        DATABASE_URL:fixture.runtimeUrl,AUTH_DATABASE_URL:fixture.authUrl,AUTH_MAIL_MODE:'file',AUTH_MAIL_DIRECTORY:mailDirectory,
        SYEZZHAEM_RELEASE_ROOT:releaseRoot,API_BUILD_ID:buildId};
      delete env.LD_PRELOAD;
      const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env,stdio:['ignore','pipe','pipe']});children.push(child);
      let log='';child.stdout?.on('data',chunk=>{log+=chunk});child.stderr?.on('data',chunk=>{log+=chunk});
      let ready=false;
      for(let i=0;i<200;i++) {
        if(child.exitCode!==null)throw new Error(`API process failed to start (${child.exitCode}); ${log.slice(-600)}`);
        try {const response=await fetch(`http://127.0.0.1:${port}/api/syezzhaem/v1/ready`);if(response.status===200){const result=await response.json() as {ok:boolean;api_build_id:string};if(result.ok&&result.api_build_id===buildId){ready=true;break}}}catch{}
        await delay(25);
      }
      assert.equal(ready,true,'actual server/index process must pass readiness');
      const version=await (await fetch(`http://127.0.0.1:${port}/api/syezzhaem/v1/version`)).json() as {api_build_id:string;process_id:number};
      assert.equal(version.api_build_id,buildId);assert.equal(version.process_id,child.pid);
      return {child,port,version};
    }
    const old=await launch('r1-api-before-update');upstream=old.port;
    async function post(path:string,body:string,cookie?:string,owner?:string) {
      return fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(owner?{'x-syezzhaem-expected-user':owner}:{})},body});
    }
    const signup=await post('/api/syezzhaem/auth/sign-up/email',JSON.stringify({email:'process-update@example.test',password:'Synthetic-password-for-process-update-123!',name:'Test',callbackURL:`${origin}/games/syezzhaem/`}));assert.equal(signup.status,200);
    let mail:{text:string}|undefined;
    for(let i=0;i<100;i++) {
      try {const files=await readdir(mailDirectory);if(files.length){mail=JSON.parse(await readFile(join(mailDirectory,files[0]),'utf8'));break}}catch{}
      await delay(20);
    }
    assert.ok(mail);const match=mail.text.match(/https?:\/\/\S+/);assert.ok(match);
    const verification=await fetch(match[0],{redirect:'manual'});assert.ok([200,302].includes(verification.status));
    const login=await post('/api/syezzhaem/auth/sign-in/email',JSON.stringify({email:'process-update@example.test',password:'Synthetic-password-for-process-update-123!'}));assert.equal(login.status,200);
    const cookieHeader=login.headers.getSetCookie().find(value=>value.includes('syezzhaem.session_token='));assert.ok(cookieHeader);
    const cookie=cookieHeader.split(';')[0],owner=(await login.json() as {user:{id:string}}).user.id;
    const startBody=JSON.stringify({client_build_id:manifest.build_id,content_version:manifest.content_version,level_id:manifest.level_id,request_id:randomUUID()});
    const started=await (await post('/api/syezzhaem/v1/rpc/run_start_v1',startBody,cookie,owner)).json();assert.equal(started.ok,true);
    const state=fromSnapshotV1(started.data.checkpoint);step(state,{left:false,right:false,jump:false});
    const checkpointKey=randomUUID(),checkpointBody=JSON.stringify({run_id:started.data.run_id,expected_revision:0,request_id:checkpointKey,snapshot:toSnapshotV1(state,started.data.checkpoint)});
    armed='checkpoint_save_v1';
    await assert.rejects(post('/api/syezzhaem/v1/rpc/checkpoint_save_v1',checkpointBody,cookie,owner));
    const checkpointAck=captured.get('checkpoint_save_v1');assert.ok(checkpointAck);assert.equal(checkpointAck.status,200);assert.equal((checkpointAck.ack as {ok:boolean}).ok,true);assert.equal(checkpointAck.upstream,old.port);
    assert.equal(Number((await fixture.admin.query('SELECT count(*) AS n FROM syezzhaem.request_dedup WHERE user_id=$1 AND request_id=$2',[owner,checkpointKey])).rows[0].n),1);
    const fresh=await launch('r1-api-after-update');assert.notEqual(fresh.child.pid,old.child.pid);assert.equal(old.child.exitCode,null);upstream=fresh.port;
    const session=await (await fetch(origin+'/api/syezzhaem/auth/get-session',{headers:{cookie}})).json() as {user:{id:string}};assert.equal(session.user.id,owner);
    const retried=await (await post('/api/syezzhaem/v1/rpc/checkpoint_save_v1',checkpointBody,cookie,owner)).json();assert.deepEqual(retried,checkpointAck.ack as Envelope<RunDto>);assert.ok(retried.ok);assert.equal(retried.data.revision,1);
    const attemptsToSave=attempts.filter(x=>x.operation==='checkpoint_save_v1');assert.deepEqual(attemptsToSave.map(x=>x.body_hash),[hash(checkpointBody),hash(checkpointBody)]);assert.deepEqual(attemptsToSave.map(x=>x.upstream),[old.port,fresh.port]);
    assert.equal(Number((await fixture.admin.query('SELECT revision FROM syezzhaem.entities WHERE id=$1',[started.data.run_id])).rows[0].revision),1);
    const mismatch=await (await post('/api/syezzhaem/v1/rpc/checkpoint_save_v1',JSON.stringify({...JSON.parse(checkpointBody),expected_revision:1}),cookie,owner)).json();assert.equal(mismatch.error.code,'IDEMPOTENCY_MISMATCH');
    const finalState=fromSnapshotV1(retried.data.checkpoint);finalState.player.hp=0;finalState.outcome='lost';finalState.reason='player';
    const finishKey=randomUUID(),finishBody=JSON.stringify({run_id:started.data.run_id,expected_revision:1,request_id:finishKey,snapshot:toSnapshotV1(finalState,retried.data.checkpoint),outcome:'lost'});
    armed='run_finish_v1';await assert.rejects(post('/api/syezzhaem/v1/rpc/run_finish_v1',finishBody,cookie,owner));
    const finishAck=captured.get('run_finish_v1');assert.ok(finishAck);assert.equal(finishAck.status,200);assert.equal((finishAck.ack as {ok:boolean}).ok,true);assert.equal(finishAck.upstream,fresh.port);
    // The still-running old process shares the same dedup and can resolve a newer
    // process's accepted operation under the same supported R1 contract.
    upstream=old.port;
    const finished=await (await post('/api/syezzhaem/v1/rpc/run_finish_v1',finishBody,cookie,owner)).json();assert.deepEqual(finished,finishAck.ack as Envelope<RunDto>);assert.ok(finished.ok);assert.equal(finished.data.revision,2);assert.equal(finished.data.lifecycle,'lost');
    const history=await (await post('/api/syezzhaem/v1/rpc/history_list_v1','{}',cookie,owner)).json();assert.equal(history.data.items.length,1);assert.equal(history.data.items[0].run_id,started.data.run_id);
    assert.equal(Number((await fixture.admin.query('SELECT count(*) AS n FROM syezzhaem.request_dedup WHERE user_id=$1 AND request_id=$2',[owner,finishKey])).rows[0].n),1);
    assert.equal(Number((await fixture.admin.query('SELECT count(*) AS n FROM syezzhaem.active_run_index WHERE user_id=$1',[owner])).rows[0].n),0);
    const finishAttempts=attempts.filter(x=>x.operation==='run_finish_v1');assert.deepEqual(finishAttempts.map(x=>x.body_hash),[hash(finishBody),hash(finishBody)]);assert.deepEqual(finishAttempts.map(x=>x.upstream),[fresh.port,old.port]);
  } finally {
    for(const child of children.reverse())await stop(child);
    await new Promise<void>(resolve=>bridge.close(()=>resolve()));bridge.closeAllConnections();
    await fixture.close();await rm(directory,{recursive:true,force:true});
  }
});
