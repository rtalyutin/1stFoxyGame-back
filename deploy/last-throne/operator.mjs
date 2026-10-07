import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE_HASH, RELEASE_ID, cleanPath, contains, existingDirectory, noSymlinkPath, freshOutput, publishFreshDirectory, pairedSourceHash, exactReleases, parseArgs, shellQuote as q } from './lib.mjs';

const required = ['TD_NODE_IMAGE', 'TD_POSTGRES_IMAGE', 'TD_GATEWAY_HOST_PORT', 'TD_RELEASES_DIR', 'TD_STATE_DIR', 'TD_POSTGRES_PASSWORD',
  'TD_DATABASE_URL', 'TD_DATABASE_MIGRATION_URL', 'TD_PG_POOL_MAX', 'TD_PUBLIC_ORIGIN', 'TD_RUNTIME_MEMORY_LIMIT', 'TD_RUNTIME_CPU_LIMIT', 'TD_PG_MEMORY_LIMIT', 'TD_PG_CPU_LIMIT'];
export async function readPrivateEnv(file) {
  await noSymlinkPath(file); const info = await lstat(file);
  if (!info.isFile() || (info.mode & 0o077)) throw new Error('Private env must be a regular file with mode 0600 or stricter');
  const values = {};
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    const text = line.trim(); if (!text || text.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(text);
    if (!match || !required.includes(match[1])) throw new Error('Unsupported private env field');
    const key = match[1]; if (Object.hasOwn(values, key)) throw new Error(`Duplicate ${key}`);
    let value = match[2].trim();
    const singleQuoted = value.startsWith("'") && value.endsWith("'");
    if ((value.startsWith('"') && value.endsWith('"')) || singleQuoted) value = value.slice(1, -1);
    if (!value || /[\0-\x1f\x7f]/.test(value) || (!singleQuoted && /[$`\\]/.test(value))) throw new Error(`Expected a literal value for ${key}`);
    values[key] = value;
  }
  for (const key of required) if (!values[key]) throw new Error(`Missing ${key}`);
  for (const key of ['TD_NODE_IMAGE', 'TD_POSTGRES_IMAGE']) if (!/^[^@\s]+@sha256:[a-f0-9]{64}$/.test(values[key])) throw new Error(`Exact image digest required for ${key}`);
  if (!/(^|\/)node:24(?:[.\-]|@)/.test(values.TD_NODE_IMAGE)) throw new Error('TD_NODE_IMAGE must explicitly pin Node 24');
  if (!/(^|\/)postgres:17(?:[.\-]|@)/.test(values.TD_POSTGRES_IMAGE)) throw new Error('TD_POSTGRES_IMAGE must explicitly pin PostgreSQL 17');
  const port = Number(values.TD_GATEWAY_HOST_PORT), pool = Number(values.TD_PG_POOL_MAX);
  if (!/^\d+$/.test(values.TD_GATEWAY_HOST_PORT) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TD_GATEWAY_HOST_PORT');
  if (!/^\d+$/.test(values.TD_PG_POOL_MAX) || !Number.isInteger(pool) || pool < 1 || pool > 20) throw new Error('Invalid TD_PG_POOL_MAX');
  for (const key of ['TD_RUNTIME_MEMORY_LIMIT', 'TD_PG_MEMORY_LIMIT']) if (!/^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)(?:[bBkKmMgG])?$/.test(values[key])) throw new Error(`Invalid ${key}`);
  for (const key of ['TD_RUNTIME_CPU_LIMIT', 'TD_PG_CPU_LIMIT']) if (!/^\d+(?:\.\d+)?$/.test(values[key]) || Number(values[key]) <= 0) throw new Error(`Invalid ${key}`);
  for (const key of ['TD_RELEASES_DIR', 'TD_STATE_DIR']) {
    if (!path.isAbsolute(values[key]) || values[key].includes(':')) throw new Error(`Expected an absolute Linux directory for ${key}`);
    values[key] = cleanPath(values[key], key);
  }
  if (contains(values.TD_RELEASES_DIR, values.TD_STATE_DIR) || contains(values.TD_STATE_DIR, values.TD_RELEASES_DIR)) throw new Error('State and release directories must be disjoint');
  let app, owner, origin;
  try { app = new URL(values.TD_DATABASE_URL); owner = new URL(values.TD_DATABASE_MIGRATION_URL); origin = new URL(values.TD_PUBLIC_ORIGIN); }
  catch { throw new Error('Invalid database URL or PUBLIC_ORIGIN'); }
  for (const url of [app, owner]) if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres' || (url.port && url.port !== '5432') || url.pathname !== '/last_throne' || !url.password) throw new Error('URLs must address the dedicated Compose PostgreSQL service/database with authentication');
  const apiRole = decodeURIComponent(app.username);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(apiRole) || apiRole === 'last_throne_migrator' || decodeURIComponent(owner.username) !== 'last_throne_migrator') throw new Error('Dedicated non-owner API role and Compose migration owner required');
  if (decodeURIComponent(owner.password) !== values.TD_POSTGRES_PASSWORD) throw new Error('Migration URL does not match the configured PostgreSQL owner password');
  if (origin.protocol !== 'https:' || origin.origin !== values.TD_PUBLIC_ORIGIN || origin.username || origin.password) throw new Error('TD_PUBLIC_ORIGIN must be an exact HTTPS origin');
  return { values, apiRole, port };
}
function rolesSql(role) {
  return `-- No passwords in this file. Run as the dedicated Last Throne owner.\nDO $td_role$\nDECLARE r record;\nBEGIN\n SELECT * INTO r FROM pg_roles WHERE rolname='${role}';\n IF NOT FOUND THEN\n  CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;\n ELSE\n  IF r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR NOT r.rolcanlogin THEN\n   RAISE EXCEPTION 'API role has incompatible privileges';\n  END IF;\n  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='last_throne' AND nspowner=r.oid)\n   OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='last_throne' AND c.relowner=r.oid)\n   OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='last_throne' AND p.proowner=r.oid)\n   OR EXISTS(SELECT 1 FROM pg_database WHERE datname='last_throne' AND datdba=r.oid)\n   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) THEN\n   RAISE EXCEPTION 'API role must have no ownership or role memberships';\n  END IF;\n END IF;\nEND\n$td_role$;\n`;
}
export function commandPlan({ staging, output, envFile, runtimeDir, mode, config }) {
  if (mode === 'upgrade-r2') return r2UpgradePlan({ staging, output, runtimeDir, config });
  const { values: env, apiRole, port } = config;
  const c = 'docker compose --project-directory "$TASK_RUNTIME_DIR" --env-file "$TASK_RUNTIME_DIR/ops/.env" -f "$TASK_RUNTIME_DIR/ops/compose.yml"';
  const lines = ['#!/bin/sh', 'set -eu', '# Review before execution. Only TD is affected. Nginx and the first game are not changed.',
    'command -v timeout >/dev/null || { echo "GNU timeout is required for bounded startup checks." >&2; exit 1; }',
    `TASK_RUNTIME_DIR=${q(runtimeDir)}`, `TASK_RELEASES_DIR=${q(env.TD_RELEASES_DIR)}`, `TASK_STATE_DIR=${q(env.TD_STATE_DIR)}`,
    `[ ! -e "$TASK_RELEASES_DIR/r3-001" ] || { echo 'R3 is already visible; inspect state before proceeding.' >&2; exit 1; }`];
  const stateGuard = mode === 'first-install'
    ? 'const fs=require("node:fs");if(fs.existsSync(process.argv[1]))throw Error("Existing TD selection: use the explicit upgrade procedure");'
    : 'const fs=require("node:fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!/^r[01]-/.test(s.apiReleaseId))throw Error("Upgrade mode requires the selected R0/R1 API");';
  lines.push(`node -e ${q(stateGuard)} "$TASK_STATE_DIR/selection.json"`);
  if (mode === 'upgrade-r0-r1') lines.push('# Existing TD compose/env/state baseline must already have been captured.', `${c} exec -T runtime node ops/cli.mjs status`, `${c} stop runtime`);
  lines.push('install -d -m 0755 -- "$TASK_RUNTIME_DIR" "$TASK_RELEASES_DIR"', 'install -d -o 10001 -g 10001 -m 0700 -- "$TASK_STATE_DIR"',
    `cp -a -- ${q(path.join(output, 'runtime'))}/. "$TASK_RUNTIME_DIR/"`);
  if (path.resolve(envFile) !== path.join(runtimeDir, 'ops/.env')) lines.push(`install -m 0600 -- ${q(envFile)} "$TASK_RUNTIME_DIR/ops/.env"`);
  lines.push(`${c} config --quiet`, `${c} build runtime`);
  if (mode === 'first-install') for (const id of ['r0-002', 'r1-002', 'r2-001', 'r3-001']) lines.push(`node "$TASK_RUNTIME_DIR/ops/install-release.mjs" ${q(path.join(staging, 'releases', id))} "$TASK_RELEASES_DIR"`);
  lines.push(`${c} up -d postgres`, 'TASK_ATTEMPT=0', `until ${c} exec -T postgres pg_isready -U last_throne_migrator -d last_throne >/dev/null 2>&1; do`,
    '  TASK_ATTEMPT=$((TASK_ATTEMPT + 1)); [ "$TASK_ATTEMPT" -lt 90 ] || { echo "PostgreSQL readiness timeout" >&2; exit 1; }; sleep 1', 'done',
    `${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne -c 'SELECT 1;' >/dev/null`);
  if (mode === 'upgrade-r0-r1') lines.push(`${c} run --rm --no-deps -e RELEASES_DIR=/candidate-releases -v ${q(path.join(staging, 'releases') + ':/candidate-releases:ro')} runtime node ops/migrate-release.mjs r3-001`);
  else lines.push(`${c} run --rm --no-deps runtime node ops/migrate-release.mjs r3-001`);
  lines.push(`${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne < ${q(path.join(output, 'roles.sql'))}`,
    '# Enter the API password interactively; it must match the private application URL.',
    `${c} exec postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne -c ${q('\\password ' + apiRole)}`,
    `${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne -v api_role=${q(apiRole)} < ${q(path.join(staging, 'releases/r3-001/db/r3-runtime-grants.sql'))}`,
    `${c} up -d runtime`);
  lines.push('TASK_ATTEMPT=0', `until timeout 5s ${c} exec -T runtime node ops/cli.mjs status >/dev/null 2>&1; do`,
    '  TASK_ATTEMPT=$((TASK_ATTEMPT + 1)); [ "$TASK_ATTEMPT" -lt 90 ] || { echo "TD control readiness timeout" >&2; exit 1; }; sleep 1', 'done');
  if (mode === 'upgrade-r0-r1') lines.push('# Confirm old selection recovered successfully before exposing the R3 directory.', `${c} exec -T runtime node ops/cli.mjs status`,
    `node "$TASK_RUNTIME_DIR/ops/install-release.mjs" ${q(path.join(staging, 'releases/r3-001'))} "$TASK_RELEASES_DIR"`);
  lines.push(`${c} exec -T runtime node ops/cli.mjs update r3-001`, `${c} exec -T runtime node ops/cli.mjs status`,
    `curl --fail --silent --show-error --connect-timeout 3 --max-time 10 ${q(`http://127.0.0.1:${port}/td/api/v1/ready`)}`,
    `curl --fail --silent --show-error --connect-timeout 3 --max-time 10 ${q(`http://127.0.0.1:${port}/td/api/v1/bootstrap?clientReleaseId=r3-001`)}`,
    '# STOP: install/verify only the TD HTTPS Nginx route manually, then perform public QA before enabling the hub card.');
  return lines.join('\n') + '\n';
}

// An already-installed R2 runtime is left running throughout this additive upgrade.
function r2UpgradePlan({ staging, output, runtimeDir, config }) {
  const { values: env, apiRole, port } = config;
  const c = 'docker compose --project-directory "$TASK_RUNTIME_DIR" --env-file "$TASK_RUNTIME_DIR/ops/.env" -f "$TASK_RUNTIME_DIR/ops/compose.yml"';
  const guard = 'const fs=require("node:fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!/^r2-/.test(s.apiReleaseId))throw Error("upgrade-r2 requires the selected R2 API");';
  return [
    '#!/bin/sh', 'set -eu', '# R2 -> R3. The existing runtime image, container, env and Nginx stay in service.',
    `TASK_RUNTIME_DIR=${q(runtimeDir)}`, `TASK_RELEASES_DIR=${q(env.TD_RELEASES_DIR)}`, `TASK_STATE_DIR=${q(env.TD_STATE_DIR)}`,
    '[ ! -e "$TASK_RELEASES_DIR/r3-001" ] || { echo "R3 already exists; inspect the journal before retrying." >&2; exit 1; }',
    `node -e ${q(guard)} "$TASK_STATE_DIR/selection.json"`,
    `${c} config --quiet`, `${c} exec -T runtime node ops/cli.mjs status`,
    `${c} exec -T postgres pg_isready -U last_throne_migrator -d last_throne`,
    `${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne -c 'SELECT 1;' >/dev/null`,
    // Candidate stays outside the watched host release parent until migration succeeds.
    `${c} run --rm --no-deps -e RELEASES_DIR=/candidate-releases -v ${q(path.join(staging, 'releases') + ':/candidate-releases:ro')} runtime node ops/migrate-release.mjs r3-001`,
    `${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne < ${q(path.join(output, 'roles.sql'))}`,
    `${c} exec -T postgres psql -v ON_ERROR_STOP=1 -U last_throne_migrator -d last_throne -v api_role=${q(apiRole)} < ${q(path.join(staging, 'releases/r3-001/db/r3-runtime-grants.sql'))}`,
    `node ${q(path.join(staging, 'ops/install-release.mjs'))} ${q(path.join(staging, 'releases/r3-001'))} "$TASK_RELEASES_DIR"`,
    `${c} exec -T runtime node ops/cli.mjs update r3-001`, `${c} exec -T runtime node ops/cli.mjs status`,
    `curl --fail --silent --show-error --connect-timeout 3 --max-time 10 ${q(`http://127.0.0.1:${port}/td/api/v1/ready`)}`,
    `curl --fail --silent --show-error --connect-timeout 3 --max-time 10 ${q(`http://127.0.0.1:${port}/td/api/v1/bootstrap?clientReleaseId=r3-001`)}`,
    '# Perform public QA and retained-client saves before activating the hub. Pair rollback to R2 is unsafe for save4.'
  ].join('\n') + '\n';
}

export async function prepareOperator({ staging, envFile, output, runtimeDir = '/opt/last-throne/runtime', mode, ackBackupBaseline = false, reviewedEnv = false }) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required');
  if (!['first-install', 'upgrade-r0-r1', 'upgrade-r2'].includes(mode)) throw new Error('Explicit mode required: first-install, upgrade-r0-r1 or upgrade-r2');
  if (!ackBackupBaseline || !reviewedEnv) throw new Error('Explicit backup/baseline and reviewed-env acknowledgements required');
  const source = await existingDirectory(cleanPath(staging, 'staging')); const env = cleanPath(envFile, 'env file'); const target = cleanPath(output, 'output');
  const runtime = cleanPath(runtimeDir, 'runtime directory');
  await freshOutput(target, [source, env, runtime]);
  if (await pairedSourceHash(source, path.join(source, 'web')) !== SOURCE_HASH) throw new Error('Staging sourceHash mismatch');
  const { verifyRelease } = await import(pathToFileURL(path.join(source, 'ops/artifacts.mjs')).href);
  await exactReleases(source, verifyRelease);
  const config = await readPrivateEnv(env);
  for (const folder of [config.values.TD_RELEASES_DIR, config.values.TD_STATE_DIR]) if (contains(folder, runtime) || contains(runtime, folder) || contains(folder, source) || contains(source, folder) || contains(folder, target) || contains(target, folder)) throw new Error('Runtime, immutable release parent, state, staging and output must be disjoint');
  const script = commandPlan({ staging: source, output: target, envFile: env, runtimeDir: runtime, mode, config });
  await mkdir(path.dirname(target), { recursive: true }); const parent = await mkdtemp(path.join(path.dirname(target), '.td-preparing-')); const stage = path.join(parent, 'prepared');
  try {
    await mkdir(path.join(stage, 'runtime'), { recursive: true });
    for (const name of ['ops', 'launcher']) await cp(path.join(source, name), path.join(stage, 'runtime', name), { recursive: true, dereference: false });
    await writeFile(path.join(stage, 'roles.sql'), rolesSql(config.apiRole));
    await writeFile(path.join(stage, 'commands.sh'), script, { mode: 0o600 });
    const summary = { status: 'PREPARED', execution: 'NOT_STARTED', mode, sourceHash: SOURCE_HASH, releaseId: 'r3-001',
      envCheck: 'syntax/mode only; operator acknowledged review', backupCheck: 'operator acknowledgement; restore not executed by this tool',
      operations: 'commands only; no Docker, SSH, SQL, Nginx or GitHub calls were made', commands: path.join(target, 'commands.sh') };
    await writeFile(path.join(stage, 'plan.json'), JSON.stringify(summary, null, 2) + '\n');
    await writeFile(path.join(stage, '.gitignore'), '*\n');
    await publishFreshDirectory(stage, target, [source, env, runtime]);
    return { ...summary, directory: target };
  } finally { await rm(parent, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2), ['--staging', '--env-file', '--output', '--runtime-dir', '--mode'], ['--ack-backup-baseline', '--reviewed-env']);
    console.log(JSON.stringify(await prepareOperator({ staging: args['--staging'], envFile: args['--env-file'], output: args['--output'], runtimeDir: args['--runtime-dir'], mode: args['--mode'],
      ackBackupBaseline: args['--ack-backup-baseline'], reviewedEnv: args['--reviewed-env'] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
