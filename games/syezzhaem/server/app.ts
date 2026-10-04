import Fastify from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { R1Store, DomainError } from './r1-store.ts';
import { createDatabase } from './database.ts';
import { ReleaseRegistry } from './releases.ts';
import { AUTH_BASE_PATH, type AuthRuntime } from './auth.ts';

const operations = ['bootstrap_v1','profile_update_v1','run_start_v1','run_get_v1','checkpoint_save_v1','run_finish_v1','run_abandon_v1','history_list_v1'] as const;
type Operation = typeof operations[number];
const keys: Record<Operation, readonly string[]> = {
  bootstrap_v1: ['client_build','request_id'], profile_update_v1: ['expected_revision','settings','request_id'],
  run_start_v1: ['client_build_id','level_id','content_version','request_id'], run_get_v1: ['run_id','request_id'],
  checkpoint_save_v1: ['run_id','expected_revision','request_id','snapshot'], run_finish_v1: ['run_id','expected_revision','request_id','snapshot','outcome'],
  run_abandon_v1: ['run_id','expected_revision','request_id'], history_list_v1: ['cursor','page_size','request_id'],
};
export interface AppOptions {
  store?: R1Store; databaseUrl?: string; auth: AuthRuntime; releaseRoot?: string; staticDir?: string;
  apiBuildId?: string; drainToken?: string; onSaveError?: (entry:{request_id:string;operation:string;code:string;at:string})=>void;
}
export async function createApp(options: AppOptions) {
  const store = options.store ?? new R1Store(await createDatabase({databaseUrl:options.databaseUrl}));
  const registry = new ReleaseRegistry(options.releaseRoot);
  const app = Fastify({ logger: false, bodyLimit: 512 * 1024, trustProxy: ['127.0.0.1','::1'] });
  const staticDir = resolve(options.staticDir ?? 'dist');
  const releaseRoot = options.releaseRoot ? resolve(options.releaseRoot) : undefined;
  const inFlight=new Set<string>(); let draining=false;
  app.addHook('onClose',async()=> { if (!options.store) await store.close(); });
  app.addHook('onRequest',async(request,reply)=> {
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
    if (request.url.startsWith('/api/syezzhaem/')) {
      reply.header('Cache-Control','no-store');
      if(draining && !request.url.startsWith('/api/syezzhaem/v1/version')) return reply.code(503).send({code:'API_DRAINING'});
      if (request.method === 'POST' && request.headers.origin !== options.auth.origin) return reply.code(403).send({code:'ORIGIN_DENIED',message:'Use the configured game origin'});
      inFlight.add(request.id);
    }
  });
  app.addHook('onResponse',async request=> {inFlight.delete(request.id);});
  if(options.drainToken) {
    if(options.drainToken.length<32) throw new Error('API_DRAIN_TOKEN must have at least 32 characters');
    const checkOperator=(request:{raw:{socket:{remoteAddress?:string}};headers:Record<string,unknown>})=> {
      const address=request.raw.socket.remoteAddress;
      if(!address||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return false;
      const supplied=request.headers['x-syezzhaem-operator-token'];
      return typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(options.drainToken!)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(options.drainToken!));
    };
    const status=()=>({draining,in_flight:inFlight.size,api_build_id:options.apiBuildId??'r1-api-001'});
    app.get('/internal/syezzhaem/drain-status',async(request,reply)=> checkOperator(request)?status():reply.code(404).send({code:'NOT_FOUND'}));
    app.post('/internal/syezzhaem/drain',async(request,reply)=> {if(!checkOperator(request))return reply.code(404).send({code:'NOT_FOUND'});draining=true;return status();});
  }
  app.setErrorHandler((error,_request,reply)=> {
    if (error && typeof error==='object' && 'statusCode' in error && typeof error.statusCode==='number' && error.statusCode<500) return reply.code(error.statusCode).send({code:error.statusCode===413?'BODY_TOO_LARGE':'BAD_REQUEST'});
    return reply.code(500).send({code:'INTERNAL_ERROR',message:'Server operation failed'});
  });
  app.route({ method:['GET','POST'], url:`${AUTH_BASE_PATH}/*`, async handler(request,reply) {
    const url = new URL(request.url, options.auth.origin);
    const headers = fromNodeHeaders(request.headers);
    headers.delete('x-forwarded-for'); headers.delete('x-real-ip'); headers.set('x-real-ip',request.ip);
    const response = await options.auth.auth.handler(new Request(url,{method:request.method,headers,...(request.method==='POST'?{body:JSON.stringify(request.body)}:{})}));
    reply.code(response.status);
    response.headers.forEach((value,key)=> { if(key!=='set-cookie') reply.header(key,value); });
    const cookies = response.headers.getSetCookie(); if(cookies.length) reply.header('set-cookie',cookies);
    return reply.send(response.body?await response.text():null);
  } });
  app.get('/api/syezzhaem/v1/version',async()=> ({
    api_build_id:options.apiBuildId ?? 'r1-api-001', process_id:process.pid, api_version:'v1', snapshot_schema_versions:[1],
    supported_content_versions:['r1-map-1'], supported_rules_versions:['r1-rules-1'], active:await registry.active(),
  }));
  const readiness = async (_request:unknown,reply:{code:(status:number)=>{send:(value:unknown)=>unknown}}) => {
    try { await registry.verify(); await options.auth.check(); await store.check(); return {ok:true,api_build_id:options.apiBuildId??'r1-api-001',checks:{auth:true,db:true,releases:true}}; }
    catch { return reply.code(503).send({ok:false,code:'NOT_READY'}); }
  };
  app.get('/api/syezzhaem/v1/ready',readiness);
  app.get('/api/syezzhaem/v1/readiness',readiness);
  for(const operation of operations) app.post(`/api/syezzhaem/v1/rpc/${operation}`,async(request,reply)=> {
    let requestId: string = randomUUID();
    try {
      if(!request.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({code:'JSON_REQUIRED'});
      const session = await options.auth.auth.api.getSession({headers:fromNodeHeaders(request.headers),query:{disableCookieCache:true}});
      if(!session?.user.emailVerified) return reply.code(401).send({code:'UNAUTHORIZED',message:'Verified account session required'});
      // This is only the caller's context expectation. Authority remains the verified session.
      if(request.headers['x-syezzhaem-expected-user']!==session.user.id) return reply.code(401).send({code:'AUTH_CONTEXT_CHANGED',message:'Account context changed; sign in to the original account'});
      const input = object(request.body);
      if(input.request_id!==undefined) {
        if(typeof input.request_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id))throw domain('VALIDATION_FAILED','request_id');
        requestId=input.request_id;
      }
      for(const key of Object.keys(input)) if(!keys[operation].includes(key)) throw domain('VALIDATION_FAILED',key);
      if(operation==='bootstrap_v1'&&input.client_build!==undefined&&(typeof input.client_build!=='string'||input.client_build.length>96))throw domain('VALIDATION_FAILED','client_build');
      let data: unknown;
      switch(operation) {
        case 'bootstrap_v1': {
          const active=await registry.active();
          data=await store.bootstrap(session.user.id,input.client_build,{client_build_id:active.build_id,content_version:active.content_version,rules_version:active.rules_version,level_id:active.level_id});break;
        }
        case 'profile_update_v1': data=await store.updateProfile(session.user.id,input); break;
        case 'run_start_v1': {
          data=await store.start(session.user.id,input,async()=> {
            const active=await registry.active();
            return {client_build_id:active.build_id,content_version:active.content_version,rules_version:active.rules_version,level_id:active.level_id};
          }); break;
        }
        case 'run_get_v1': data=await store.get(session.user.id,input.run_id); break;
        case 'checkpoint_save_v1': data=await store.save(session.user.id,input); break;
        case 'run_finish_v1': data=await store.finish(session.user.id,input); break;
        case 'run_abandon_v1': data=await store.abandon(session.user.id,input); break;
        case 'history_list_v1': {const {request_id:_,...history}=input;data=await store.history(session.user.id,history);break;}
      }
      return {ok:true,data,error:null,request_id:requestId};
    } catch(error) {
      if(error instanceof DomainError) {
        options.onSaveError?.({request_id:requestId,operation,code:error.code,at:new Date().toISOString()});
        return {ok:false,data:null,error:{code:error.code,message:error.message,...(error.path?{path:error.path}:{}),...(error.details?{details:error.details}:{})},request_id:requestId};
      }
      options.onSaveError?.({request_id:requestId,operation,code:'INTERNAL_ERROR',at:new Date().toISOString()});
      return reply.code(500).send({ok:false,data:null,error:{code:'INTERNAL_ERROR',message:'Server operation failed'},request_id:requestId});
    }
  });
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
  app.get('/*',async(request,reply)=> {
    if(request.url.startsWith('/api/')) return reply.code(404).send({code:'NOT_FOUND'});
    let pathname:string;
    try { pathname=decodeURIComponent(request.url.split('?')[0]); } catch { return reply.code(400).send('Bad path'); }
    let root=staticDir,relative=pathname;
    if(pathname.startsWith('/games/syezzhaem/releases/')) {
      if(releaseRoot) { root=resolve(releaseRoot,'releases'); relative=pathname.slice('/games/syezzhaem/releases'.length); }
      else { const descriptor=await registry.active(); if(!pathname.startsWith(`/games/syezzhaem/releases/${descriptor.build_id}/`))return reply.code(404).send('Not found'); relative=pathname.slice(`/games/syezzhaem/releases/${descriptor.build_id}`.length); }
    } else if(pathname==='/games/syezzhaem/'||pathname==='/games/syezzhaem') {
      if(releaseRoot) {root=releaseRoot;relative='/index.html';}
      else { root=resolve('deploy');relative='/launcher.html'; }
    } else if(pathname==='/games/syezzhaem/active.json') {
      return reply.header('Cache-Control','no-store').send(await registry.active());
    } else if(pathname==='/games/syezzhaem/catalog.json') {
      return reply.header('Cache-Control','no-store').send({manifest_version:1,builds:await registry.catalog()});
    } else if(pathname==='/') { return reply.redirect('/games/syezzhaem/'); }
    else return reply.code(404).send('Not found');
    if(relative.endsWith('/')) relative+='index.html';
    const path=resolve(root,`.${relative}`);
    if(!path.startsWith(root+sep))return reply.code(404).send('Not found');
    try {
      if(!(await stat(path)).isFile())return reply.code(404).send('Not found');
      reply.header('Cache-Control',pathname.startsWith('/games/syezzhaem/releases/')?'public, max-age=31536000, immutable':'no-store');
      return reply.type(mime[extname(path)]??'application/octet-stream').send(await readFile(path));
    } catch {return reply.code(404).send('Not found');}
  });
  return app;
}
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw domain('VALIDATION_FAILED','$');
  return value as Record<string,unknown>;
}
function domain(code:string,path:string):DomainError {return new DomainError(code,'Invalid request field',400,path);}
