import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { Supervisor, requestJson } from '../ops/supervisor.mjs';
import { verifyRelease, assertCompatibility, safeRelative } from '../ops/artifacts.mjs';
import { controlRequest } from '../ops/cli.mjs';
import { installRelease } from '../ops/install-release.mjs';
import { publishR0Content } from '../ops/publish-r0-content.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const serverSource = `import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const id=process.env.RELEASE_ID;
const record=path.join(process.env.RELEASES_DIR,'..','writes.json');
const held=new Set();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/v1/ready'){ const bad=id==='bad-ready';res.statusCode=bad?503:200;res.end(JSON.stringify({ready:!bad})); }
 else if(req.url.startsWith('/api/v1/bootstrap?')){const client=new URL(req.url,'http://local').searchParams.get('clientReleaseId');if(client==='bad-content'){res.statusCode=409;res.end(JSON.stringify({error:'unpublished'}));return;}const manifest=JSON.parse(await readFile(path.join(process.env.RELEASES_DIR,client,'manifest.json'),'utf8'));res.end(JSON.stringify({clientReleaseId:client,apiReleaseId:id,versions:manifest.versions}));}
 else if(req.url==='/api/v1/truncated'){res.writeHead(200,{'Content-Length':100});res.write('{');setTimeout(()=>res.socket.destroy(),30);}
 else if(req.url==='/api/v1/slow'){held.add(res);res.once('close',()=>held.delete(res));}
 else if(req.url==='/api/v1/slow-state')res.end(JSON.stringify({held:held.size}));
 else if(req.url==='/api/v1/release-slow'){const count=held.size;for(const pending of held)pending.end(JSON.stringify({releaseId:id}));held.clear();res.end(JSON.stringify({released:count}));}
 else if(req.url==='/api/v1/write'){let rows=[];try{rows=JSON.parse(await readFile(record,'utf8'));}catch{} rows.push(id);await writeFile(record,JSON.stringify(rows));res.end(JSON.stringify(rows));}
 else if(req.url==='/api/v1/writes'){let rows=[];try{rows=JSON.parse(await readFile(record,'utf8'));}catch{}res.end(JSON.stringify(rows));}
 else res.end(JSON.stringify({releaseId:id}));
});
server.listen(Number(process.env.PORT),'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
`;
async function fixture(root, id, options = {}) {
  const directory = path.join(root, id); await mkdir(path.join(directory, 'server'), { recursive: true });
  await mkdir(path.join(directory, 'web')); await mkdir(path.join(directory, 'scripts'));
  const files = { 'server/index.mjs': serverSource, 'web/index.html': `<title>${id}</title>`, 'scripts/migrate.mjs': options.migrationFail ? 'process.exit(1);' : 'process.exit(0);' };
  for (const [file, data] of Object.entries(files)) await writeFile(path.join(directory, file), data);
  const manifest = { releaseId: id, sourceHash: hash(serverSource), runtimeMajor: 24, clientEntry: 'web/index.html', serverEntry: 'server/index.mjs', migrationEntry: 'scripts/migrate.mjs', versions: { frontend: id, backend: options.backendVersion ?? id, core: 'r0-core-1', content: options.contentVersion ?? 'r0-content-1', metadataSchema: 'r0-meta-1', saveFormat: 1, api: 1 }, compatibleApi: [1], compatibleSaveFormats: [1], compatibleMetadataSchemas: ['r0-meta-1'], compatibleClientReleases: ['*'], rollbackMode: options.rollbackMode ?? 'pair', files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest)); return { directory, manifest };
}
async function environment(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'last-throne-delivery-'));
  const releasesDir = path.join(root, 'releases'); const stateDir = path.join(root, 'state'); const launcherDir = path.join(root, 'launcher');
  await mkdir(releasesDir); await mkdir(launcherDir); await writeFile(path.join(launcherDir, 'index.html'), '<title>Launcher</title>');
  const ports = [await freePort(), await freePort()];
  let runtime = new Supervisor({ releasesDir, stateDir, launcherDir, port: 0, childPorts: ports, readinessMs: 1500, drainMs: 2000, controlEnabled: false, ...options });
  t.after(async () => { await runtime.close({ force: true }); });
  await runtime.start();
  return { root, releasesDir, stateDir, runtime, restart: async () => { await runtime.close({ force: true }); runtime = new Supervisor({ releasesDir, stateDir, launcherDir, port: 0, childPorts: ports, readinessMs: 1500, drainMs: 2000, controlEnabled: false }); await runtime.start(); return runtime; } };
}
async function until(predicate, ms = 4000) { const end = Date.now() + ms; while (!(await predicate()) && Date.now() < end) await wait(10); assert.ok(await predicate(), 'timed out waiting for state'); }

test('full artifact inventory rejects tamper, traversal and symlinks; install cannot replace immutable ID', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'last-throne-artifacts-'));
  const source = path.join(root, 'source'); await mkdir(source);
  const f = await fixture(source, 'r0.1');
  const spaceFile = 'web/asset with spaces.js'; const spaceData = 'export const value = 1;';
  await writeFile(path.join(f.directory, spaceFile), spaceData); f.manifest.files[spaceFile] = hash(spaceData);
  await writeFile(path.join(f.directory, 'manifest.json'), JSON.stringify(f.manifest));
  assert.throws(() => safeRelative('../secret'), /Unsafe/); assert.throws(() => safeRelative('/etc/passwd'), /Unsafe/);
  assert.equal((await verifyRelease(f.directory)).releaseId, 'r0.1');
  const installed = await installRelease(f.directory, path.join(root, 'installed'));
  assert.equal((await verifyRelease(installed.directory)).releaseId, 'r0.1');
  await assert.rejects(installRelease(f.directory, path.join(root, 'installed')), /already installed/);
  await writeFile(path.join(f.directory, 'web/index.html'), 'changed');
  await assert.rejects(verifyRelease(f.directory), /Hash mismatch/);
  await writeFile(path.join(f.directory, 'web/index.html'), '<title>r0.1</title>');
  await symlink('/etc/passwd', path.join(f.directory, 'web/link'));
  await assert.rejects(verifyRelease(f.directory), /Symlink forbidden/);
  const bad = structuredClone(f.manifest); bad.compatibleClientReleases = [];
  assert.throws(() => assertCompatibility(bad, [f.manifest]), /incompatible/);
  const r1 = structuredClone(f.manifest); r1.versions.core = 'r1-core-1';
  assert.throws(() => assertCompatibility(f.manifest, [r1]), /incompatible/);
});

test('live A/B promotion drains an old request, pins old assets, preserves gateway PID and pair rollback writes', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await fixture(e.releasesDir, 'r0-b');
  await r.operate('update', 'r0-a');
  const a = r.info().api; const gateway = r.info().gatewayPid;
  const slow = requestJson(r.port, '/td/api/v1/slow', 30_000);
  try {
    await until(async () => (await requestJson(a.port, '/api/v1/slow-state')).held === 1);
    const update = r.operate('update', 'r0-b');
    await until(() => r.routing?.id === 'r0-b');
    assert.equal(r.children.get('r0-a').active, 1, 'old request remains in flight while new requests route B');
    const responses = await Promise.all(Array.from({ length: 30 }, () => requestJson(r.port, '/td/api/v1/version')));
    assert.ok(responses.every(x => x.releaseId === 'r0-b'));
    await requestJson(a.port, '/api/v1/release-slow');
    assert.equal((await slow).releaseId, 'r0-a');
    const result = await update; assert.equal(result.drained, true);
  } finally {
    await requestJson(a.port, '/api/v1/release-slow').catch(() => {});
    await slow.catch(() => {});
  }
  assert.equal(r.info().gatewayPid, gateway); assert.notEqual(r.info().api.pid, a.pid);
  assert.ok(r.children.get('r0-a').exited);
  const pointer = JSON.parse(await readFile(path.join(e.stateDir, 'current.json'), 'utf8')); assert.equal(pointer.releaseId, 'r0-b');
  const old = await fetch(`http://127.0.0.1:${r.port}/td/releases/r0-a/web/index.html`); assert.equal(old.status, 200); assert.match(old.headers.get('cache-control'), /immutable/);
  const privateCode = await fetch(`http://127.0.0.1:${r.port}/td/releases/r0-a/server/index.mjs`); assert.equal(privateCode.status, 404);
  const publicDeploy = await fetch(`http://127.0.0.1:${r.port}/td/deploy`, { method: 'POST' }); assert.equal(publicDeploy.status, 404);
  await requestJson(r.port, '/td/api/v1/write'); await r.operate('rollback', 'r0-a');
  assert.equal((await requestJson(r.port, '/td/api/v1/version')).releaseId, 'r0-a');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/writes'), ['r0-b']);
});

