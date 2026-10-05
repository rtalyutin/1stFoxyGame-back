import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Supervisor, requestJson } from '../ops/supervisor.mjs';
import { acceptsClientRelease, assertCompatibility, verifyRelease } from '../ops/artifacts.mjs';
import { r1Manifest, r2Manifest, retainReady } from '../scripts/build.mjs';
import { publishR2Content } from '../ops/publish-r2-content.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
async function freePort() {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
// Delivery fixture only: persistent fixture record proves API retention, not gameplay validation.
const source = `import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
const acceptsClientRelease=${acceptsClientRelease.toString()};
const id=process.env.RELEASE_ID;const own=JSON.parse(await readFile(path.join(process.env.RELEASE_DIR,'manifest.json'),'utf8'));const stored=path.join(process.env.RELEASES_DIR,'..','qa-save3.json');
const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');
 if(req.url==='/api/v1/ready')return res.end(JSON.stringify({ready:true}));
 if(req.url==='/api/v1/version')return res.end(JSON.stringify({releaseId:id}));
 if(req.url.startsWith('/api/v1/bootstrap?')){const client=new URL(req.url,'http://local').searchParams.get('clientReleaseId');const m=JSON.parse(await readFile(path.join(process.env.RELEASES_DIR,client,'manifest.json'),'utf8'));const v=m.versions;if(!acceptsClientRelease(own,m)||!own.compatibleSaveFormats.includes(v.saveFormat)||!own.compatibleApi.includes(v.api)||!own.compatibleMetadataSchemas.includes(v.metadataSchema)){res.statusCode=409;return res.end('{}');}return res.end(JSON.stringify({clientReleaseId:client,apiReleaseId:id,versions:v}));}
 if(req.url==='/api/v1/qa-save3'){if(own.versions.saveFormat!==3){res.statusCode=409;return res.end('{}');}if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;await writeFile(stored,body);return res.end(body);}try{return res.end(await readFile(stored,'utf8'));}catch{res.statusCode=404;return res.end('{}');}}
 res.statusCode=404;res.end('{}');});server.listen(Number(process.env.PORT),'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
async function fixture(root, id, stage = 'R2', content = 'r2-content-1') {
  const directory = join(root, id); for (const sub of ['server', 'web', 'scripts']) await mkdir(join(directory, sub), { recursive: true });
  const files = { 'server/index.mjs': source, 'web/index.html': `<title>${id}</title>`, 'scripts/migrate.mjs': '// isolated delivery fixture' };
  for (const [file, data] of Object.entries(files)) await writeFile(join(directory, file), data);
  const inventory = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)]));
  const manifest = (stage === 'R2' ? r2Manifest : r1Manifest)(id, hash(source), hash('same frontend source'), hash(`same ${stage} API`), inventory, content);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); return manifest;
}
async function runtime(t) {
  const root = await mkdtemp(join(tmpdir(), 'td-r2-delivery-')); const releasesDir = join(root, 'releases'); const launcherDir = join(root, 'launcher');
  await mkdir(releasesDir); await mkdir(launcherDir); await writeFile(join(launcherDir, 'index.html'), '<title>TD launcher</title>');
  const supervisor = new Supervisor({ releasesDir, stateDir: join(root, 'state'), launcherDir, port: 0, childPorts: [await freePort(), await freePort()], readinessMs: 3000, drainMs: 2000, controlEnabled: false });
  t.after(() => supervisor.close({ force: true })); await supervisor.start(); return { root, releasesDir, supervisor };
}

test('R2 fixed family allows retained R1 and future R2 balance pins and refuses reverse or unknown compatibility', () => {
  const args = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), {}];
  const api = r2Manifest('r2-001', ...args); const r1 = r1Manifest('r1-002', ...args);
  const future = r2Manifest('r2-content-002', ...args, 'r2-content-2');
  assert.doesNotThrow(() => assertCompatibility(api, [r1, future]));
  assert.equal(acceptsClientRelease(r1, future), false); assert.throws(() => assertCompatibility(r1, [future]), /incompatible/);
  for (const [key, value] of [['core', 'r2-core-2'], ['content', 'r3-content-1'], ['metadataSchema', 'r2-meta-2'], ['saveFormat', 4], ['api', 2]]) {
    const invalid = structuredClone(future); invalid.versions[key] = value;
    assert.equal(acceptsClientRelease(api, invalid), false); assert.throws(() => assertCompatibility(api, [invalid]), /incompatible/);
  }
  const r3 = structuredClone(future); r3.releaseId = 'r3-001'; assert.equal(acceptsClientRelease(api, r3), false);
  assert.throws(() => r2Manifest('r1-forged', ...args), /R2/);
  assert.throws(() => r2Manifest('r2-forged', ...args, 'r1-content-1'), /r2-content/);
});

test('R2 builder retains both exact ready R0 and R1 artifacts without regenerating or modifying their files', async () => {
  const root = new URL('../', import.meta.url).pathname; const ids = ['r0-002', 'r1-002'];
  const before = await Promise.all(ids.map(id => verifyRelease(join(root, 'releases', id))));
  const destination = await mkdtemp(join(tmpdir(), 'td-r2-archive-'));
  await retainReady(root, destination); await retainReady(root, destination);
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(await verifyRelease(join(destination, ids[i])), before[i]);
    assert.deepEqual(await verifyRelease(join(root, 'releases', ids[i])), before[i]);
  }
});

test('R2 requires the new runtime verifier and rejects tampered artifacts and arbitrary family patterns', async () => {
  const releases = await mkdtemp(join(tmpdir(), 'td-r2-verify-')); const manifest = await fixture(releases, 'r2-verify');
  const directory = join(releases, manifest.releaseId); assert.deepEqual(await verifyRelease(directory), manifest);
  const archivedVerifier = await import('../releases/r1-002/ops/artifacts.mjs');
  await assert.rejects(archivedVerifier.verifyRelease(directory), /Invalid compatibility declaration/);
  await writeFile(join(directory, 'web/index.html'), 'altered'); await assert.rejects(verifyRelease(directory), /Hash mismatch/);
  await writeFile(join(directory, 'web/index.html'), '<title>r2-verify</title>');
  manifest.compatibleClientReleases = ['r2-.*']; await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyRelease(directory), /Invalid compatibility declaration/);
});

test('stable R2 gateway switches R1 to R2 API and frontend rollback keeps save3 fixture data and both pinned clients', async t => {
  const e = await runtime(t); const r = e.supervisor;
  await fixture(e.releasesDir, 'r1-proof', 'R1', 'r1-content-1'); await r.operate('update', 'r1-proof');
  const gatewayPid = r.info().gatewayPid; const oldApiPid = r.info().api.pid;
  await fixture(e.releasesDir, 'r2-proof');
  const reverse = await fetch(`http://127.0.0.1:${r.port}/td/api/v1/bootstrap?clientReleaseId=r2-proof`); assert.equal(reverse.status, 409);
  await r.operate('update', 'r2-proof');
  assert.equal(r.info().gatewayPid, gatewayPid); assert.notEqual(r.info().api.pid, oldApiPid);
  const before = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-proof');
  assert.equal(before.versions.core, 'r1-core-1'); assert.equal(before.versions.content, 'r1-content-1'); assert.equal(before.versions.saveFormat, 2);
  const record = { runId: 'fixture-r2-run', clientReleaseId: 'r2-proof', coreVersion: 'r2-core-1', contentVersion: 'r2-content-1', metadataSchemaVersion: 'r2-meta-1', snapshotSchemaVersion: 3, wave: 10 };
  const saved = await fetch(`http://127.0.0.1:${r.port}/td/api/v1/qa-save3`, { method: 'POST', body: JSON.stringify(record) }); assert.equal(saved.status, 200);
  const r2ApiPid = r.info().api.pid; await r.operate('rollback', 'r1-proof');
  assert.equal(r.info().gatewayPid, gatewayPid); assert.equal(r.info().api.pid, r2ApiPid);
  assert.equal(r.selection.apiReleaseId, 'r2-proof'); assert.equal(r.selection.clientReleaseId, 'r1-proof');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/qa-save3'), record);
  assert.equal((await requestJson(r.port, '/td/current.json')).releaseId, 'r1-proof');
  const oldClient = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-proof'); const newClient = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r2-proof');
  assert.deepEqual(oldClient.versions, before.versions); assert.equal(oldClient.apiReleaseId, 'r2-proof');
  assert.equal(newClient.versions.saveFormat, 3); assert.equal(newClient.versions.content, 'r2-content-1');
  assert.match(await (await fetch(`http://127.0.0.1:${r.port}/td/releases/r1-proof/web/index.html`)).text(), /r1-proof/);
  assert.match(await (await fetch(`http://127.0.0.1:${r.port}/td/releases/r2-proof/web/index.html`)).text(), /r2-proof/);
  await r.recover(); assert.equal(r.selection.apiReleaseId, 'r2-proof'); assert.equal(r.selection.clientReleaseId, 'r1-proof');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/qa-save3'), record);
});

