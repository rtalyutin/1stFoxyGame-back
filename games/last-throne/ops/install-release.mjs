import path from 'node:path';
import { mkdir, cp, readdir, chmod, open, rename, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyRelease } from './artifacts.mjs';

async function syncAndFreeze(dir, top = false) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await syncAndFreeze(file);
    else {
      const handle = await open(file, 'r'); try { await handle.sync(); } finally { await handle.close(); }
      await chmod(file, 0o444);
    }
  }
  if (!top) await chmod(dir, 0o555);
  const handle = await open(dir, 'r'); try { await handle.sync(); } finally { await handle.close(); }
}
export async function installRelease(source, releasesDir) {
  const manifest = await verifyRelease(path.resolve(source));
  const root = path.resolve(releasesDir); await mkdir(root, { recursive: true });
  const target = path.join(root, manifest.releaseId);
  try { await lstat(target); throw new Error('Release ID already installed; immutable releases cannot be overwritten'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stage = path.join(root, `.incoming-${randomUUID()}`); await mkdir(stage);
  const staged = path.join(stage, manifest.releaseId);
  await cp(source, staged, { recursive: true, dereference: false, force: false, errorOnExist: true });
  await verifyRelease(staged);
  await syncAndFreeze(staged, true);
  // Only complete verified directories become visible to the supervisor.
  await rename(staged, target);
  await chmod(target, 0o555);
  const handle = await open(root, 'r'); try { await handle.sync(); } finally { await handle.close(); }
  return { releaseId: manifest.releaseId, directory: target, sourceHash: manifest.sourceHash };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, releasesDir] = process.argv.slice(2);
  if (!source || !releasesDir) { console.error('Usage: node ops/install-release.mjs SOURCE_RELEASE_DIR RELEASES_PARENT'); process.exitCode = 2; }
  else { try { console.log(JSON.stringify(await installRelease(source, releasesDir), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
