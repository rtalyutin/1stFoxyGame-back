import { spawn } from 'node:child_process';
import path from 'node:path';
import { verifyRelease, assertReleaseId } from './artifacts.mjs';

const releaseId = assertReleaseId(process.argv[2]);
const directory = path.join(process.env.RELEASES_DIR ?? '/releases', releaseId);
const manifest = await verifyRelease(directory);
if (!process.env.DATABASE_MIGRATION_URL) throw new Error('DATABASE_MIGRATION_URL required');
const child = spawn(process.execPath, [path.join(directory, manifest.migrationEntry)], {
  cwd: directory, env: { ...process.env, DATABASE_URL: process.env.DATABASE_MIGRATION_URL, RELEASE_DIR: directory, RELEASES_DIR: process.env.RELEASES_DIR ?? '/releases', RELEASE_ID: releaseId }, stdio: 'inherit'
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