test('R2 balance-only promotion keeps API PID, old run content and retained R1 client pins', async t => {
  const e = await runtime(t); const r = e.supervisor;
  await fixture(e.releasesDir, 'r1-proof', 'R1', 'r1-content-1'); await fixture(e.releasesDir, 'r2-proof'); await r.operate('update', 'r2-proof');
  const apiPid = r.info().api.pid; await fixture(e.releasesDir, 'r2-content-002', 'R2', 'r2-content-2');
  await r.operate('content', 'r2-content-002');
  assert.equal(r.info().api.pid, apiPid); assert.equal(r.selection.apiReleaseId, 'r2-proof'); assert.equal(r.selection.clientReleaseId, 'r2-content-002');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r2-proof')).versions.content, 'r2-content-1');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r2-content-002')).versions.content, 'r2-content-2');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r1-proof')).versions.saveFormat, 2);
});

test('R2 publisher compiles the complete scalar EAV projection and atomically rejects unknown spell handlers', async t => {
  const { PGlite } = await import('@electric-sql/pglite'); const { migrate } = await import('../scripts/migrate.mjs');
  const { readContent, canonicalJson } = await import('../db/content.mjs'); const { parseContentProjection } = await import('../core/content-r2.ts');
  const db = new PGlite(); t.after(() => db.close());
  const query = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) }; await migrate(pool);
  const old = await Promise.all(['r0-content-1', 'r1-content-1', 'r2-content-1'].map(version => readContent(pool, version)));
  const result = await publishR2Content(pool, 'r2-content-2', { updates: [{ type: 'game_config', code: 'r2', parameter: 'initial_gold', value: 700 }] });
  const after = await readContent(pool, 'r2-content-2'); assert.equal(parseContentProjection(after).initialGold, 700);
  assert.equal(hash(canonicalJson(after)), result.projectionHash);
  for (let i = 0; i < old.length; i++) assert.deepEqual(await readContent(pool, ['r0-content-1', 'r1-content-1', 'r2-content-1'][i]), old[i]);
  const definition = after.entities.find(entity => entity.type === 'spell_definition'); assert.ok(definition);
  await assert.rejects(publishR2Content(pool, 'r2-content-bad', { updates: [{ type: 'spell_definition', code: definition.parameters.code, parameter: 'behavior_id', value: 'untrusted_script' }] }), /CONTENT_SPELL/);
  assert.equal(await readContent(pool, 'r2-content-bad'), null);
  await assert.rejects(publishR2Content(pool, 'r2-content-typed', { updates: [{ type: 'game_config', code: 'r2', parameter: 'initial_gold', value: '700' }] }), /safe integers/);
  assert.equal(await readContent(pool, 'r2-content-typed'), null);
  await assert.rejects(publishR2Content(pool, 'r2-content-2', { updates: [{ type: 'game_config', code: 'r2', parameter: 'initial_gold', value: 750 }] }), /duplicate key/);
  assert.deepEqual(await readContent(pool, 'r2-content-2'), after);
});
