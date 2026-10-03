import { buildApp } from './app.js';
import { readFileSync } from 'node:fs';
import { PgRepository } from './profile/repository.js';

const {DATABASE_URL,DATABASE_URL_FILE}=process.env;
if(Boolean(DATABASE_URL)===Boolean(DATABASE_URL_FILE))throw new Error('Set exactly one of DATABASE_URL or DATABASE_URL_FILE.');
const connectionString=DATABASE_URL_FILE?readFileSync(DATABASE_URL_FILE,'utf8').trim():DATABASE_URL;
if(!connectionString)throw new Error('Database connection is empty.');
const repository=new PgRepository(connectionString);

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535.');
}
const app = buildApp({ profileRepository:repository,logger: {
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
} });
app.addHook('onClose',async()=>{await repository.close();});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => {
      app.log.error({code:'CLOSE_FAILED'},'Server close failed.');
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
} catch {
  app.log.error({code:'LISTEN_FAILED'},'Server could not listen.');
  process.exitCode = 1;
}
