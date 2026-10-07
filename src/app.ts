import { BalanceError, validateBalanceValues } from './balance/model.js';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { catalog } from './game/catalog.js';
import { ProfileService, ProfileError, publicRun, publicOperationResult, EQUIPMENT_CATALOG, validateOperation } from './profile/service.js';
import type { Repository, Session } from './profile/repository.js';
import { verifyPassword, verifyDummyPassword } from './profile/auth.js';

// The checked-in OpenAPI file is the source of wire schemas for this release.
const contract = JSON.parse(readFileSync(new URL('../contracts/openapi.json', import.meta.url), 'utf8'));

export interface HealthResponse {
  status: 'ok';
  apiVersion: '1';
  serverTime: string;
}

export interface AppOptions extends FastifyServerOptions { profileRepository?: Repository; clock?: ()=>number; secureCookies?: boolean; }
export function buildApp(options: AppOptions = {}) {
  const {profileRepository:repository,clock=Date.now,secureCookies=process.env.NODE_ENV==='production',...fastifyOptions}=options;
  const service=repository?new ProfileService(repository,clock):null;
  const app = Fastify({
    ...fastifyOptions,
    bodyLimit: 131_072,
    requestTimeout: 10_000,
    exposeHeadRoutes: false,
    logger: options.logger ?? false,
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  const health = (): HealthResponse => ({
    status: 'ok',
    apiVersion: '1',
    serverTime: new Date().toISOString(),
  });
  for (const url of ['/api/v1/health', '/healthz']) {
    app.get<{ Reply: HealthResponse }>(url, {
      schema: { response: { 200: contract.components.schemas.HealthResponse } },
    }, health);
  }
  app.get('/api/v1/catalog', {
    schema: { response: { 200: contract.components.schemas.ContentCatalog } },
  }, () => catalog);

  const cookieName=secureCookies?'__Host-foxy-session':'foxy-session';
  const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
  const cookieValue=(header:string|undefined):string|null=>{
    const cookie=header?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    return cookie&&/^[A-Za-z0-9_-]{43}$/.test(cookie)?cookie:null;
  };
  const sessionFor=async(request:{headers:Record<string,string|string[]|undefined>}):Promise<Session>=>{
    if(!repository)throw new ProfileError('SERVICE_UNAVAILABLE',503);
    const token=cookieValue(request.headers.cookie as string|undefined);
    const session=token?await repository.getSession(tokenHash(token)):null;
    if(!session||Date.parse(session.expiresAt)<=clock())throw new ProfileError('AUTH_REQUIRED',401);
    return session;
  };
  const sameOrigin=(request:{headers:Record<string,string|string[]|undefined>})=>{
    if(request.headers['sec-fetch-site']==='cross-site')throw new ProfileError('CSRF_FAILED',403);
    const origin=request.headers.origin;
    if(origin){try{if(new URL(origin as string).host!==request.headers.host)throw new Error();}catch{throw new ProfileError('CSRF_FAILED',403);}}
    if(!(request.headers['content-type'] as string|undefined)?.toLowerCase().startsWith('application/json'))throw new ProfileError('INVALID_REQUEST',400);
  };
  const csrf=(request:{headers:Record<string,string|string[]|undefined>},session:Session)=>{
    sameOrigin(request);const supplied=request.headers['x-csrf-token'];
    if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(session.csrf)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(session.csrf)))throw new ProfileError('CSRF_FAILED',403);
  };
  const loginAttempts=new Map<string,{count:number,reset:number}>();
  const limitLogin=(key:string,max=5)=>{
    for(const [k,v]of loginAttempts)if(v.reset<=clock())loginAttempts.delete(k);
    if(loginAttempts.size>1000)throw new ProfileError('RATE_LIMITED',429);
    const counter=loginAttempts.get(key)??{count:0,reset:clock()+60_000};counter.count++;loginAttempts.set(key,counter);
    if(counter.count>max)throw new ProfileError('RATE_LIMITED',429);
  };
  const sessionResponse=(session:Session)=>({account:{id:session.accountId,login:session.login},csrfToken:session.csrf,expiresAt:session.expiresAt});
  app.post('/api/v1/auth/login',async(request,reply)=>{
    if(!repository)throw new ProfileError('SERVICE_UNAVAILABLE',503);
    sameOrigin(request);const body=request.body as {login?:unknown,password?:unknown};
    if(!body||Object.keys(body).some(k=>!['login','password'].includes(k))||typeof body.login!=='string'||! /^[a-z0-9][a-z0-9._-]{2,63}$/.test(body.login)||typeof body.password!=='string'||body.password.length<12||body.password.length>256)throw new ProfileError('INVALID_CREDENTIALS',401);
    limitLogin(`ip:${request.ip}`,100);limitLogin(`login:${body.login}`);
    const account=await repository.findAccount(body.login);
    const valid=account?await verifyPassword(body.password,account.passwordHash):await verifyDummyPassword(body.password);
    if(!account||!valid)throw new ProfileError('INVALID_CREDENTIALS',401);
    const token=randomBytes(32).toString('base64url'),csrfToken=randomBytes(24).toString('base64url'),expiresAt=new Date(clock()+30*24*60*60*1000).toISOString();
    await repository.createSession(account.id,tokenHash(token),csrfToken,expiresAt,account.passwordHash);
    const session=await repository.getSession(tokenHash(token));if(!session)throw new ProfileError('SERVICE_UNAVAILABLE',503);
    reply.header('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secureCookies?'; Secure':''}`);
    return sessionResponse(session);
  });
  app.get('/api/v1/session',async(request)=>{if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);return sessionResponse(await sessionFor(request));});
  app.post('/api/v1/auth/logout',async(request,reply)=>{
    const session=await sessionFor(request);csrf(request,session);
    if(!request.body||typeof request.body!=='object'||Array.isArray(request.body)||Object.keys(request.body).length)throw new ProfileError('INVALID_REQUEST',400);
    await repository!.revokeSession(tokenHash(cookieValue(request.headers.cookie)!));
    reply.header('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies?'; Secure':''}`);return{ok:true};
  });
  app.get('/api/v1/profile',async(request)=>{
    const session=await sessionFor(request);
    if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);
    return repository!.getProfile(session.accountId);
  });
  app.get('/api/v1/workshop',async(request)=>{const session=await sessionFor(request);if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);return service!.getWorkshop(session.accountId);});
  app.get('/api/v1/balance',async(request)=>{if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);if(!repository)throw new ProfileError('BALANCE_STORAGE_UNAVAILABLE',503);return repository.getBalance();});
  app.get('/api/v1/admin/balance',async(request)=>{const session=await sessionFor(request);if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);if(!await repository!.isBalanceAdmin(session.accountId))throw new ProfileError('BALANCE_FORBIDDEN',403);return repository!.getBalance();});
  app.put('/api/v1/admin/balance',async(request)=>{
    const session=await sessionFor(request);csrf(request,session);
    if(!await repository!.isBalanceAdmin(session.accountId))throw new ProfileError('BALANCE_FORBIDDEN',403);
    const body=request.body as {expectedRevision?:unknown;values?:unknown};
    if(request.url.includes('?')||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='expectedRevision,values'||typeof body.expectedRevision!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.expectedRevision))throw new ProfileError('INVALID_BALANCE',422);
    return repository!.publishBalance(session.accountId,body.expectedRevision.toLowerCase(),validateBalanceValues(body.values));
  });
  app.get('/api/v1/economy/catalog',()=>EQUIPMENT_CATALOG);
  app.get('/readyz',async()=>{if(!repository)throw new ProfileError('SERVICE_UNAVAILABLE',503);await repository.readiness();return{status:'ready',apiVersion:'1'};});
  app.get('/api/v1/run',async(request)=>{
    const session=await sessionFor(request),query=request.query as {clientId?:string};
    if(Object.keys(query).some(k=>k!=='clientId')||!query.clientId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.clientId))throw new ProfileError('INVALID_REQUEST',400);
    return publicRun(await repository!.getRun(session.accountId),query.clientId.toLowerCase());
  });
  app.post('/api/v1/operations',async(request)=>{
    const session=await sessionFor(request);csrf(request,session);validateOperation(request.body);
    const result=await service!.perform(session.accountId,request.body);
    request.log.info({operationId:result.operationId,runId:result.run?.snapshot.state.runId??null,contentVersion:EQUIPMENT_CATALOG.version,replayed:result.replayed},'Operation committed');return result;
  });
  app.get('/api/v1/operations/:operationId',async(request)=>{
    const session=await sessionFor(request),operationId=(request.params as {operationId:string}).operationId;
    if(request.url.includes('?'))throw new ProfileError('INVALID_REQUEST',400);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId))throw new ProfileError('INVALID_REQUEST',400);
    const operation=await repository!.getOperation(session.accountId,operationId);if(!operation)throw new ProfileError('OPERATION_NOT_FOUND',404);return publicOperationResult(operation.result);
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint is not available in this release.' } });
  });

  app.setErrorHandler((error, request, reply) => {
    if(error instanceof ProfileError||error instanceof BalanceError){reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});return;}
    if(typeof error==='object'&&error!==null&&'statusCode'in error&&error.statusCode===503){request.log.error({code:'PROFILE_STORAGE_UNAVAILABLE'},'Profile storage unavailable');reply.code(503).send({error:{code:'PROFILE_STORAGE_UNAVAILABLE',message:'Persistent profile is unavailable.'}});return;}
    const suppliedStatus = typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode : undefined;
    const status = typeof suppliedStatus === 'number' && suppliedStatus >= 400 && suppliedStatus < 500
      ? suppliedStatus : 500;
    if (status >= 500) request.log.error({ code: 'INTERNAL_ERROR' }, 'Request failed');
    reply.code(status).send({ error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message: status === 500 ? 'Request could not be completed.' : 'Request is invalid.',
    } });
  });

  return app;
}