test('hash, migration and readiness failures preserve the previous API and pointer', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
  const bad = await fixture(e.releasesDir, 'bad-hash'); await writeFile(path.join(bad.directory, 'web/index.html'), 'tampered');
  await assert.rejects(r.operate('update', 'bad-hash'), /Hash mismatch/);
  // A corrupted uploaded directory is removed from retained releases by an operator, never selected.
  const { rename } = await import('node:fs/promises'); await rename(bad.directory, path.join(e.releasesDir, '.rejected-hash'));
  await fixture(e.releasesDir, 'bad-migration', { migrationFail: true });
  await assert.rejects(r.operate('update', 'bad-migration'), /Migration failed/);
  await fixture(e.releasesDir, 'bad-ready');
  await assert.rejects(r.operate('update', 'bad-ready'), /failed readiness/);
  assert.equal((await requestJson(r.port, '/td/api/v1/version')).releaseId, 'r0-a');
  assert.equal(JSON.parse(await readFile(path.join(e.stateDir, 'current.json'), 'utf8')).releaseId, 'r0-a');
});

test('exclusive operator lock blocks concurrent promotion and frontend-only rollback keeps the new API', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
  await fixture(e.releasesDir, 'r0-b', { rollbackMode: 'frontend_only' });
  let blockedResolve; const blocked = new Promise(resolve => blockedResolve = resolve);
  let releaseResolve; const release = new Promise(resolve => releaseResolve = resolve);
  r.hooks.afterPhase = async phase => { if (phase === 'verified') { blockedResolve(); await release; } };
  const first = r.operate('update', 'r0-b'); await blocked;
  await assert.rejects(r.operate('update', 'r0-a'), /already running/);
  releaseResolve(); await first; r.hooks = {};
  const apiPid = r.info().api.pid; await requestJson(r.port, '/td/api/v1/write');
  await r.operate('rollback', 'r0-a');
  assert.equal(r.info().api.pid, apiPid); assert.equal(r.selection.apiReleaseId, 'r0-b'); assert.equal(r.selection.clientReleaseId, 'r0-a');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/writes'), ['r0-b']);
});

