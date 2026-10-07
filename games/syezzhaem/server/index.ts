import { createApp } from './app.ts';
import { createAuthRuntime, fileMailer, smtpMailer } from './auth.ts';

const port = Number(process.env.PORT ?? 8091);
if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid PORT');
const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
const host = process.env.HOST ?? '127.0.0.1';
if (!['127.0.0.1','::1'].includes(host)) throw new Error('API must bind to loopback behind the shared server proxy');
const origin = process.env.AUTH_ORIGIN;
const secret = process.env.AUTH_SECRET;
if (!origin || !secret) throw new Error('AUTH_ORIGIN and stable AUTH_SECRET are required');
if(mode==='production'&&!process.env.SYEZZHAEM_RELEASE_ROOT)throw new Error('Production requires the shared SYEZZHAEM_RELEASE_ROOT');
const mailer = process.env.AUTH_MAIL_MODE === 'file'
  ? fileMailer(process.env.AUTH_MAIL_DIRECTORY ?? '.dev-mail',mode)
  : smtpMailer(process.env);
const auth = await createAuthRuntime({origin,secret,databaseUrl:process.env.AUTH_DATABASE_URL,mode,mailer});
let app;
try {
  app = await createApp({databaseUrl:process.env.DATABASE_URL,auth,staticDir:process.env.SYEZZHAEM_STATIC_DIR??'dist',releaseRoot:process.env.SYEZZHAEM_RELEASE_ROOT,apiBuildId:process.env.API_BUILD_ID,drainToken:process.env.API_DRAIN_TOKEN,
    onSaveError:entry=> process.stderr.write(`${JSON.stringify(entry)}\n`),
  });
  const readiness=await app.inject({method:'GET',url:'/api/syezzhaem/v1/ready'});
  if(readiness.statusCode!==200)throw new Error('Initial API readiness failed; published content, Auth and game migration must be compatible');
  await app.listen({port,host});
} catch(error) {if(app)await app.close();await auth.close();throw error;}
console.log(`СЪЕЗЖАЕМ R2 API: ${host}:${port}`);
let stopping=false;
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=> {
  if(stopping)return;stopping=true;
  // Fastify stops accepting new requests and drains in-flight work before closing shared pools.
  void app.close().then(()=>auth.close()).then(()=>process.exit(0));
});
