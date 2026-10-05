import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, open, unlink, chmod, readdir, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease, assertReleaseId, assertCompatibility, safeRelative } from './artifacts.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomicJson(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
  const directory = await open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export function requestJson(port, pathname, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname, timeout }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(new Error('Probe response too large')); });
      res.on('end', () => { try { if (res.statusCode !== 200) throw new Error(`Probe ${pathname}: HTTP ${res.statusCode}`); resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    });
    req.on('timeout', () => req.destroy(new Error('Probe timed out'))); req.on('error', reject);
  });
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }

export class Supervisor {
  constructor(options = {}) {
    this.releasesDir = path.resolve(options.releasesDir ?? process.env.RELEASES_DIR ?? '/releases');
    this.stateDir = path.resolve(options.stateDir ?? process.env.STATE_DIR ?? '/state');
    this.launcherDir = path.resolve(options.launcherDir ?? process.env.LAUNCHER_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../launcher'));
    this.port = options.port ?? Number(process.env.GATEWAY_PORT ?? 4100);
    this.childPorts = options.childPorts ?? [Number(process.env.API_PORT_A ?? 4101), Number(process.env.API_PORT_B ?? 4102)];
    this.databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    this.migrationUrl = options.migrationUrl ?? process.env.DATABASE_MIGRATION_URL ?? this.databaseUrl;
    this.readinessMs = options.readinessMs ?? 20_000;
    this.drainMs = options.drainMs ?? 30_000;
    this.hooks = options.hooks ?? {};
    // Constructor-only harness option; production CLI cannot disable the private control socket.
    this.controlEnabled = options.controlEnabled ?? true;
    this.children = new Map(); this.manifests = new Map(); this.routing = null; this.selection = null;
    this.instance = randomUUID(); this.busy = false; this.stopping = false;
  }
  state(name) { return path.join(this.stateDir, name); }
  release(id) { return path.join(this.releasesDir, assertReleaseId(id)); }
  async phase(name, operation) {
    this.journal = { ...operation, phase: name, updatedAt: new Date().toISOString() };
    await atomicJson(this.state('journal.json'), this.journal);
    await this.hooks.afterPhase?.(name, this.journal);
  }
  async lock() {
    if (this.busy) throw new Error('Deployment operation already running');
    this.busy = true;
    try {
      this.lockHandle = await open(this.state('deployment.lock'), 'wx', 0o600);
      await this.lockHandle.writeFile(JSON.stringify({ pid: process.pid, instance: this.instance }));
      await this.lockHandle.sync();
    } catch (error) { this.busy = false; throw new Error(`Deployment lock unavailable: ${error.message}`); }
  }
  async unlock() {
    await this.lockHandle?.close(); this.lockHandle = null;
    await unlink(this.state('deployment.lock')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    this.busy = false;
  }
  async clearStaleLock() {
    const owner = await readJson(this.state('deployment.lock'));
    if (!owner) return;
    let alive = owner.pid !== process.pid;
    if (alive) { try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; } }
    if (alive) throw new Error(`Another deployment process owns the lock (PID ${owner.pid})`);
    await unlink(this.state('deployment.lock'));
  }
  async loadManifest(id) {
    const manifest = await verifyRelease(this.release(id));
    this.manifests.set(id, manifest); return manifest;
  }
  async retainedManifests() {
    const manifests = [];
    for (const entry of await readdir(this.releasesDir, { withFileTypes: true })) {
      // Upload complete releases by atomic directory rename; .incoming is never selected.
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unexpected releases entry: ${entry.name}`);
      manifests.push(await this.loadManifest(entry.name));
    }
    return manifests;
  }
  async migrate(manifest) {
    const child = spawn(process.execPath, [path.join(this.release(manifest.releaseId), manifest.migrationEntry)], {
      cwd: this.release(manifest.releaseId), env: { ...process.env, DATABASE_URL: this.migrationUrl, RELEASE_DIR: this.release(manifest.releaseId), RELEASES_DIR: this.releasesDir, RELEASE_ID: manifest.releaseId }, stdio: ['ignore', 'inherit', 'inherit']
    });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Migration failed (${code ?? signal})`))); });
  }
  async startChild(id) {
    const existing = this.children.get(id); if (existing && !existing.exited) return existing;
    const manifest = this.manifests.get(id) ?? await this.loadManifest(id);
    const used = new Set([...this.children.values()].filter(x => !x.exited).map(x => x.port));
    const port = this.childPorts.find(x => !used.has(x));
    if (!port) throw new Error('Both API slots occupied; previous process has not drained');
    const childEnv = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: this.databaseUrl, RELEASE_DIR: this.release(id), RELEASES_DIR: this.releasesDir, RELEASE_ID: id };
    delete childEnv.DATABASE_MIGRATION_URL;
    const child = spawn(process.execPath, [path.join(this.release(id), manifest.serverEntry)], {
      cwd: this.release(id), env: childEnv, stdio: ['ignore', 'inherit', 'inherit']
    });
    const slot = { id, port, child, active: 0, exited: false, retiring: false };
    this.children.set(id, slot);
    child.once('error', error => { slot.error = error.message; });
    child.once('exit', (code, signal) => {
      slot.exited = true; slot.exit = code ?? signal;
      if (this.routing === slot) this.routing = null;
      if (!this.stopping && !slot.retiring && this.selection?.apiReleaseId === id) {
        setTimeout(() => this.restartActive(id).catch(error => console.error('Active API restart failed:', error.message)), 300).unref();
      }
    });
    const deadline = Date.now() + this.readinessMs;
    while (Date.now() < deadline) {
      if (slot.exited || slot.error) break;
      try {
        const ready = await requestJson(port, '/api/v1/ready', 800);
        const version = await requestJson(port, '/api/v1/version', 800);
        if (ready.ready !== true || version.releaseId !== id) throw new Error('Readiness/version identity mismatch');
        return slot;
      } catch { await pause(80); }
    }
    slot.retiring = true; await this.stopChild(slot, 2000);
    throw new Error(`API ${id} failed readiness${slot.error ? ': ' + slot.error : ''}`);
  }
  async restartActive(id) {
    if (this.stopping || this.selection?.apiReleaseId !== id) return;
    try { const child = await this.startChild(id); if (this.selection?.apiReleaseId === id) this.routing = child; }
    catch (error) { console.error(error.message); if (!this.stopping) setTimeout(() => this.restartActive(id).catch(() => {}), 1000).unref(); }
  }
  async stopChild(slot, timeout = this.drainMs) {
    if (slot.exited) return true;
    slot.retiring = true; slot.child.kill('SIGTERM');
    const until = Date.now() + timeout;
    while (!slot.exited && Date.now() < until) await pause(25);
    // No SIGKILL during normal update: retain occupied slot if graceful shutdown is incomplete.
    return slot.exited;
  }
  async retire(slot) {
    if (!slot || slot === this.routing || slot.exited) return true;
    const until = Date.now() + this.drainMs;
    while (slot.active > 0 && Date.now() < until) await pause(20);
    if (slot === this.routing || slot.active > 0) return false;
    return this.stopChild(slot);
  }
  async publishPointer() {
    if (!this.selection?.clientReleaseId) return;
    const manifest = this.manifests.get(this.selection.clientReleaseId) ?? await this.loadManifest(this.selection.clientReleaseId);
    await atomicJson(this.state('current.json'), { releaseId: manifest.releaseId, clientEntry: manifest.clientEntry, manifestUrl: `/td/releases/${manifest.releaseId}/manifest.json`, versions: manifest.versions });
  }
  async saveSelection(selection) {
    await atomicJson(this.state('selection.json'), selection); this.selection = selection;
  }
  async probeBootstrap(port, prefix, apiId, clientId) {
    const pin = await requestJson(port, `${prefix}/bootstrap?clientReleaseId=${encodeURIComponent(clientId)}`);
    const manifest = this.manifests.get(clientId) ?? await this.loadManifest(clientId);
    if (pin.clientReleaseId !== clientId || pin.apiReleaseId !== apiId
      || Object.entries(manifest.versions).some(([name, version]) => pin.versions?.[name] !== version)) {
      throw new Error('Bootstrap pinned-version readback mismatch');
    }
    return pin;
  }
  async operate(command, releaseId) {
    if (!['update', 'rollback', 'content'].includes(command)) throw new Error('Unknown operation');
    if (this.journal?.phase === 'recovery_required') throw new Error('Previous operation requires recover before another update');
    assertReleaseId(releaseId); await this.lock();
    const before = this.selection;
    let candidate = null; let committed = false; let operation = null;
    try {
      const clients = await this.retainedManifests();
      const target = this.manifests.get(releaseId); if (!target) throw new Error('Release not found');
      const activeManifest = before?.apiReleaseId ? this.manifests.get(before.apiReleaseId) : null;
      const contentOnly = command === 'content';
      const frontOnly = contentOnly || (command === 'rollback' && activeManifest?.rollbackMode === 'frontend_only');
      if (contentOnly) {
        if (!activeManifest) throw new Error('Content promotion requires an active API');
        for (const name of ['backend', 'core', 'api', 'saveFormat']) {
          if (target.versions[name] !== activeManifest.versions[name]) throw new Error(`Content promotion cannot change ${name}`);
        }
      }
      if (command === 'rollback' && activeManifest?.rollbackMode === 'forward_only') throw new Error('Active release allows forward repair only');
      if (command === 'rollback' && !before?.apiReleaseId) throw new Error('No active release to roll back');
      const desiredApi = frontOnly ? activeManifest : target;
      assertCompatibility(desiredApi, clients);
      if (command === 'update' && target.rollbackMode === 'pair' && activeManifest) assertCompatibility(activeManifest, clients);
      operation = { operationId: randomUUID(), command, mode: contentOnly ? 'content' : frontOnly ? 'frontend_only' : 'pair', from: before, targetApi: desiredApi.releaseId, targetClient: releaseId };
      await this.phase('verified', operation);
      if (!frontOnly) { await this.migrate(target); await this.phase('migrated', operation); }
      candidate = frontOnly ? this.routing : await this.startChild(desiredApi.releaseId);
      if (!candidate) throw new Error('Active API unavailable');
      await this.probeBootstrap(candidate.port, '/api/v1', desiredApi.releaseId, releaseId);
      await this.phase('ready', operation);
      const old = this.routing;
      const transitional = { operationId: operation.operationId, apiReleaseId: desiredApi.releaseId, clientReleaseId: before?.clientReleaseId ?? releaseId, previous: before ? { apiReleaseId: before.apiReleaseId, clientReleaseId: before.clientReleaseId } : null };
      // Persist API intent before exposing new writes. Recovery never silently reverts a new API.
      await this.saveSelection(transitional); committed = true;
      await this.phase('api_committed', operation);
      this.routing = candidate;
      const publicVersion = await requestJson(this.port, '/td/api/v1/version');
      if (publicVersion.releaseId !== desiredApi.releaseId) throw new Error('Gateway readback mismatch');
      await this.probeBootstrap(this.port, '/td/api/v1', desiredApi.releaseId, releaseId);
      await this.phase('api_routed', operation);
      await this.saveSelection({ ...transitional, clientReleaseId: releaseId });
      await this.phase('client_committed', operation);
      await this.publishPointer();
      await this.phase('pointer_published', operation);
      const drained = await this.retire(old);
      await this.phase(drained ? 'complete' : 'retirement_pending', operation);
      return { ...this.info(), operationId: operation.operationId, drained };
    } catch (error) {
      // A filesystem error can occur after rename but before the caller observes commit.
      const persisted = await readJson(this.state('selection.json')).catch(() => null);
      if (operation && persisted?.operationId === operation.operationId) { committed = true; this.selection = persisted; }
      if (!committed && candidate && candidate !== this.routing) await this.retire(candidate);
      const failure = { ...(this.journal ?? {}), phase: committed ? 'recovery_required' : 'failed', error: error.message, updatedAt: new Date().toISOString() };
      await atomicJson(this.state('journal.json'), failure); this.journal = failure;
      throw error;
    } finally { await this.unlock(); }
  }
  info() {
    return { gatewayPid: process.pid, selection: this.selection, journal: this.journal, api: this.routing ? { releaseId: this.routing.id, pid: this.routing.child.pid, port: this.routing.port } : null, children: [...this.children.values()].filter(x => !x.exited).map(x => ({ releaseId: x.id, pid: x.child.pid, port: x.port, activeRequests: x.active, retiring: x.retiring })) };
  }
  async recover() {
    const selected = await readJson(this.state('selection.json'));
    this.selection = selected; this.journal = await readJson(this.state('journal.json'));
    if (!selected) return;
    const clients = await this.retainedManifests();
    assertCompatibility(this.manifests.get(selected.apiReleaseId), clients);
    this.routing = await this.startChild(selected.apiReleaseId);
    const unfinished = this.journal && !['complete', 'failed', 'retirement_pending', 'recovered'].includes(this.journal.phase);
    const committedOperation = typeof selected.operationId === 'string' && selected.operationId === this.journal?.operationId;
    if (unfinished && committedOperation && this.journal.targetApi === selected.apiReleaseId) {
      const readback = await requestJson(this.port, '/td/api/v1/version');
      if (readback.releaseId !== selected.apiReleaseId) throw new Error('Recovery readback mismatch');
      await this.probeBootstrap(this.port, '/td/api/v1', selected.apiReleaseId, this.journal.targetClient);
      await this.saveSelection({ ...selected, clientReleaseId: this.journal.targetClient });
    }
    await this.publishPointer();
    let drained = true;
    for (const slot of this.children.values()) if (slot !== this.routing && !slot.exited) drained = (await this.retire(slot)) && drained;
    if (this.journal && this.journal.phase !== 'complete') await this.phase(drained ? 'recovered' : 'retirement_pending', { ...this.journal, recoverySelection: this.selection });
  }
  async serveFile(req, res, file, cache) {
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe static file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }
  proxy(req, res) {
    const slot = this.routing;
    if (!slot || slot.exited) return json(res, 503, { error: 'API_UNAVAILABLE' });
    slot.active++;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; slot.active--; } };
    // Preserve the public authority for the API's same-origin checks; the socket stays loopback.
    const headers = { ...req.headers };
    delete headers.connection;
    const upstream = http.request({ hostname: '127.0.0.1', port: slot.port, method: req.method, path: req.url.slice(3), headers, agent: false }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
      const interrupted = () => { finish(); res.destroy(); };
      response.on('end', finish);
      response.on('aborted', interrupted);
      response.on('error', interrupted);
      response.on('close', () => { if (!response.complete) interrupted(); else finish(); });
    });
    upstream.on('error', () => { finish(); if (!res.headersSent) json(res, 502, { error: 'UPSTREAM_UNAVAILABLE' }); else res.destroy(); });
    req.on('aborted', () => upstream.destroy()); res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  }
  async handle(req, res) {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (pathname.startsWith('/td/api/v1/')) return this.proxy(req, res);
      if (pathname === '/td') { res.writeHead(308, { Location: '/td/' }); return res.end(); }
      if (pathname === '/td/' || pathname === '/td/index.html') return await this.serveFile(req, res, path.join(this.launcherDir, 'index.html'), 'no-store');
      if (pathname === '/td/current.json') return await this.serveFile(req, res, this.state('current.json'), 'no-store');
      const match = /^\/td\/releases\/([^/]+)\/(.+)$/.exec(pathname);
      if (match) {
        const id = assertReleaseId(match[1]); const relative = safeRelative(decodeURIComponent(match[2]));
        if (!(relative === 'manifest.json' || relative === 'content.json' || relative.startsWith('web/'))) return json(res, 404, { error: 'NOT_FOUND' });
        const manifest = this.manifests.get(id) ?? await this.loadManifest(id);
        if (relative !== 'manifest.json' && !manifest.files[relative]) return json(res, 404, { error: 'NOT_FOUND' });
        return await this.serveFile(req, res, path.join(this.release(id), relative), 'public, max-age=31536000, immutable');
      }
      json(res, 404, { error: 'NOT_FOUND' });
    } catch (error) { if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 400, { error: 'RESOURCE_UNAVAILABLE' }); else res.destroy(); }
  }
  async administrative(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/status') return json(res, 200, this.info());
      if (req.method !== 'POST' || req.url !== '/operation') return json(res, 404, { error: 'NOT_FOUND' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('Command too large'); }
      const input = JSON.parse(body);
      if (input.command === 'recover') {
        await this.lock();
        try { await this.recover(); json(res, 200, this.info()); } finally { await this.unlock(); }
      } else json(res, 200, await this.operate(input.command, input.releaseId));
    } catch (error) { json(res, 409, { error: error.message, status: this.info() }); }
  }
  async start() {
    await mkdir(this.stateDir, { recursive: true }); await mkdir(this.releasesDir, { recursive: true });
    // Avoid unlinking a live peer's private socket.
    const socketPath = this.state('control.sock');
    try {
      await lstat(socketPath);
      const live = await new Promise(resolve => { const request = http.get({ socketPath, path: '/status', timeout: 500 }, res => { res.resume(); resolve(true); }); request.on('error', () => resolve(false)); request.on('timeout', () => { request.destroy(); resolve(true); }); });
      if (live) throw new Error('Supervisor already running'); await unlink(socketPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await this.clearStaleLock();
    this.gateway = http.createServer((req, res) => this.handle(req, res));
    await new Promise((resolve, reject) => { this.gateway.once('error', reject); this.gateway.listen(this.port, '0.0.0.0', resolve); });
    this.port = this.gateway.address().port;
    await this.recover();
    if (this.controlEnabled) {
      this.control = http.createServer((req, res) => this.administrative(req, res));
      await new Promise((resolve, reject) => { this.control.once('error', reject); this.control.listen(socketPath, resolve); });
      await chmod(socketPath, 0o600);
    }
    return this;
  }
  async close({ force = false } = {}) {
    this.stopping = true;
    await Promise.all([this.control, this.gateway].filter(Boolean).map(server => new Promise(resolve => server.close(resolve))));
    for (const slot of this.children.values()) {
      const stopped = await this.stopChild(slot, 2000);
      if (!stopped && force) { slot.child.kill('SIGKILL'); await pause(50); }
    }
    await unlink(this.state('control.sock')).catch(() => {});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const supervisor = new Supervisor();
  await supervisor.start();
  console.log(`Last Throne gateway listening on ${supervisor.port}`);
  let terminating = false;
  const shutdown = async () => { if (terminating) return; terminating = true; await supervisor.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
