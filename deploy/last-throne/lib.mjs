import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, mkdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';

export const SOURCE_HASH = 'b4cb38f2477b406608f648cb72e5c1c68a4aed8fd4f3fa84a88637e70d4b9bf8';
export const RELEASE_HASHES = Object.freeze({
  'r0-002': '40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6',
  'r1-002': 'daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823',
  'r2-001': 'dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf',
});
export const SOURCE_DIRS = ['server', 'web', 'core', 'db', 'ops', 'scripts', 'launcher'];
export const BACK_DIRS = ['server', 'core', 'db', 'ops', 'scripts', 'launcher', 'tests', 'docs'];
export const BACK_FILES = ['package.json', 'package-lock.json', 'tsconfig.json'];
export const sha = value => createHash('sha256').update(value).digest('hex');
export function cleanPath(value, name = 'path') {
  if (typeof value !== 'string' || !value || /[\0-\x1f\x7f]/.test(value)) throw new Error(`Invalid ${name}`);
  return path.resolve(value);
}
export function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function requireDisjoint(output, inputs) {
  for (const input of inputs) if (contains(input, output) || contains(output, input)) throw new Error('Output overlaps an input');
}
export async function noSymlinkPath(target) {
  const full = cleanPath(target); let current = path.parse(full).root;
  for (const part of full.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink in filesystem path'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
}
export async function existingDirectory(target) {
  await noSymlinkPath(target);
  if (!(await lstat(target)).isDirectory()) throw new Error('Expected an input directory');
  return realpath(target);
}
export async function freshOutput(target, inputs) {
  await noSymlinkPath(target); requireDisjoint(target, inputs);
  try { await lstat(target); throw new Error('Output already exists; choose a new directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export async function publishFreshDirectory(stage, target, inputs) {
  await freshOutput(target, inputs);
  // Reserve the name atomically so a concurrent assembler cannot replace even an empty output.
  await mkdir(target);
  try { await rename(stage, target); }
  catch (error) { await rmdir(target).catch(() => {}); throw error; }
}
export async function inventory(dir, prefix = '') {
  const entries = [];
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error('Symlink in input tree');
    if (item.isDirectory()) entries.push(...await inventory(path.join(dir, item.name), name));
    else if (item.isFile()) entries.push([name, sha(await readFile(path.join(dir, item.name)))]);
    else throw new Error('Non-regular input file');
  }
  return entries;
}
export async function pairedSourceHash(back, web) {
  const entries = [];
  for (const dir of SOURCE_DIRS) {
    const source = dir === 'web' ? web : path.join(back, dir);
    entries.push(...(await inventory(source)).map(([name, digest]) => [`${dir}/${name}`, digest]));
  }
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(back, name); await noSymlinkPath(file);
    entries.push([name, sha(await readFile(file))]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return sha(JSON.stringify(entries));
}
export async function exactReleases(root, verifyRelease, expected = RELEASE_HASHES) {
  const manifests = {};
  for (const [id, digest] of Object.entries(expected)) {
    const dir = path.join(root, 'releases', id); await noSymlinkPath(dir);
    if (sha(await readFile(path.join(dir, 'manifest.json'))) !== digest) throw new Error(`Exact archive manifest mismatch: ${id}`);
    manifests[id] = await verifyRelease(dir);
  }
  return manifests;
}
export function parseArgs(argv, allowed, flags = []) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!allowed.includes(key) && !flags.includes(key)) throw new Error('Unknown argument');
    if (Object.hasOwn(values, key)) throw new Error('Duplicate argument');
    if (flags.includes(key)) values[key] = true;
    else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Missing argument value'); values[key] = argv[++i]; }
  }
  return values;
}
export const shellQuote = value => `'${String(value).replaceAll("'", "'\"'\"'")}'`;
