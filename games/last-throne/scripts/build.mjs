import { build } from 'vite';
import { mkdir, readdir, readFile, writeFile, cp, rename, stat, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyRelease, assertReleaseId } from '../ops/artifacts.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const sha = data => createHash('sha256').update(data).digest('hex');
async function inventory(dir, prefix = '') {
  const entries = [];
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`Symlink forbidden: ${name}`);
    if (item.isDirectory()) entries.push(...await inventory(join(dir, item.name), name));
    else if (item.isFile()) entries.push([name, sha(await readFile(join(dir, item.name)))]);
    else throw new Error(`Non-regular source file: ${name}`);
  }
  return entries;
}
async function sourceInventory(root) {
  const sources = [];
  for (const directory of ['server', 'web', 'core', 'db', 'ops', 'scripts', 'launcher']) {
    sources.push(...(await inventory(join(root, directory))).map(([file, hash]) => [`${directory}/${file}`, hash]));
  }
  for (const file of ['package.json', 'package-lock.json']) sources.push([file, sha(await readFile(join(root, file)))]);
  return sources.sort(([a], [b]) => a.localeCompare(b));
}
export function r1Manifest(releaseId, sourceHash, frontendHash, backendHash, files, contentVersion = 'r1-content-1') {
  assertReleaseId(releaseId);
  if (!releaseId.startsWith('r1-')) throw new Error('R1 launch release IDs must begin with r1-');
  if (!/^r1-content-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(contentVersion)) throw new Error('Expected a pinned r1-content-* version');
  return {
    releaseId, sourceHash, runtimeMajor: 24,
    clientEntry: 'web/index.html', serverEntry: 'server/index.mjs', migrationEntry: 'scripts/migrate.mjs',
    versions: { frontend: `r1-web-${frontendHash.slice(0, 16)}`, backend: `r1-api-${backendHash.slice(0, 16)}`, core: 'r1-core-1', content: contentVersion, metadataSchema: 'r1-meta-1', saveFormat: 2, api: 1 },
    rollbackMode: 'frontend_only', compatibleApi: [1], compatibleSaveFormats: [1, 2],
    compatibleMetadataSchemas: ['r0-meta-1', 'r1-meta-1'], compatibleClientReleases: ['*', 'r1-*'], files,
  };
}
export function r2Manifest(releaseId, sourceHash, frontendHash, backendHash, files, contentVersion = 'r2-content-1') {
  assertReleaseId(releaseId);
  if (!releaseId.startsWith('r2-')) throw new Error('R2 launch release IDs must begin with r2-');
  if (!/^r2-content-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(contentVersion)) throw new Error('Expected a pinned r2-content-* version');
  return {
    releaseId, sourceHash, runtimeMajor: 24,
    clientEntry: 'web/index.html', serverEntry: 'server/index.mjs', migrationEntry: 'scripts/migrate.mjs',
    versions: { frontend: `r2-web-${frontendHash.slice(0, 16)}`, backend: `r2-api-${backendHash.slice(0, 16)}`, core: 'r2-core-1', content: contentVersion, metadataSchema: 'r2-meta-1', saveFormat: 3, api: 1 },
    rollbackMode: 'frontend_only', compatibleApi: [1], compatibleSaveFormats: [1, 2, 3],
    compatibleMetadataSchemas: ['r0-meta-1', 'r1-meta-1', 'r2-meta-1'], compatibleClientReleases: ['*', 'r1-*', 'r2-*'], files,
  };
}
/** Copy an exact ready artifact; never regenerate or modify its contents. */
async function retainArchive(root, releases, releaseId) {
  const archived = join(root, 'releases', releaseId);
  const manifest = await verifyRelease(archived);
  const target = join(releases, manifest.releaseId);
  if (resolve(archived) === resolve(target)) return;
  try {
    await stat(target);
    const existing = await verifyRelease(target);
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error(`Retained ${releaseId} release differs from its exact archive`);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = await mkdtemp(join(releases, '.retaining-'));
  const stage = join(parent, manifest.releaseId);
  try { await cp(archived, stage, { recursive: true }); await verifyRelease(stage); await rename(stage, target); }
  finally { await rm(parent, { recursive: true, force: true }); }
}
export async function retainR0(root, releases) { await retainArchive(root, releases, 'r0-002'); }
export async function retainReady(root, releases) {
  for (const id of ['r0-002', 'r1-002']) await retainArchive(root, releases, id);
}
export async function buildRelease({ root = sourceRoot, releaseId = process.env.RELEASE_ID || process.argv[2] || 'r2-001', releases = resolve(process.env.BUILD_RELEASES_DIR || join(root, 'dist/releases')), contentVersion = process.env.CONTENT_VERSION || 'r2-content-1' } = {}) {
  assertReleaseId(releaseId);
  if (!releaseId.startsWith('r2-')) throw new Error('R2 launch release IDs must begin with r2-');
  await mkdir(releases, { recursive: true });
  await retainReady(root, releases);
  const target = join(releases, releaseId);
  try { await stat(target); throw new Error(`Release already exists: ${releaseId}; use a new ID`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = await mkdtemp(join(releases, '.building-'));
  const stage = join(parent, releaseId); await mkdir(stage);
  const sources = await sourceInventory(root);
  const sourceHash = sha(JSON.stringify(sources));
  // API identity excludes frontend/operator docs. A balance-only launch keeps the same backend identity.
  const backendHash = sha(JSON.stringify(sources.filter(([name]) => /^(server|db|core)\//.test(name) || name === 'package-lock.json')));
  await build({ root: join(root, 'web'), base: './', define: { __RELEASE_ID__: JSON.stringify(releaseId) }, build: { outDir: join(stage, 'web'), emptyOutDir: true } });
  const frontendHash = sha(JSON.stringify(await inventory(join(stage, 'web'))));
  for (const directory of ['server', 'core', 'db', 'ops', 'scripts', 'launcher']) await cp(join(root, directory), join(stage, directory), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) await cp(join(root, file), join(stage, file));
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, stdio: 'inherit' });
  // Children invoke actual .mjs files; convenience .bin symlinks are outside immutable artifacts.
  await rm(join(stage, 'node_modules/.bin'), { recursive: true, force: true });
  if (sha(JSON.stringify(await sourceInventory(root))) !== sourceHash) throw new Error('Source inventory changed during build; freeze sources and retry with an unused releaseId');
  const manifest = r2Manifest(releaseId, sourceHash, frontendHash, backendHash, Object.fromEntries(await inventory(stage)), contentVersion);
  await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await verifyRelease(stage); await rename(stage, target);
  console.log(`Built immutable R2 release: ${relative(root, target)} (${Object.keys(manifest.files).length} files); exact R0 and R1 archives retained`);
  return { directory: target, manifest };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildRelease();
