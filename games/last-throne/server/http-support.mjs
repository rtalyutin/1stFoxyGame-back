import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../db/content.mjs';

export const idPattern = '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$';
export const uuidPattern = '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$';
export const revisionSchema = { type: 'integer', minimum: 1, maximum: 2147483647 };
export const integerSchema = { type: 'integer', minimum: 0, maximum: 2147483647 };
export const requestIdSchema = { type: 'string', pattern: idPattern };
export const runParams = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', pattern: uuidPattern } } };
export const versionsSchema = { type: 'object', additionalProperties: false, required: ['core','content','metadataSchema'], properties: Object.fromEntries(['core','content','metadataSchema'].map(key => [key, { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' }])) };
export const statisticsSchema = { type: 'object', additionalProperties: false, required: ['kills','builds','upgrades','goldEarned'], properties: Object.fromEntries(['kills','builds','upgrades','goldEarned'].map(key => [key, integerSchema])) };
export function httpError(code, statusCode, fieldErrors) { return Object.assign(new Error(code), { code, statusCode, ...(fieldErrors ? { fieldErrors } : {}) }); }
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function guestToken(header) {
  if (typeof header !== 'string' || header.length > 8192) return null;
  const matches = header.split(';').map(value => value.trim()).filter(value => value.startsWith('last_throne_guest='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice('last_throne_guest='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function operationHash(operation, runId, body) {
  // Keep accepted R1 hashes byte-identical. Inspecting the format/pin here does not validate gameplay.
  const snapshotSchemaVersion = body.snapshotSchemaVersion === 3 || operation === 'finish' && body.result?.versions?.core === 'r2-core-1' ? 3 : 2;
  return createHash('sha256').update(canonicalJson({ canonicalization: 1, operation, runId, snapshotSchemaVersion, body })).digest('hex');
}
export function newRequestId() { return randomUUID(); }
export function isLoopback(hostname) { return ['localhost','127.0.0.1','[::1]','::1'].includes(hostname); }
export function configuredOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname)))) throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin (HTTP allowed only on loopback)');
  return url.origin;
}
export function requestOrigin(req, fixedOrigin) {
  if (fixedOrigin) return fixedOrigin;
  const host = req.headers.host;
  if (typeof host !== 'string' || host.length > 255 || /[\/\\\s@?#]/.test(host)) throw httpError('ORIGIN_REJECTED', 403);
  let target; try { target = new URL(`https://${host}`); } catch { throw httpError('ORIGIN_REJECTED', 403); }
  return isLoopback(target.hostname) ? `http://${host}` : target.origin;
}
/** Fixed-window quotas; storage and waits remain bounded. */
export function createLimiter({ windowMs = 60000, maxBuckets = 10000, guest = 30, write = 120, read = 600 } = {}) {
  for (const value of [windowMs,maxBuckets,guest,write,read]) if (!Number.isInteger(value) || value < 1) throw new Error('Invalid rate limit configuration');
  const buckets = new Map();
  return (kind, key, now = Date.now()) => {
    const name = `${kind}:${key}`;
    let bucket = buckets.get(name);
    if (bucket && now >= bucket.until) { buckets.delete(name); bucket = null; }
    if (!bucket) {
      if (buckets.size >= maxBuckets) for (const [id, candidate] of buckets) if (now >= candidate.until) buckets.delete(id);
      if (buckets.size >= maxBuckets) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      bucket = { count: 0, until: now + windowMs }; buckets.set(name, bucket);
    }
    const limit = { guest, write, read }[kind]; if (!limit) throw new Error('Unknown rate limit kind');
    const allowed = bucket.count < limit; if (allowed) bucket.count++;
    return { allowed, retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)) };
  };
}
export function decodeCursor(encoded) {
  if (!encoded) return null;
  try {
    const cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || Object.keys(cursor).sort().join(',') !== 'createdAt,id' || typeof cursor.id !== 'string' || !new RegExp(uuidPattern).test(cursor.id) || typeof cursor.createdAt !== 'string' || cursor.createdAt.length > 64 || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error('invalid');
    return cursor;
  } catch { throw httpError('INVALID_CURSOR', 400); }
}
export function encodeCursor(cursor) { return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null; }
export const errorMessages = {
  INVALID_REQUEST: 'Проверьте параметры запроса.', INVALID_CURSOR: 'Неверный курсор истории.', NOT_FOUND: 'Маршрут не найден.', RUN_NOT_FOUND: 'Партия не найдена.', PROFILE_NOT_FOUND: 'Профиль не найден.',
  SESSION_REQUIRED: 'Создайте гостевой профиль.', SESSION_EXPIRED: 'Гостевая сессия завершена.', ORIGIN_REJECTED: 'Источник запроса не разрешён.', RATE_LIMITED: 'Слишком много запросов. Повторите позже.',
  CLIENT_RELEASE_UNAVAILABLE: 'Версия клиента недоступна.', CLIENT_VERSION_UNSUPPORTED: 'Версия клиента несовместима с API.', CLIENT_HAS_NO_BATTLE: 'Этот клиент не поддерживает партии.', CONTENT_VERSION_UNAVAILABLE: 'Закреплённый контент недоступен.',
  RUN_VERSION_MISMATCH: 'Версии партии не совпадают с клиентом.', REVISION_CONFLICT: 'Партия изменена в другой вкладке.', IDEMPOTENCY_CONFLICT: 'Этот идентификатор операции уже использован с другим телом.', RUN_FINISHED: 'Партия уже завершена.',
  SNAPSHOT_INVALID: 'Контрольная точка не соответствует правилам игры.', SNAPSHOT_SEED_MISMATCH: 'Seed контрольной точки не совпадает с партией.', RESULT_INVALID: 'Итог партии не соответствует правилам.', SETTINGS_INVALID: 'Недопустимые настройки.', VERSION_MISMATCH: 'Версии данных несовместимы.', CONTENT_INCOMPATIBLE: 'Контент несовместим с партией.',
  PAYLOAD_TOO_LARGE: 'Размер контрольной точки превышает ограничение.', SERVICE_UNAVAILABLE: 'Сервис временно недоступен.', REQUEST_REJECTED: 'Не удалось выполнить запрос.',
};