for (const crashPhase of ['verified', 'api_committed', 'client_committed', 'pointer_published']) {
  test(`recovery reads durable intent after interruption at ${crashPhase}`, async t => {
    const e = await environment(t); const r = e.runtime;
    await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a'); await fixture(e.releasesDir, 'r0-b');
    r.hooks.afterPhase = phase => { if (phase === crashPhase) throw new Error('injected interruption'); };
    await assert.rejects(r.operate('update', 'r0-b'), /injected interruption/);
    const recovered = await e.restart();
    const expected = crashPhase === 'verified' ? 'r0-a' : 'r0-b';
    assert.equal((await requestJson(recovered.port, '/td/api/v1/version')).releaseId, expected);
    assert.equal(JSON.parse(await readFile(path.join(e.stateDir, 'current.json'), 'utf8')).releaseId, expected);
    assert.equal(recovered.selection.clientReleaseId, expected);
    assert.equal((await readdir(e.stateDir)).includes('deployment.lock'), false);
  });
}

test('supervisor restarts a crashed active child from its immutable release', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
  const previous = r.routing.child.pid; r.routing.child.kill('SIGKILL');
  await until(() => r.routing?.id === 'r0-a' && r.routing.child.pid !== previous);
  assert.equal((await requestJson(r.port, '/td/api/v1/version')).releaseId, 'r0-a');
});

