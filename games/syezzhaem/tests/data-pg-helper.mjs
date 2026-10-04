// Disposable real PostgreSQL fixture. Binaries are an explicit QA dependency.
import {mkdtemp,chown,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import pg from 'pg';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function execute(bin,args,options){return new Promise((resolve,reject)=>{const p=spawn(bin,args,options);let log='';p.stdout.on('data',x=>log+=x);p.stderr.on('data',x=>log+=x);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`PostgreSQL command failed ${code}: ${log.slice(-1200)}`)))})}
export async function startPostgresFixture(options={}){
 const native=process.env.R1_PG_NATIVE_DIR??resolve(dirname(fileURLToPath(import.meta.resolve(`@embedded-postgres/${process.platform}-${process.arch}`))),'../native');
 const dir=await mkdtemp(join(tmpdir(),'syezzhaem-pg-'));await chmod(dir,0o755);
 const root=process.getuid?.()===0,shim=process.env.R1_PG_UID_SHIM;const uid=root&&!shim?65534:process.getuid(),gid=root&&!shim?65534:process.getgid();if(root&&!shim)await chown(dir,uid,gid);
 const env={...process.env,...(shim?{LD_PRELOAD:shim}:{}),LD_LIBRARY_PATH:`${native}/lib${process.env.LD_LIBRARY_PATH?`:${process.env.LD_LIBRARY_PATH}`:''}`};
 const spawnOptions={env,uid,gid,stdio:['ignore','pipe','pipe']};
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 try{await execute(`${native}/bin/initdb`,['-D',join(dir,'data'),'-U','postgres','-A','trust','--locale=C','--encoding=UTF8'],spawnOptions)}catch(e){await rm(dir,{recursive:true,force:true});throw e}
 const processPG=spawn(`${native}/bin/postgres`,['-D',join(dir,'data'),'-h','127.0.0.1','-p',String(port),'-k',''],spawnOptions);let log='';processPG.stderr.on('data',x=>log+=x);processPG.stdout.on('data',x=>log+=x);
 const adminUrl=`postgresql://postgres@127.0.0.1:${port}/postgres`,admin=new pg.Pool({connectionString:adminUrl});let ready=false;
 for(let i=0;i<100;i++){try{await admin.query('SELECT 1');ready=true;break}catch{await delay(50)}}
 if(!ready){processPG.kill('SIGTERM');await admin.end();await rm(dir,{recursive:true,force:true});throw new Error(`PostgreSQL readiness failed: ${log.slice(-1200)}`)}
 const runtimeUrl=`postgresql://r1_test_runtime@127.0.0.1:${port}/postgres`,authUrl=`postgresql://r1_test_auth@127.0.0.1:${port}/postgres`;
 let closed=false;
 const fixture={admin,adminUrl,runtimeUrl,authUrl,port,dir,async close(){if(closed)return;closed=true;await admin.end();processPG.kill('SIGTERM');await new Promise(resolve=>processPG.once('exit',resolve));await rm(dir,{recursive:true,force:true})}};
 try{
  await admin.query(await readFile(new URL('../db/000-roles.sql',import.meta.url),'utf8'));
  await admin.query('CREATE ROLE r1_test_runtime LOGIN NOSUPERUSER NOBYPASSRLS IN ROLE syezzhaem_runtime');
  await admin.query('CREATE ROLE r1_test_auth LOGIN NOSUPERUSER NOBYPASSRLS IN ROLE syezzhaem_auth_runtime');
  await admin.query(await readFile(new URL('../db/001-r1.sql',import.meta.url),'utf8'));
  if(options.auth){await admin.query(await readFile(new URL('../db/002-auth.sql',import.meta.url),'utf8'))}
  return fixture;
 }catch(e){await fixture.close();throw e}
}
