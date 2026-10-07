import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Supervisor, requestJson } from '../releases/r2-001/ops/supervisor.mjs';
import { verifyRelease as archivedVerify } from '../releases/r2-001/ops/artifacts.mjs';
import { acceptsClientRelease, assertCompatibility, verifyRelease } from '../ops/artifacts.mjs';
import { r2Manifest, r3Manifest, retainReady } from '../scripts/build.mjs';
import { publishR3Content } from '../ops/publish-r3-content.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const args = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), {}];
async function freePort() {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
// The real archived R2 supervisor runs actual Node children. This fixture record
// checks API lifetime/data retention; gameplay/revision validation belongs to SQL/API tests.
const source = `import http from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
const acceptsClientRelease=${acceptsClientRelease.toString()};
const id=process.env.RELEASE_ID;const own=JSON.parse(await readFile(path.join(process.env.RELEASE_DIR,'manifest.json'),'utf8'));const stored=path.join(process.env.RELEASES_DIR,'..','qa-save4.json');
const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');
 if(req.url==='/api/v1/ready')return res.end(JSON.stringify({ready:true}));
 if(req.url==='/api/v1/version')return res.end(JSON.stringify({releaseId:id}));
 if(req.url.startsWith('/api/v1/bootstrap?')){const client=new URL(req.url,'http://local').searchParams.get('clientReleaseId');const m=JSON.parse(await readFile(path.join(process.env.RELEASES_DIR,client,'manifest.json'),'utf8'));const v=m.versions;if(!acceptsClientRelease(own,m)||!own.compatibleSaveFormats.includes(v.saveFormat)||!own.compatibleApi.includes(v.api)||!own.compatibleMetadataSchemas.includes(v.metadataSchema)){res.statusCode=409;return res.end('{}');}return res.end(JSON.stringify({clientReleaseId:client,apiReleaseId:id,versions:v}));}
 if(req.url==='/api/v1/qa-save4'){if(own.versions.saveFormat!==4){res.statusCode=409;return res.end('{}');}if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;await writeFile(stored,body);return res.end(body);}try{return res.end(await readFile(stored,'utf8'));}catch{res.statusCode=404;return res.end('{}');}}
 res.statusCode=404;res.end('{}');});server.listen(Number(process.env.PORT),'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
async function fixture(parent, id, { stage = 'R3', content = 'r3-content-1', clients = [] } = {}) {
  const directory = join(parent, id);
  for (const sub of ['server', 'web', 'scripts']) await mkdir(join(directory, sub), { recursive: true });
  const files = { 'server/index.mjs': source, 'web/index.html': `<title>${id}</title>`, 'scripts/migrate.mjs': '// delivery fixture only' };
  for (const [file, data] of Object.entries(files)) await writeFile(join(directory, file), data);
  const inventory = Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)]));
  const manifest = (stage === 'R3' ? r3Manifest : r2Manifest)(id, hash(source), hash('same web'), hash(`same ${stage} API`), inventory, content, clients);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); return manifest;
}
async function runtime(t) {
  const root = await mkdtemp(join(tmpdir(), 'td-r3-delivery-'));
  const releasesDir = join(root, 'releases'), launcherDir = join(root, 'launcher');
  await mkdir(releasesDir); await mkdir(launcherDir); await writeFile(join(launcherDir, 'index.html'), '<title>TD</title>');
  const supervisor = new Supervisor({ releasesDir, stateDir: join(root, 'state'), launcherDir, port: 0, childPorts: [await freePort(), await freePort()], readinessMs: 3000, drainMs: 2000, controlEnabled: false });
  t.after(async () => { await supervisor.close({ force: true }); await rm(root, { recursive: true, force: true }); });
  await supervisor.start(); return { root, releasesDir, supervisor };
}

test('R3 explicit client IDs accept the complete tuple and retain legacy API/save/metadata sets', () => {
  const api = r3Manifest('r3-001', ...args, 'r3-content-1', ['r3-content-002']);
  assert.deepEqual(api.compatibleSaveFormats, [1, 2, 3, 4]);
  assert.deepEqual(api.compatibleMetadataSchemas, ['r0-meta-1', 'r1-meta-1', 'r2-meta-1', 'r3-meta-1']);
  assert.deepEqual(api.compatibleClientReleases, ['*', 'r1-*', 'r2-*', 'r3-001', 'r3-content-002']);
  const future = r3Manifest('r3-content-002', ...args, 'r3-content-2', ['r3-001']);
  assert.doesNotThrow(() => assertCompatibility(api, [r2Manifest('r2-001', ...args), future]));
  const undeclared = { ...future, releaseId: 'r3-content-003' }; assert.equal(acceptsClientRelease(api, undeclared), false);
  for (const [key, value] of [['core', 'r3-core-2'], ['content', 'r2-content-1'], ['metadataSchema', 'r3-meta-2'], ['saveFormat', 3], ['api', 2]]) {
    const invalid = structuredClone(future); invalid.versions[key] = value;
    assert.equal(acceptsClientRelease(api, invalid), false); assert.throws(() => assertCompatibility(api, [invalid]), /incompatible/);
  }
  assert.throws(() => r3Manifest('r2-forged', ...args), /R3/);
  assert.throws(() => r3Manifest('r3-forged', ...args, 'r2-content-1'), /r3-content/);
  assert.throws(() => r3Manifest('r3-forged', ...args, 'r3-content-1', ['r3-*']), /releaseId/);
});

test('R3 builder preserves the three exact ready artifacts and archived R2 accepts the R3 manifest', async t => {
  const root = new URL('../', import.meta.url).pathname;
  const destination = await mkdtemp(join(tmpdir(), 'td-r3-archive-')); t.after(() => rm(destination, { recursive: true, force: true }));
  const ids = ['r0-002', 'r1-002', 'r2-001'];
  const manifestHashes = ['40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6', 'daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823', 'dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf'];
  const before = await Promise.all(ids.map(id => verifyRelease(join(root, 'releases', id))));
  await retainReady(root, destination); await retainReady(root, destination);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(hash(await readFile(join(root, 'releases', ids[i], 'manifest.json'))), manifestHashes[i]);
    assert.deepEqual(await verifyRelease(join(destination, ids[i])), before[i]);
    assert.deepEqual(await verifyRelease(join(root, 'releases', ids[i])), before[i]);
  }
  const oldMigrations = Object.keys(before[2].files).filter(name => /^db\/migrations\/00[1-6]_/.test(name));
  assert.equal(oldMigrations.length, 6);
  for (const name of oldMigrations) assert.equal(hash(await readFile(join(root, name))), before[2].files[name]);
  const manifest = await fixture(destination, 'r3-verifier');
  assert.deepEqual(await archivedVerify(join(destination, manifest.releaseId)), manifest);
  manifest.compatibleClientReleases.push('r3-*'); await writeFile(join(destination, manifest.releaseId, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(archivedVerify(join(destination, manifest.releaseId)), /Invalid compatibility declaration/);
  await assert.rejects(verifyRelease(join(destination, manifest.releaseId)), /Invalid compatibility declaration/);
});

test('unchanged archived R2 gateway upgrades A/B to R3 and frontend rollback retains save4 and both pinned clients', async t => {
  const e = await runtime(t), r = e.supervisor;
  await fixture(e.releasesDir, 'r2-proof', { stage: 'R2', content: 'r2-content-1' }); await r.operate('update', 'r2-proof');
  const gatewayPid = r.info().gatewayPid, aPid = r.info().api.pid;
  await fixture(e.releasesDir, 'r3-proof');
  assert.equal((await fetch(`http://127.0.0.1:${r.port}/td/api/v1/bootstrap?clientReleaseId=r3-proof`)).status, 409);
  await r.operate('update', 'r3-proof');
  assert.equal(r.info().gatewayPid, gatewayPid); assert.notEqual(r.info().api.pid, aPid);
  const before = await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r2-proof');
  assert.equal(before.versions.saveFormat, 3); assert.equal(before.versions.core, 'r2-core-1');
  const record = { runId: 'r3-fixture', clientReleaseId: 'r3-proof', coreVersion: 'r3-core-1', contentVersion: 'r3-content-1', metadataSchemaVersion: 'r3-meta-1', snapshotSchemaVersion: 4, heroItems: ['flame_orb'], expedition: 'camp', aegisToken: true };
  assert.equal((await fetch(`http://127.0.0.1:${r.port}/td/api/v1/qa-save4`, { method: 'POST', body: JSON.stringify(record) })).status, 200);
  const bPid = r.info().api.pid; await r.operate('rollback', 'r2-proof');
  assert.equal(r.info().gatewayPid, gatewayPid); assert.equal(r.info().api.pid, bPid);
  assert.equal(r.selection.apiReleaseId, 'r3-proof'); assert.equal(r.selection.clientReleaseId, 'r2-proof');
  assert.equal((await requestJson(r.port, '/td/current.json')).releaseId, 'r2-proof');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/qa-save4'), record);
  assert.deepEqual((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r2-proof')).versions, before.versions);
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r3-proof')).versions.saveFormat, 4);
  await r.recover(); assert.equal(r.selection.apiReleaseId, 'r3-proof'); assert.equal(r.selection.clientReleaseId, 'r2-proof');
  assert.deepEqual(await requestJson(r.port, '/td/api/v1/qa-save4'), record);
  await r.close({ force: true });
  const cold = new Supervisor({ releasesDir: e.releasesDir, stateDir: join(e.root, 'state'), launcherDir: join(e.root, 'launcher'), port: 0, childPorts: [await freePort(), await freePort()], readinessMs: 3000, controlEnabled: false });
  try {
    await cold.start();
    assert.equal(cold.selection.apiReleaseId, 'r3-proof'); assert.equal(cold.selection.clientReleaseId, 'r2-proof');
    assert.equal((await requestJson(cold.port, '/td/current.json')).releaseId, 'r2-proof');
    assert.deepEqual(await requestJson(cold.port, '/td/api/v1/qa-save4'), record);
    assert.equal((await requestJson(cold.port, '/td/api/v1/bootstrap?clientReleaseId=r3-proof')).versions.saveFormat, 4);
  } finally { await cold.close({ force: true }); }
});

test('archived R2 content promotion preserves API PID and old pins only for predeclared exact R3 IDs', async t => {
  const e = await runtime(t), r = e.supervisor;
  await fixture(e.releasesDir, 'r3-proof', { clients: ['r3-content-002'] }); await r.operate('update', 'r3-proof');
  const apiPid = r.info().api.pid;
  await fixture(e.releasesDir, 'r3-content-002', { content: 'r3-content-2', clients: ['r3-proof'] }); await r.operate('content', 'r3-content-002');
  assert.equal(r.info().api.pid, apiPid); assert.equal(r.selection.apiReleaseId, 'r3-proof');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r3-proof')).versions.content, 'r3-content-1');
  assert.equal((await requestJson(r.port, '/td/api/v1/bootstrap?clientReleaseId=r3-content-002')).versions.content, 'r3-content-2');
  await fixture(e.releasesDir, 'r3-unannounced', { content: 'r3-content-3', clients: ['r3-proof', 'r3-content-002'] });
  await assert.rejects(r.operate('content', 'r3-unannounced'), /incompatible/);
  assert.equal(r.info().api.pid, apiPid); assert.equal(r.selection.clientReleaseId, 'r3-content-002');
  assert.equal((await requestJson(r.port, '/td/current.json')).releaseId, 'r3-content-002');
});

test('archived R2 rejects an R3 bootstrap tuple mismatch or altered artifact before durable promotion', async t => {
  const e = await runtime(t), r = e.supervisor;
  await fixture(e.releasesDir, 'r2-proof', { stage: 'R2', content: 'r2-content-1' }); await r.operate('update', 'r2-proof');
  const apiPid = r.info().api.pid;
  const candidate = await fixture(e.releasesDir, 'r3-bad'); candidate.versions.core = 'r3-core-unsupported';
  await writeFile(join(e.releasesDir, candidate.releaseId, 'manifest.json'), JSON.stringify(candidate));
  await assert.rejects(r.operate('update', candidate.releaseId), /bootstrap|409/);
  assert.equal(r.info().api.pid, apiPid); assert.equal(r.selection.apiReleaseId, 'r2-proof');
  candidate.versions.core = 'r3-core-1'; await writeFile(join(e.releasesDir, candidate.releaseId, 'manifest.json'), JSON.stringify(candidate));
  await writeFile(join(e.releasesDir, candidate.releaseId, 'web/index.html'), 'tampered');
  await assert.rejects(r.operate('update', candidate.releaseId), /Hash mismatch/);
  assert.equal(r.info().api.pid, apiPid); assert.equal((await requestJson(r.port, '/td/current.json')).releaseId, 'r2-proof');
});

test('precommit R2 cold recovery blocks an incompatible visible R3 candidate and succeeds after evidence-based parking', async t => {
  const e = await runtime(t), r = e.supervisor;
  await fixture(e.releasesDir, 'r2-proof', { stage: 'R2', content: 'r2-content-1' }); await r.operate('update', 'r2-proof');
  await fixture(e.releasesDir, 'r3-uncommitted');
  // No operation selected or exposed R3. Simulate a cold process loss in this
  // precise install-before-update interval without changing any durable state.
  await r.close({ force: true });
  const stateDir = join(e.root, 'state');
  const selected = JSON.parse(await readFile(join(stateDir, 'selection.json'), 'utf8'));
  const journal = JSON.parse(await readFile(join(stateDir, 'journal.json'), 'utf8'));
  const current = JSON.parse(await readFile(join(stateDir, 'current.json'), 'utf8'));
  assert.equal(selected.apiReleaseId, 'r2-proof'); assert.equal(selected.clientReleaseId, 'r2-proof');
  assert.equal(current.releaseId, 'r2-proof'); assert.equal(journal.targetApi, 'r2-proof');
  const cold = new Supervisor({ releasesDir: e.releasesDir, stateDir, launcherDir: join(e.root, 'launcher'), port: 0, childPorts: [await freePort(), await freePort()], readinessMs: 3000, controlEnabled: false });
  t.after(() => cold.close({ force: true }));
  await assert.rejects(cold.start(), /incompatible/); assert.equal(cold.info().api, null);
  assert.equal((await verifyRelease(join(e.releasesDir, 'r3-uncommitted'))).releaseId, 'r3-uncommitted');
  await rename(join(e.releasesDir, 'r3-uncommitted'), join(e.root, 'parked-r3-uncommitted'));
  await cold.recover();
  assert.equal(cold.selection.apiReleaseId, 'r2-proof'); assert.equal(cold.selection.clientReleaseId, 'r2-proof');
  assert.equal((await requestJson(cold.port, '/td/api/v1/version')).releaseId, 'r2-proof');
});

test('R3 publisher compiles all 151 scalar EAV rows and rejects unknown item handlers or wrong scalar types atomically', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { migrate } = await import('../scripts/migrate.mjs');
  const { readContent, canonicalJson } = await import('../db/content.mjs');
  const { parseContentProjection } = await import('../core/content-r3.ts');
  const db = new PGlite(); t.after(() => db.close());
  const query = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1);
  const pool = { query, connect: async () => ({ query, release() {} }) }; await migrate(pool);
  const versions = ['r0-content-1', 'r1-content-1', 'r2-content-1', 'r3-content-1'];
  const old = await Promise.all(versions.map(version => readContent(pool, version)));
  assert.equal(old[3].entities.length, 151);
  assert.equal(hash(canonicalJson(old[3])), '6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5');
  const result = await publishR3Content(pool, 'r3-content-2', { updates: [{ type: 'game_config', code: 'r3', parameter: 'initial_gold', value: 700 }] });
  const after = await readContent(pool, 'r3-content-2');
  assert.equal(after.entities.length, 151); assert.equal(parseContentProjection(after).initialGold, 700);
  assert.equal(hash(canonicalJson(after)), result.projectionHash);
  for (let i = 0; i < old.length; i++) assert.deepEqual(await readContent(pool, versions[i]), old[i]);
  const item = after.entities.find(entity => entity.type === 'item_definition'); assert.ok(item);
  await assert.rejects(publishR3Content(pool, 'r3-content-bad', { updates: [{ type: 'item_definition', code: item.parameters.code, parameter: 'behavior_id', value: 'untrusted_script' }] }), /CONTENT_ITEM/);
  assert.equal(await readContent(pool, 'r3-content-bad'), null);
  await assert.rejects(publishR3Content(pool, 'r3-content-typed', { updates: [{ type: 'game_config', code: 'r3', parameter: 'initial_gold', value: '700' }] }), /safe integers/);
  assert.equal(await readContent(pool, 'r3-content-typed'), null);
  await assert.rejects(publishR3Content(pool, 'r3-content-2', { updates: [{ type: 'game_config', code: 'r3', parameter: 'initial_gold', value: 750 }] }), /duplicate key/);
  assert.deepEqual(await readContent(pool, 'r3-content-2'), after);
  await assert.rejects(publishR3Content(pool, 'r3-content-wrong-source', { updates: [{ type: 'game_config', code: 'r3', parameter: 'initial_gold', value: 700 }] }, 'r2-content-1'), /compatible R3 source/);
});