test('content promotion preserves active API PID and old/new pinned content; rejects code changes and unpublished content', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
  const pid = r.info().api.pid;
  await fixture(e.releasesDir, 'r0-content', { backendVersion: 'r0-a', contentVersion: 'r0-content-2', migrationFail: true });
  await r.operate('content', 'r0-content');
  assert.equal(r.info().api.pid, pid); assert.equal(r.selection.apiReleaseId, 'r0-a'); assert.equal(r.selection.clientReleaseId, 'r0-content');
  const old = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r0-a');
  const fresh = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r0-content');
  assert.equal(old.versions.content, 'r0-content-1'); assert.equal(fresh.versions.content, 'r0-content-2');
  await fixture(e.releasesDir, 'r0-code-change');
  await assert.rejects(r.operate('content', 'r0-code-change'), /cannot change backend/);
  await fixture(e.releasesDir, 'bad-content', { backendVersion: 'r0-a' });
  await assert.rejects(r.operate('content', 'bad-content'), /HTTP 409/);
  assert.equal(r.info().api.pid, pid); assert.equal(r.selection.clientReleaseId, 'r0-content');
});

test('a partial committed operation blocks retries until live recovery reconciles routing and pointer', async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a'); await fixture(e.releasesDir, 'r0-b');
  r.hooks.afterPhase = phase => { if (phase === 'api_committed') throw new Error('interrupted'); };
  await assert.rejects(r.operate('update', 'r0-b'), /interrupted/); r.hooks = {};
  await assert.rejects(r.operate('update', 'r0-a'), /requires recover/);
  await assert.rejects(r.operate('update', 'r0-a'), /requires recover/);
  await r.recover();
  assert.equal((await requestJson(r.port, '/td/api/v1/version')).releaseId, 'r0-b');
  assert.equal(JSON.parse(await readFile(path.join(e.stateDir, 'current.json'), 'utf8')).releaseId, 'r0-b');
  assert.ok(r.children.get('r0-a').exited);
});

test('pending retirement preserves the old process and recover retires it after the request completes', async t => {
  const e = await environment(t, { drainMs: 80 }); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a'); await fixture(e.releasesDir, 'r0-b');
  const old = r.children.get('r0-a');
  const slow = requestJson(r.port, '/td/api/v1/slow', 30_000);
  try {
    await until(async () => (await requestJson(old.port, '/api/v1/slow-state')).held === 1);
    const result = await r.operate('update', 'r0-b'); assert.equal(result.drained, false);
    assert.equal(r.journal.phase, 'retirement_pending'); assert.equal(old.exited, false);
    assert.equal(old.active, 1, 'barrier still holds the request after drain timeout');
  } finally {
    await requestJson(old.port, '/api/v1/release-slow').catch(() => {});
    await slow.catch(() => {});
  }
  r.drainMs = 2000; await r.recover();
  assert.equal(r.children.get('r0-a').exited, true); assert.equal(r.journal.phase, 'recovered');
});

