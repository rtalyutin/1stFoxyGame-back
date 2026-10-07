import Fastify from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { join } from 'node:path';
import { verifyRelease, acceptsClientRelease } from '../ops/artifacts.mjs';
import { readContent, canonicalJson } from '../db/content.mjs';
import { createGameStore } from '../db/game-store-r3.mjs';
import { runtimeForManifest, runtimeForRun, technicalManifest } from './game-versions.mjs';
import {
  idPattern, revisionSchema, integerSchema, requestIdSchema, runParams, versionsSchema, statisticsSchema,
  httpError, guestToken, tokenHash, operationHash, newRequestId, configuredOrigin, requestOrigin, isLoopback,
  createLimiter, decodeCursor, encodeCursor, errorMessages,
} from './http-support.mjs';

const releasePattern = '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$';
const pinQuery = { type: 'object', additionalProperties: false, required: ['clientReleaseId'], properties: { clientReleaseId: { type: 'string', pattern: releasePattern } } };
const noQuery = { type: 'object', additionalProperties: false, properties: {} };
const profileSettings = { type: 'object', additionalProperties: false, minProperties: 1, properties: {
  soundEnabled: { type: 'boolean' }, volume: { type: 'number', minimum: 0, maximum: 1 },
  quality: { type: 'string', enum: ['low','medium','high'] }, controlScheme: { type: 'string', enum: ['mouse_keyboard'] }, autoPause: { type: 'boolean' },
} };
const runBody = { type: 'object', additionalProperties: false, required: ['clientRunId','clientReleaseId','coreVersion','contentVersion','seed'], properties: {
  clientRunId: requestIdSchema, clientReleaseId: { type: 'string', pattern: releasePattern },
  coreVersion: { type: 'string', pattern: idPattern }, contentVersion: { type: 'string', pattern: idPattern },
  seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
} };
// Only storage-format bounds run before idempotency. Gameplay ranges are checked under the run lock.
const signedInteger = { type: 'integer', minimum: -2147483648, maximum: 2147483647 };
const unsignedInteger = { type: 'integer', minimum: 0, maximum: 4294967295 };
const resultStatistics = { ...statisticsSchema, properties: Object.fromEntries(['kills','builds','upgrades','goldEarned'].map(key => [key, signedInteger])) };
const checkpointBody = { type: 'object', additionalProperties: false, required: ['requestId','expectedRevision','snapshotSchemaVersion','snapshot'], properties: {
  requestId: requestIdSchema, expectedRevision: signedInteger, snapshotSchemaVersion: signedInteger, snapshot: { type: 'object' },
} };
const finishBody = { type: 'object', additionalProperties: false, required: ['requestId','expectedRevision','result'], properties: {
  requestId: requestIdSchema, expectedRevision: signedInteger,
  result: { type: 'object', additionalProperties: false, required: ['outcome','wave','lastCompletedWave','simTick','gold','throneHp','seed','versions','statistics'], properties: {
    outcome: { type: 'string', maxLength: 32 }, wave: signedInteger,
    lastCompletedWave: signedInteger, simTick: signedInteger, gold: signedInteger, throneHp: signedInteger,
    seed: unsignedInteger, versions: versionsSchema, statistics: resultStatistics,
  } },
} };

