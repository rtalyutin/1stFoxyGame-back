import { PGlite } from '@electric-sql/pglite';
import { migrate } from './migrate.mjs';
import { createApp } from '../server/app.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertReleaseId, verifyRelease, safeRelative } from '../ops/artifacts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const releaseId = assertReleaseId(process.env.RELEASE_ID || `r3-dev-${Date.now()}`);
const releasesDir = resolve(process.env.DEV_RELEASES_DIR || join(root, '.local/releases'));
try { await verifyRelease(join(releasesDir, releaseId)); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), releaseId], { stdio: 'inherit', env: { ...process.env, BUILD_RELEASES_DIR: releasesDir } });
}
// Development-only persistent embedded PostgreSQL; production uses pg and external PostgreSQL.
const dataDir = resolve(process.env.DEV_DATABASE_DIR || join(root, '.local/database'));
await mkdir(dataDir, { recursive: true });
const db = new PGlite(dataDir);
const rawQuery = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1) || { rows: [] };
// PGlite has one PostgreSQL session. Retain the session for an entire write transaction,
// and queue unrelated reads instead of letting requests share an in-flight transaction.
let tail = Promise.resolve();
const acquire = async () => {
  const previous = tail; let release;
  const held = new Promise(resolveGate => { release = resolveGate; });
  tail = previous.then(() => held);
  await previous; return release;
};
const pool = {
  query: async (sql, params) => { const release = await acquire(); try { return await rawQuery(sql, params); } finally { release(); } },
  connect: async () => { const unlock = await acquire(); let released = false; return { query: rawQuery, release() { if (!released) { released = true; unlock(); } } }; },
};
await migrate(pool);
const app = await createApp({ pool, releasesDir, releaseId, publicPrefix: '/td', secureCookies: false });
app.get('/td/', async (_req, reply) => reply.type('text/html').send(await readFile(join(root, 'launcher/index.html'), 'utf8')));
app.get('/td/current.json', async () => ({ releaseId, clientEntry: 'web/index.html', manifestUrl: `/td/releases/${releaseId}/manifest.json` }));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg' };
const manifests = new Map();
app.get('/td/releases/:releaseId/*', async (req, reply) => {
  let id, name, manifest;
  try {
    id = assertReleaseId(req.params.releaseId); name = safeRelative(req.params['*']);
    if (!(name.startsWith('web/') || name === 'manifest.json')) return reply.code(404).send({ error: 'not found' });
    manifest = manifests.get(id) ?? await verifyRelease(join(releasesDir, id)); manifests.set(id, manifest);
    if (name !== 'manifest.json' && !manifest.files[name]) return reply.code(404).send({ error: 'not found' });
    return reply.type(mime[extname(name)] || 'application/octet-stream').send(await readFile(join(releasesDir, id, name)));
  } catch { return reply.code(404).send({ error: 'not found' }); }
});
app.addHook('onClose', () => db.close());
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close());
const port = Number(process.env.DEV_PORT || 4173);
await app.listen({ port, host: '127.0.0.1' });
console.log(`R3 development: http://127.0.0.1:${port}/td/ (persistent embedded PostgreSQL, not production)`);