for (const command of ['content', 'rollback']) for (const phase of ['verified', 'ready', 'api_committed']) {
  test(`cold recovery honors the operation commit for ${command} interrupted at ${phase}`, async t => {
    const e = await environment(t); const r = e.runtime;
    await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
    await fixture(e.releasesDir, 'r0-b', { backendVersion: command === 'content' ? 'r0-a' : 'r0-b', rollbackMode: 'frontend_only' });
    if (command === 'rollback') await r.operate('update', 'r0-b');
    const before = structuredClone(r.selection);
    let snapshot;
    r.hooks.afterPhase = async observed => {
      if (observed !== phase) return;
      snapshot = Object.fromEntries(await Promise.all(['selection.json', 'current.json', 'journal.json'].map(async file => [file, JSON.parse(await readFile(path.join(e.stateDir, file), 'utf8'))])));
      throw new Error('captured abrupt-crash snapshot');
    };
    const target = command === 'content' ? 'r0-b' : 'r0-a';
    await assert.rejects(r.operate(command, target), /captured abrupt-crash/);
    const coldState = path.join(e.root, 'cold-state'); await mkdir(coldState);
    for (const [file, value] of Object.entries(snapshot)) await writeFile(path.join(coldState, file), JSON.stringify(value));
    // Reconstruct exact durable files at the crash boundary, before the live catch handler rewrites its journal.
    const cold = new Supervisor({ releasesDir: e.releasesDir, stateDir: coldState, launcherDir: r.launcherDir, port: 0, childPorts: [await freePort(), await freePort()], controlEnabled: false, readinessMs: 1500, drainMs: 2000 });
    t.after(() => cold.close({ force: true })); await cold.start();
    const expectedClient = phase === 'api_committed' ? target : before.clientReleaseId;
    assert.equal(cold.selection.apiReleaseId, before.apiReleaseId, 'API stays fixed for content/frontend-only operations');
    assert.equal(cold.selection.clientReleaseId, expectedClient);
    assert.equal(JSON.parse(await readFile(path.join(coldState, 'current.json'), 'utf8')).releaseId, expectedClient);
    assert.equal(snapshot['selection.json'].operationId === snapshot['journal.json'].operationId, phase === 'api_committed');
  });
}

test('operator commands use a private Unix socket when the host supports binding it', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'td-socket-'));
  const probe = http.createServer();
  try { await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(path.join(directory, 'probe.sock'), resolve); }); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Execution environment forbids Unix socket bind; production control integration requires target-host verification'); return; } throw error; }
  await new Promise(resolve => probe.close(resolve));
  const e = await environment(t, { controlEnabled: true });
  await fixture(e.releasesDir, 'r0-a');
  const result = await controlRequest(path.join(e.stateDir, 'control.sock'), 'update', 'r0-a');
  assert.equal(result.selection.apiReleaseId, 'r0-a');
  const status = await controlRequest(path.join(e.stateDir, 'control.sock'), 'status'); assert.equal(status.api.releaseId, 'r0-a');
});

test('a truncated upstream response immediately closes the client stream and leaves the gateway alive', { timeout: 2000 }, async t => {
  const e = await environment(t); const r = e.runtime;
  await fixture(e.releasesDir, 'r0-a'); await r.operate('update', 'r0-a');
  const started = Date.now();
  // No AbortSignal or client timeout: the gateway must terminate the broken stream itself.
  await assert.rejects(async () => {
    const response = await fetch(`http://127.0.0.1:${r.port}/td/api/v1/truncated`);
    await response.text();
  }, /terminated|fetch failed|socket/i);
  assert.ok(Date.now() - started < 500, 'client detects the upstream interruption promptly');
  assert.equal(r.routing.active, 0, 'one request is decremented once despite aborted/error/close events');
  assert.equal((await requestJson(r.port, '/td/api/v1/version')).releaseId, 'r0-a');
});

test('controlled live content publisher commits a new EAV version without changing the old published settings', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { migrate } = await import('../scripts/migrate.mjs');
  const { readContent, canonicalJson } = await import('../db/content.mjs');
  const db = new PGlite(); t.after(() => db.close());
  const query = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool); const before = await readContent(pool, 'r0-content-1');
  const result = await publishR0Content(pool, 'r0-content-2', 'Трон: технический каталог 2');
  assert.deepEqual(await readContent(pool, 'r0-content-1'), before);
  const after = await readContent(pool, 'r0-content-2');
  assert.equal(after.entities[0].parameters.title, 'Трон: технический каталог 2');
  assert.equal(after.entities[0].parameters.gameplay_available, false);
  assert.equal(result.projectionHash, hash(canonicalJson(after)));
  await assert.rejects(publishR0Content(pool, 'r0-content-2', 'duplicate'), /duplicate key/);
  assert.deepEqual(await readContent(pool, 'r0-content-2'), after);
});