export async function createApp({ pool, releasesDir, releaseId, logger = false, publicPrefix = '', secureCookies = true,
  publicOrigin = process.env.PUBLIC_ORIGIN, rateLimits = {}, sessionTtlSeconds = 31536000 }) {
  const own = await verifyRelease(join(releasesDir, releaseId));
  const fixedOrigin = configuredOrigin(publicOrigin);
  if (!secureCookies && fixedOrigin && !isLoopback(new URL(fixedOrigin).hostname)) throw new Error('Insecure guest cookies are allowed only on loopback');
  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 3600 || sessionTtlSeconds > 31536000) throw new Error('Session TTL must be 3600..31536000 seconds');
  const store = createGameStore(pool);
  const limiter = createLimiter(rateLimits);
  const manifests = new Map([[own.releaseId, Promise.resolve(own)]]);
  const app = Fastify({
    logger: logger === true ? { redact: ['req.headers.cookie','req.headers.authorization','req.body','res.headers.set-cookie'] } : logger,
    bodyLimit: 270336, requestTimeout: 15000, forceCloseConnections: 'idle', trustProxy: ['127.0.0.1','::1'],
    genReqId: newRequestId, requestIdHeader: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
    ...(publicPrefix ? { rewriteUrl: req => req.url.startsWith(`${publicPrefix}/api/`) ? req.url.slice(publicPrefix.length) : req.url } : {}),
  });
  app.decorateRequest('ownerId', null);
  app.addHook('onRequest', async req => {
    if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      const origin = requestOrigin(req, fixedOrigin);
      if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw httpError('ORIGIN_REJECTED', 403);
      if (!secureCookies && !isLoopback(new URL(origin).hostname)) throw httpError('ORIGIN_REJECTED', 403);
    }
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (!reply.getHeader('Cache-Control')) reply.header('Cache-Control','no-store');
    reply.header('X-Content-Type-Options','nosniff').header('X-Request-Id', req.id);
    return payload;
  });
  app.setErrorHandler((err, req, reply) => {
    let status = err.statusCode && err.statusCode < 500 ? err.statusCode : 503;
    let code = err.validation ? 'INVALID_REQUEST' : errorMessages[err.code] ? err.code : status < 500 ? 'REQUEST_REJECTED' : 'SERVICE_UNAVAILABLE';
    if (err.validation) status = 400;
    if (status === 413) code = 'PAYLOAD_TOO_LARGE';
    if (status >= 500) app.log.error({ code: typeof err.code === 'string' ? err.code.slice(0, 40) : 'UNKNOWN', requestId: req.id }, 'Request failed');
    return reply.code(status).send({ error: { code, message: errorMessages[code], requestId: req.id,
      ...(Array.isArray(err.fieldErrors) ? { fieldErrors: err.fieldErrors.slice(0, 32).map(value => String(value).slice(0, 120)) } : {}),
    } });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: errorMessages.NOT_FOUND, requestId: req.id } }));
  const loadManifest = async id => {
    if (!manifests.has(id)) {
      if (manifests.size >= 256) manifests.delete([...manifests.keys()].find(key => key !== own.releaseId));
      const pending = verifyRelease(join(releasesDir, id)).catch(() => { manifests.delete(id); throw httpError('CLIENT_RELEASE_UNAVAILABLE', 409); });
      manifests.set(id, pending);
    }
    return manifests.get(id);
  };
  const pinned = async id => {
    const manifest = await loadManifest(id);
    const v = manifest.versions;
    if (!acceptsClientRelease(own, manifest) || !own.compatibleApi.includes(v.api) || !own.compatibleSaveFormats.includes(v.saveFormat) || !own.compatibleMetadataSchemas.includes(v.metadataSchema)) throw httpError('CLIENT_VERSION_UNSUPPORTED', 409);
    const content = await readContent(pool, v.content);
    if (!content || content.metadataSchemaVersion !== v.metadataSchema || !content.coreCompatibility.includes(v.core)) throw httpError('CONTENT_VERSION_UNAVAILABLE', 409);
    const runtime = runtimeForManifest(manifest);
    if (runtime) runtime.parseContent(content);
    else if (!technicalManifest(manifest)) throw httpError('CLIENT_VERSION_UNSUPPORTED', 409);
    return { manifest, content };
  };
  const quota = (req, reply, kind, key) => {
    const result = limiter(kind, key);
    if (!result.allowed) { reply.header('Retry-After', result.retryAfter); throw httpError('RATE_LIMITED', 429); }
  };
  const identify = async req => {
    const token = guestToken(req.headers.cookie);
    if (!token) return null;
    const session = await store.guestSession(tokenHash(token));
    return session?.profileId ?? null;
  };
  const authenticate = async (req, reply) => {
    req.ownerId = await identify(req);
    if (!req.ownerId) throw httpError('SESSION_REQUIRED', 401);
    quota(req, reply, ['POST','PATCH','PUT','DELETE'].includes(req.method) ? 'write' : 'read', req.ownerId);
  };
  const serveContent = async (req, reply, content) => {
    if (!content) throw httpError('NOT_FOUND', 404);
    const etag = `"sha256-${createHash('sha256').update(canonicalJson(content)).digest('hex')}"`;
    reply.header('Cache-Control', 'public, max-age=31536000, immutable').header('ETag', etag);
    return req.headers['if-none-match'] === etag ? reply.code(304).send() : content;
  };

  app.get('/api/v1/health', { schema: { querystring: noQuery } }, async () => ({ status: 'alive' }));
  app.get('/api/v1/version', async () => ({ releaseId: own.releaseId, versions: own.versions, pid: process.pid, stage: runtimeForManifest(own)?.stage ?? 'R0', compatibleClientReleases: own.compatibleClientReleases, compatibleSaveFormats: own.compatibleSaveFormats, compatibleMetadataSchemas: own.compatibleMetadataSchemas }));
  app.get('/api/v1/ready', async (_req, reply) => {
    try { await pool.query('SELECT 1'); await pinned(own.releaseId); return { ready: true, status: 'ready', releaseId: own.releaseId }; }
    catch { return reply.code(503).send({ ready: false, status: 'not_ready', releaseId: own.releaseId }); }
  });
  app.get('/api/v1/bootstrap', { schema: { querystring: pinQuery } }, async req => {
    const { manifest } = await pinned(req.query.clientReleaseId);
    const playable = Boolean(runtimeForManifest(manifest));
    const owner = playable ? await identify(req) : null;
    return { clientReleaseId: manifest.releaseId, apiReleaseId: own.releaseId, versions: manifest.versions,
      capabilities: { battle: playable, profiles: playable, cloudSaves: playable }, profile: owner ? await store.getProfile(owner) : null,
      contentUrl: `/td/api/v1/content?clientReleaseId=${encodeURIComponent(manifest.releaseId)}`,
    };
  });
  app.get('/api/v1/content', { schema: { querystring: pinQuery } }, async (req, reply) => serveContent(req, reply, (await pinned(req.query.clientReleaseId)).content));
  app.get('/api/v1/content/:version', { schema: { params: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'string', pattern: releasePattern } } }, querystring: noQuery } }, async (req, reply) => serveContent(req, reply, await readContent(pool, req.params.version)));

  app.post('/api/v1/guest-session', async (req, reply) => {
    quota(req, reply, 'guest', req.ip);
    if (!runtimeForManifest(own)) throw httpError('CLIENT_HAS_NO_BATTLE', 409);
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) throw httpError('INVALID_REQUEST', 400);
    const owner = await identify(req);
    if (owner) return { profileId: owner, profileRevision: (await store.getProfile(owner)).revision };
    const token = randomBytes(32).toString('base64url');
    const session = await store.createGuest(tokenHash(token), new Date(Date.now() + sessionTtlSeconds * 1000).toISOString());
    reply.header('Set-Cookie', `last_throne_guest=${token}; Path=/td; HttpOnly; ${secureCookies ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${sessionTtlSeconds}`);
    return reply.code(201).send({ profileId: session.profileId, profileRevision: (await store.getProfile(session.profileId)).revision });
  });
  app.get('/api/v1/profile', { preHandler: authenticate, schema: { querystring: noQuery } }, req => store.getProfile(req.ownerId));
  app.patch('/api/v1/profile', { preHandler: authenticate, schema: { body: { type: 'object', additionalProperties: false, required: ['expectedRevision','settings'], properties: { expectedRevision: revisionSchema, settings: profileSettings } } } }, req => store.patchProfile(req.ownerId, req.body.expectedRevision, req.body.settings));
  app.post('/api/v1/runs', { preHandler: authenticate, schema: { body: runBody } }, async (req, reply) => {
    const { manifest } = await pinned(req.body.clientReleaseId);
    if (!runtimeForManifest(manifest)) throw httpError('CLIENT_HAS_NO_BATTLE', 409);
    if (req.body.coreVersion !== manifest.versions.core || req.body.contentVersion !== manifest.versions.content) throw httpError('RUN_VERSION_MISMATCH', 409);
    const run = await store.createRun(req.ownerId, req.body, { clientReleaseId: manifest.releaseId, coreVersion: manifest.versions.core, contentVersion: manifest.versions.content, metadataSchemaVersion: manifest.versions.metadataSchema, snapshotSchemaVersion: manifest.versions.saveFormat });
    return reply.code(201).send(run);
  });
  app.get('/api/v1/runs', { preHandler: authenticate, schema: { querystring: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 512, pattern: '^[A-Za-z0-9_-]+$' } } } } }, async req => {
    const list = await store.listRuns(req.ownerId, decodeCursor(req.query.cursor));
    return { ...list, nextCursor: encodeCursor(list.nextCursor) };
  });
  app.get('/api/v1/runs/:id', { preHandler: authenticate, schema: { params: runParams, querystring: noQuery } }, req => store.getRun(req.ownerId, req.params.id));
  app.get('/api/v1/runs/:id/checkpoint', { preHandler: authenticate, schema: { params: runParams, querystring: noQuery } }, req => store.getCheckpoint(req.ownerId, req.params.id));
  app.put('/api/v1/runs/:id/checkpoint', { preHandler: authenticate, schema: { params: runParams, body: checkpointBody } }, req => store.commitCheckpoint(req.ownerId, req.params.id, req.body, operationHash('checkpoint', req.params.id, req.body), async (run, client) => {
    if (req.body.snapshotSchemaVersion !== run.snapshotSchemaVersion) throw httpError('VERSION_MISMATCH', 422);
    if (Buffer.byteLength(canonicalJson(req.body.snapshot)) > 262144) throw httpError('PAYLOAD_TOO_LARGE', 413);
    const runtime = runtimeForRun(run);
    if (!runtime) throw httpError('VERSION_MISMATCH', 422);
    const projection = await readContent(client, run.contentVersion);
    if (!projection || projection.metadataSchemaVersion !== run.metadataSchemaVersion || !projection.coreCompatibility.includes(run.coreVersion)) throw httpError('CONTENT_VERSION_UNAVAILABLE', 409);
    const checked = runtime.validateSnapshot(req.body.snapshot, runtime.parseContent(projection), { core: run.coreVersion, content: run.contentVersion, metadataSchema: run.metadataSchemaVersion });
    if (!checked.valid || !checked.snapshot) throw httpError('SNAPSHOT_INVALID', 422, checked.errors);
    if (checked.snapshot.seed !== run.seed) throw httpError('SNAPSHOT_SEED_MISMATCH', 422);
    return checked.snapshot;
  }));
  app.post('/api/v1/runs/:id/finish', { preHandler: authenticate, schema: { params: runParams, body: finishBody } }, req => store.finishRun(req.ownerId, req.params.id, req.body, operationHash('finish', req.params.id, req.body)));
  return app;
}

export const apiRequestSchemas = { pinQuery, profileSettings, runBody, checkpointBody, finishBody, runParams, noQuery };
