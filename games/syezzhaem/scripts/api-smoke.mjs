/** Explicit operator-owned synthetic account smoke before API cutover.
 * Credentials are supplied through environment; never written to the artifact.
 */
import { randomUUID } from 'node:crypto';
const origin=process.env.SYEZZHAEM_SMOKE_ORIGIN;
const email=process.env.SYEZZHAEM_SMOKE_EMAIL,password=process.env.SYEZZHAEM_SMOKE_PASSWORD;
if(!origin||!email||!password||process.env.SYEZZHAEM_SMOKE_SYNTHETIC_ACCOUNT!=='yes')throw new Error('Confirmed synthetic account and environment credentials are required');
const trustedOrigin=process.env.AUTH_ORIGIN??origin;
let cookie='',owner;
async function post(path,body){
  const r=await fetch(origin+path,{method:'POST',headers:{Origin:trustedOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(owner?{'X-Syezzhaem-Expected-User':owner}:{})},body:JSON.stringify(body)});
  const setCookies=r.headers.getSetCookie();if(setCookies.length)cookie=setCookies.map(x=>x.split(';',1)[0]).join('; ');
  const data=await r.json();if(!r.ok||data.ok===false)throw new Error('Synthetic API operation failed: '+path+' status '+r.status);
  return data.data??data;
}
const signed=await post('/api/syezzhaem/auth/sign-in/email',{email,password});
if(!signed.user?.emailVerified)throw new Error('Smoke account is not confirmed');
owner=signed.user.id;
const version=await fetch(origin+'/api/syezzhaem/v1/version').then(r=>r.json());
const rpc=(operation,body)=>post('/api/syezzhaem/v1/rpc/'+operation,body);
const bootstrap=await rpc('bootstrap_v1',{client_build:version.active.build_id});
if(bootstrap.active_run)throw new Error('Synthetic account has an existing active run; resolve it explicitly before retrying');
const startBody={client_build_id:version.active.build_id,content_version:version.active.content_version,level_id:version.active.level_id,request_id:randomUUID()};
const started=await rpc('run_start_v1',startBody);
const retried=await rpc('run_start_v1',startBody);
if(started.run_id!==retried.run_id||started.revision!==retried.revision)throw new Error('Start idempotency smoke failed');
const loaded=await rpc('run_get_v1',{run_id:started.run_id});
const body={run_id:started.run_id,expected_revision:loaded.revision,request_id:randomUUID(),snapshot:loaded.checkpoint};
const saved=await rpc('checkpoint_save_v1',body),again=await rpc('checkpoint_save_v1',body);
if(saved.revision!==loaded.revision+1||saved.revision!==again.revision)throw new Error('Checkpoint CAS/idempotency smoke failed');
const abandoned=await rpc('run_abandon_v1',{run_id:started.run_id,expected_revision:saved.revision,request_id:randomUUID()});
if(abandoned.lifecycle!=='abandoned')throw new Error('Smoke active slot was not released');
console.log(JSON.stringify({operation_status:'VERIFIED',api_build_id:version.api_build_id,checks:['verified synthetic auth','bootstrap','start idempotency','own checkpoint read','checkpoint CAS/idempotency','abandon active slot']}));
