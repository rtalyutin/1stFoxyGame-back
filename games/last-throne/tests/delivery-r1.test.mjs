import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Supervisor, requestJson } from '../ops/supervisor.mjs';
import { acceptsClientRelease, assertCompatibility, verifyRelease } from '../ops/artifacts.mjs';
import { r1Manifest, retainR0 } from '../scripts/build.mjs';
import { publishR1Content } from '../ops/publish-r1-content.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
async function freePort() { const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
const source = `import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
const id=process.env.RELEASE_ID;const own=JSON.parse(await readFile(path.join(process.env.RELEASE_DIR,'manifest.json'),'utf8'));const stored=path.join(process.env.RELEASES_DIR,'..','qa-guest-save.json');
const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');
 if(req.url==='/api/v1/ready')return res.end(JSON.stringify({ready:true}));
 if(req.url==='/api/v1/version')return res.end(JSON.stringify({releaseId:id}));
 if(req.url==='/api/v1/qa-host')return res.end(JSON.stringify({host:req.headers.host}));
 if(req.url.startsWith('/api/v1/bootstrap?')){const client=new URL(req.url,'http://local').searchParams.get('clientReleaseId');const m=JSON.parse(await readFile(path.join(process.env.RELEASES_DIR,client,'manifest.json'),'utf8'));if(!own.compatibleSaveFormats.includes(m.versions.saveFormat)){res.statusCode=409;return res.end('{}');}return res.end(JSON.stringify({clientReleaseId:client,apiReleaseId:id,versions:m.versions}));}
 if(req.url==='/api/v1/qa-session'){res.setHeader('Set-Cookie','qa_guest=one; Path=/td; HttpOnly; SameSite=Lax');return res.end(JSON.stringify({guest:'one'}));}
 if(req.url==='/api/v1/qa-guest-save'){if(own.versions.saveFormat!==2){res.statusCode=409;return res.end('{}');}if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;if(!req.headers.cookie?.includes('qa_guest=one')){res.statusCode=401;return res.end('{}');}await writeFile(stored,body);return res.end(body);}try{return res.end(await readFile(stored,'utf8'));}catch{res.statusCode=404;return res.end('{}');}}
 res.statusCode=404;res.end('{}');});server.listen(Number(process.env.PORT),'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
async function fixture(root, id, stage = 'R1', content = 'r1-content-1') {
  const directory = join(root, id); for (const sub of ['server', 'web', 'scripts']) await mkdir(join(directory, sub), { recursive: true });
  const files = { 'server/index.mjs': source, 'web/index.html': `<title>${id}</title>`, 'scripts/migrate.mjs': '// isolated delivery fixture' };
  for (const [file, data] of Object.entries(files)) await writeFile(join(directory, file), data);
  const inventory = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)]));
  const manifest = stage === 'R1' ? r1Manifest(id, hash(source), hash('same client source'), hash('same R1 API'), inventory, content) : {
    releaseId: id, sourceHash: hash(source), runtimeMajor: 24, clientEntry: 'web/index.html', serverEntry: 'server/index.mjs', migrationEntry: 'scripts/migrate.mjs', versions: { frontend: 'r0-web-1', backend: 'r0-api-1', core: 'r0-core-1', content: 'r0-content-1', metadataSchema: 'r0-meta-1', saveFormat: 1, api: 1 }, rollbackMode: 'pair', compatibleApi: [1], compatibleSaveFormats: [1], compatibleMetadataSchemas: ['r0-meta-1'], compatibleClientReleases: ['*'], files: inventory,
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); return manifest;
}
async function runtime(t) {
  const root = await mkdtemp(join(tmpdir(), 'td-r1-delivery-')); const releasesDir = join(root, 'releases'); const launcherDir = join(root, 'launcher');
  await mkdir(releasesDir); await mkdir(launcherDir); await writeFile(join(launcherDir, 'index.html'), '<title>TD launcher</title>');
  const supervisor = new Supervisor({ releasesDir, stateDir: join(root, 'state'), launcherDir, port: 0, childPorts: [await freePort(), await freePort()], readinessMs: 1500, drainMs: 2000, controlEnabled: false });
  t.after(() => supervisor.close({ force: true })); await supervisor.start(); return { root, releasesDir, supervisor };
}

test('R1 fixed client family accepts future balance launches and rejects unknown core/schema/save/API', () => {
  const api = r1Manifest('r1-001', 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), {});
  const future = r1Manifest('r1-content-002', 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), {}, 'r1-content-2');
  assert.equal(acceptsClientRelease(api, future), true); assert.doesNotThrow(() => assertCompatibility(api, [future]));
  for (const [key, value] of [['core', 'r1-core-2'], ['metadataSchema', 'r1-meta-2'], ['saveFormat', 3], ['api', 2]]) {
    const incompatible = structuredClone(future); incompatible.versions[key] = value;
    assert.equal(acceptsClientRelease(api, incompatible), false); assert.throws(() => assertCompatibility(api, [incompatible]), /incompatible/);
  }
  const r2 = structuredClone(future); r2.releaseId = 'r2-001'; assert.equal(acceptsClientRelease(api, r2), false);
  const r0Only = structuredClone(api); r0Only.compatibleClientReleases = ['*']; assert.equal(acceptsClientRelease(r0Only, future), false);
});

test('builder retains the exact archived R0 artifact with no modification or regeneration', async () => {
  const root = new URL('../', import.meta.url).pathname; const archived = await verifyRelease(join(root, 'releases/r0-002'));
  const destination = await mkdtemp(join(tmpdir(), 'td-r1-archive-'));
  await retainR0(root, destination); await retainR0(root, destination);
  assert.deepEqual(await verifyRelease(join(destination, 'r0-002')), archived);
  assert.deepEqual(await verifyRelease(join(root, 'releases/r0-002')), archived);
});

test('stable R1 supervisor switches R0 to R1 API fixtures and frontend rollback preserves new guest data and both client pins', async t => {
  const e = await runtime(t); const r = e.supervisor;
  const r0 = await fixture(e.releasesDir, 'r0-proof', 'R0'); await r.operate('update', 'r0-proof');
  const gatewayPid = r.info().gatewayPid; const oldPid = r.info().api.pid;
  const r1 = await fixture(e.releasesDir, 'r1-proof'); assert.throws(() => assertCompatibility(r0, [r1]), /incompatible/);
  await r.operate('update', 'r1-proof'); assert.equal(r.info().gatewayPid, gatewayPid); assert.notEqual(r.info().api.pid, oldPid);
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r0-proof')).versions.content, 'r0-content-1');
  const session = await fetch(`http://127.0.0.1:${r.port}/td/api/v1/qa-session`); const cookie = session.headers.get('set-cookie').split(';')[0];
  const written = { clientReleaseId: 'r1-proof', contentVersion: 'r1-content-1', snapshotSchemaVersion: 2, gold: 777 };
  const save = await fetch(`http://127.0.0.1:${r.port}/td/api/v1/qa-guest-save`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(written) }); assert.equal(save.status, 200);
  const newApiPid = r.info().api.pid; await r.operate('rollback', 'r0-proof');
  assert.equal(r.info().api.pid, newApiPid); assert.equal(r.selection.apiReleaseId, 'r1-proof'); assert.equal(r.selection.clientReleaseId, 'r0-proof');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/qa-guest-save'), written);
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r0-proof')).apiReleaseId, 'r1-proof');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-proof')).versions.saveFormat, 2);
  const host = await new Promise((resolve, reject) => { http.get({ hostname: '127.0.0.1', port: r.port, path: '/td/api/v1/qa-host', headers: { Host: 'games.example.test' } }, res => { let body='';res.on('data', chunk=>body+=chunk);res.on('end',()=>resolve(JSON.parse(body))); }).on('error', reject); });
  assert.equal(host.host, 'games.example.test');
});

