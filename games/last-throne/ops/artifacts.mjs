import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const releaseIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export function assertReleaseId(id) {
  if (typeof id !== 'string' || !releaseIdPattern.test(id)) throw new Error('Invalid releaseId');
  return id;
}
export function safeRelative(name) {
  if (typeof name !== 'string' || name.length > 500 || !/^[a-zA-Z0-9@_+.\-/ ]+$/.test(name)
    || name.startsWith('/') || name.split('/').some(x => !x || x === '.' || x === '..')) {
    throw new Error(`Unsafe artifact path: ${name}`);
  }
  return name;
}
async function inventory(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    safeRelative(relative);
    if (entry.isSymbolicLink()) throw new Error(`Symlink forbidden: ${relative}`);
    if (entry.isDirectory()) files.push(...await inventory(path.join(dir, entry.name), relative + '/'));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Non-regular artifact file: ${relative}`);
  }
  return files;
}
export async function verifyRelease(dir, { runtimeMajor = Number(process.versions.node.split('.')[0]) } = {}) {
  if ((await lstat(dir)).isSymbolicLink()) throw new Error('Release directory may not be a symlink');
  const canonical = await realpath(dir);
  const manifestPath = path.join(canonical, 'manifest.json');
  if (!(await lstat(manifestPath)).isFile() || (await lstat(manifestPath)).isSymbolicLink()) throw new Error('Manifest must be a regular file');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertReleaseId(manifest.releaseId);
  if (path.basename(canonical) !== manifest.releaseId) throw new Error('Directory does not match releaseId');
  if (manifest.runtimeMajor !== runtimeMajor) throw new Error('Incompatible Node runtime');
  if (!shaPattern.test(manifest.sourceHash ?? '')) throw new Error('Invalid sourceHash');
  if (!['pair', 'frontend_only', 'forward_only'].includes(manifest.rollbackMode)) throw new Error('Unknown rollback mode');
  for (const field of ['frontend', 'backend', 'core', 'content', 'metadataSchema']) {
    if (typeof manifest.versions?.[field] !== 'string' || !versionPattern.test(manifest.versions[field])) throw new Error(`Invalid version: ${field}`);
  }
  for (const field of ['saveFormat', 'api']) {
    if (!Number.isSafeInteger(manifest.versions?.[field]) || manifest.versions[field] < 1) throw new Error(`Invalid version: ${field}`);
  }
  for (const field of ['compatibleApi', 'compatibleSaveFormats', 'compatibleMetadataSchemas', 'compatibleClientReleases']) {
    if (!Array.isArray(manifest[field]) || !manifest[field].length) throw new Error(`Missing compatibility: ${field}`);
  }
  if ([...manifest.compatibleApi, ...manifest.compatibleSaveFormats].some(x => !Number.isSafeInteger(x) || x < 1)
    || manifest.compatibleMetadataSchemas.some(x => typeof x !== 'string' || !versionPattern.test(x))
    || manifest.compatibleClientReleases.some(x => x !== '*' && x !== 'r1-*' && x !== 'r2-*' && (typeof x !== 'string' || !releaseIdPattern.test(x)))) throw new Error('Invalid compatibility declaration');
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Missing file inventory');
  const listed = Object.keys(manifest.files).sort();
  const actual = (await inventory(canonical)).filter(x => x !== 'manifest.json').sort();
  if (JSON.stringify(listed) !== JSON.stringify(actual)) throw new Error('Artifact inventory mismatch');
  for (const name of listed) {
    safeRelative(name);
    if (!shaPattern.test(manifest.files[name])) throw new Error(`Invalid hash: ${name}`);
    const stat = await lstat(path.join(canonical, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe file: ${name}`);
    const digest = createHash('sha256').update(await readFile(path.join(canonical, name))).digest('hex');
    if (digest !== manifest.files[name]) throw new Error(`Hash mismatch: ${name}`);
  }
  for (const field of ['clientEntry', 'serverEntry', 'migrationEntry']) {
    safeRelative(manifest[field]);
    if (!manifest.files[manifest[field]]) throw new Error(`Unlisted ${field}`);
  }
  if (!manifest.clientEntry.startsWith('web/')) throw new Error('Client entry must be in web/');
  return manifest;
}
export function acceptsClientRelease(api, client) {
  const v = client.versions;
  const declared = api.compatibleClientReleases;
  const wildcardR0 = declared.includes('*')
    && /^r0-core-/.test(v.core) && /^r0-content-/.test(v.content) && /^r0-meta-/.test(v.metadataSchema);
  const familyR1 = declared.includes('r1-*') && /^r1-/.test(client.releaseId)
    && v.core === 'r1-core-1' && /^r1-content-/.test(v.content)
    && v.metadataSchema === 'r1-meta-1' && v.saveFormat === 2 && v.api === 1;
  const familyR2 = declared.includes('r2-*') && /^r2-/.test(client.releaseId)
    && v.core === 'r2-core-1' && /^r2-content-/.test(v.content)
    && v.metadataSchema === 'r2-meta-1' && v.saveFormat === 3 && v.api === 1;
  return declared.includes(client.releaseId) || wildcardR0 || familyR1 || familyR2;
}
export function assertCompatibility(api, clients) {
  for (const client of clients) {
    const v = client.versions;
    if (!api.compatibleApi.includes(v.api) || !api.compatibleSaveFormats.includes(v.saveFormat)
      || !api.compatibleMetadataSchemas.includes(v.metadataSchema)
      || !acceptsClientRelease(api, client)) {
      throw new Error(`API ${api.releaseId} incompatible with retained client ${client.releaseId}`);
    }
  }
}