test('R1 balance content promotion leaves API PID and old content pin intact', async t => {
  const e = await runtime(t); const r = e.supervisor;
  await fixture(e.releasesDir, 'r1-proof'); await r.operate('update', 'r1-proof'); const pid = r.info().api.pid;
  await fixture(e.releasesDir, 'r1-content-002', 'R1', 'r1-content-2'); await r.operate('content', 'r1-content-002');
  assert.equal(r.info().api.pid, pid); assert.equal(r.selection.apiReleaseId, 'r1-proof'); assert.equal(r.selection.clientReleaseId, 'r1-content-002');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-proof')).versions.content, 'r1-content-1');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-content-002')).versions.content, 'r1-content-2');
});

test('R1 balance publisher validates complete typed EAV projection and preserves both old catalogs', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { migrate } = await import('../scripts/migrate.mjs');
  const { readContent, canonicalJson } = await import('../db/content.mjs');
  const { parseContentProjection } = await import('../core/content-r1.ts');
  const db = new PGlite(); t.after(() => db.close());
  const query = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool); const oldR0 = await readContent(pool, 'r0-content-1'); const oldR1 = await readContent(pool, 'r1-content-1');
  const result = await publishR1Content(pool, 'r1-content-2', { updates: [
    { type: 'game_config', code: 'r1', parameter: 'initial_gold', value: 700 },
    { type: 'game_config', code: 'r1', parameter: 'map_scale', value: 0.02 },
  ] });
  const after = await readContent(pool, 'r1-content-2'); const compiled = parseContentProjection(after);
  assert.equal(compiled.initialGold, 700); assert.equal(compiled.map.scale, 0.02);
  assert.equal(hash(canonicalJson(after)), result.projectionHash);
  assert.deepEqual(await readContent(pool, 'r0-content-1'), oldR0); assert.deepEqual(await readContent(pool, 'r1-content-1'), oldR1);
  await assert.rejects(publishR1Content(pool, 'r1-content-2', { updates: [{ type: 'game_config', code: 'r1', parameter: 'initial_gold', value: 710 }] }), /duplicate key/);
  await assert.rejects(publishR1Content(pool, 'r1-content-bad', { updates: [{ type: 'wave_group', code: 'w1-l0', parameter: 'count', value: 201 }] }), /CONTENT_GROUP/);
  await assert.rejects(publishR1Content(pool, 'r1-content-typed', { updates: [{ type: 'game_config', code: 'r1', parameter: 'initial_gold', value: '700' }] }), /safe integers/);
  assert.equal(await readContent(pool, 'r1-content-bad'), null); assert.equal(await readContent(pool, 'r1-content-typed'), null);
  assert.deepEqual(await readContent(pool, 'r1-content-2'), after);
});
