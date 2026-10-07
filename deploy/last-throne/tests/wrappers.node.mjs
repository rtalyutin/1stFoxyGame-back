import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, chmod, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { assemble } from '../assemble.mjs';
import { readPrivateEnv, commandPlan, prepareOperator } from '../operator.mjs';
import { BACK_DIRS, sha, pairedSourceHash, SOURCE_HASH } from '../lib.mjs';
const exec = promisify(execFile);
const deploy = fileURLToPath(new URL('../', import.meta.url));
async function temporary(t) {
  const parent = path.join(deploy, '.test-work'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'case-')); t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function fixture(t) {
  const root = await temporary(t), back = path.join(root, 'back'), web = path.join(root, 'front/web'), ready = path.join(root, 'ready');
  for (const dir of BACK_DIRS) { await mkdir(path.join(back, dir), { recursive: true }); await writeFile(path.join(back, dir, 'placeholder.txt'), dir); }
  await writeFile(path.join(back, 'ops/artifacts.mjs'), await readFile(new URL('../../../games/last-throne/ops/artifacts.mjs', import.meta.url)));
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json']) await writeFile(path.join(back, name), '{}');
  await mkdir(web, { recursive: true }); await writeFile(path.join(web, 'index.html'), 'canonical frontend');
  const digest = await pairedSourceHash(back, web), archives = {};
  for (const id of ['r0-002', 'r1-002', 'r2-001', 'r3-001', 'r3-content-002']) {
    const dir = path.join(ready, 'releases', id); const files = { 'web/index.html': `ready-${id}`, 'server/index.mjs': '// fixture only', 'scripts/migrate.mjs': '// fixture migration' };
    for (const [name, content] of Object.entries(files)) { await mkdir(path.dirname(path.join(dir, name)), { recursive: true }); await writeFile(path.join(dir, name), content); }
    const manifest = { releaseId: id, sourceHash: digest, runtimeMajor: 24, rollbackMode: 'frontend_only', clientEntry: 'web/index.html', serverEntry: 'server/index.mjs', migrationEntry: 'scripts/migrate.mjs',
      versions: { frontend: 'fixture-web-1', backend: 'fixture-api-1', core: 'r2-core-1', content: 'r2-content-1', metadataSchema: 'r2-meta-1', saveFormat: 3, api: 1 },
      compatibleApi: [1], compatibleSaveFormats: [1, 2, 3], compatibleMetadataSchemas: ['r0-meta-1', 'r1-meta-1', 'r2-meta-1'], compatibleClientReleases: ['*', 'r1-*', 'r2-*'],
      files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, sha(content)])) };
    const raw = JSON.stringify(manifest); await writeFile(path.join(dir, 'manifest.json'), raw); archives[id] = sha(raw);
  }
  const options = { backSource: back, frontWeb: web, readyRoot: ready, output: path.join(root, 'output'), expectedSourceHash: digest, expectedArchives: archives };
  return { root, back, web, ready, digest, archives, options };
}
async function privateEnv(t, overrides = {}) {
  const root = await temporary(t), file = path.join(root, 'private.env');
  const values = { TD_NODE_IMAGE: 'node:24.19.0-bookworm-slim@sha256:' + 'a'.repeat(64), TD_POSTGRES_IMAGE: 'postgres:17.7-bookworm@sha256:' + 'b'.repeat(64),
    TD_GATEWAY_HOST_PORT: '18410', TD_RELEASES_DIR: path.join(root, 'host/releases'), TD_STATE_DIR: path.join(root, 'host/state'), TD_POSTGRES_PASSWORD: 'owner-secret',
    TD_DATABASE_URL: 'postgresql://last_throne_api:api-secret@postgres:5432/last_throne', TD_DATABASE_MIGRATION_URL: 'postgresql://last_throne_migrator:owner-secret@postgres:5432/last_throne',
    TD_PG_POOL_MAX: '4', TD_PUBLIC_ORIGIN: 'https://games.example.test', TD_RUNTIME_MEMORY_LIMIT: '1g', TD_RUNTIME_CPU_LIMIT: '1', TD_PG_MEMORY_LIMIT: '512m', TD_PG_CPU_LIMIT: '0.5', ...overrides };
  await writeFile(file, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
  return { root, file, values };
}

test('assembler copies generated workspace, retains all ready fixtures and leaves canonical sources unchanged', async t => {
  const f = await fixture(t); const result = await assemble(f.options);
  assert.equal(result.sourceHash, f.digest); assert.equal(await pairedSourceHash(f.back, f.web), f.digest);
  assert.equal(await pairedSourceHash(result.directory, path.join(result.directory, 'web')), f.digest);
  for (const id of Object.keys(f.archives)) assert.equal(sha(await readFile(path.join(result.directory, 'releases', id, 'manifest.json'))), f.archives[id]);
  assert.equal(await readFile(path.join(result.directory, '.gitignore'), 'utf8'), '*\n');
});
test('assembler rejects substituted frontend before creating output', async t => {
  const f = await fixture(t); await writeFile(path.join(f.web, 'index.html'), 'substituted frontend');
  await assert.rejects(assemble(f.options), /sourceHash mismatch/); await assert.rejects(access(f.options.output));
});
test('assembler rejects existing output and output nested in canonical source', async t => {
  const f = await fixture(t); await mkdir(f.options.output); await writeFile(path.join(f.options.output, 'keep'), 'existing');
  await assert.rejects(assemble(f.options), /already exists/); assert.equal(await readFile(path.join(f.options.output, 'keep'), 'utf8'), 'existing');
  await assert.rejects(assemble({ ...f.options, output: path.join(f.back, 'nested') }), /overlaps/);
});
test('assembler rejects input-tree symlinks and output-parent symlinks', async t => {
  const f = await fixture(t); const alias = path.join(f.root, 'alias'); await symlink(f.web, alias, 'dir');
  await assert.rejects(assemble({ ...f.options, frontWeb: alias }), /Symlink/);
  await assert.rejects(assemble({ ...f.options, output: path.join(alias, 'out') }), /Symlink/);
  await symlink(path.join(f.back, 'core/placeholder.txt'), path.join(f.back, 'core/link')); await assert.rejects(assemble(f.options), /Symlink/);
});
test('assembler rejects tampered old files and a rehashed replacement old archive', async t => {
  const f = await fixture(t), dir = path.join(f.ready, 'releases/r1-002');
  await writeFile(path.join(dir, 'web/index.html'), 'replaced R1'); await assert.rejects(assemble(f.options), /Hash mismatch/);
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')); manifest.files['web/index.html'] = sha('replaced R1');
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest)); await assert.rejects(assemble(f.options), /Exact archive manifest mismatch/);
});
test('concurrent assemblers cannot replace the same output', async t => {
  const f = await fixture(t); const attempts = await Promise.allSettled([assemble(f.options), assemble(f.options)]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1); assert.equal(attempts.filter(x => x.status === 'rejected').length, 1);
  assert.equal(await pairedSourceHash(f.options.output, path.join(f.options.output, 'web')), f.digest);
});
test('private env rejects readable secrets, mutable images, unsafe values and wrong database owner', async t => {
  const valid = await privateEnv(t); const config = await readPrivateEnv(valid.file); assert.equal(config.apiRole, 'last_throne_api');
  await chmod(valid.file, 0o644); await assert.rejects(readPrivateEnv(valid.file), /0600/);
  for (const overrides of [{ TD_NODE_IMAGE: 'node:24' }, { TD_POSTGRES_IMAGE: 'postgres:18@sha256:' + 'b'.repeat(64) }, { TD_DATABASE_URL: 'postgresql://last_throne_migrator:api-secret@postgres/last_throne' }, { TD_RUNTIME_CPU_LIMIT: '$(echo unsafe)' }]) {
    const bad = await privateEnv(t, overrides); await assert.rejects(readPrivateEnv(bad.file));
  }
});
test('operator requires explicit mode, reviewed env and backup/baseline acknowledgements', async () => {
  await assert.rejects(prepareOperator({ mode: 'automatic' }), /Explicit mode/);
  await assert.rejects(prepareOperator({ mode: 'first-install' }), /acknowledgements/);
});
test('command plans wait for PG, stop on SQL failures, preserve old-selection order and contain no secrets', async t => {
  const e = await privateEnv(t); const config = await readPrivateEnv(e.file);
  const args = { staging: '/ready path', output: '/prepared path', envFile: e.file, runtimeDir: '/opt/last-throne/runtime', config };
  const first = commandPlan({ ...args, mode: 'first-install' }); const upgrade = commandPlan({ ...args, mode: 'upgrade-r0-r1' });
  for (const script of [first, upgrade]) {
    assert.ok(script.indexOf('until docker compose') < script.indexOf('run --rm --no-deps'));
    assert.match(script, /ON_ERROR_STOP=1/); assert.match(script, /\/ready path\/releases\/r3-001\/db\/r3-runtime-grants.sql/);
    for (const secret of ['api-secret', 'owner-secret', 'postgresql://']) assert.equal(script.includes(secret), false);
    const file = path.join(e.root, sha(script) + '.sh'); await writeFile(file, script); await exec('/bin/sh', ['-n', file]);
  }
  assert.ok(upgrade.indexOf('stop runtime') < upgrade.indexOf('build runtime'));
  assert.ok(upgrade.indexOf('RELEASES_DIR=/candidate-releases') < upgrade.indexOf('up -d runtime'));
  assert.ok(upgrade.indexOf('up -d runtime') < upgrade.indexOf('node "$TASK_RUNTIME_DIR/ops/install-release.mjs"'));
  assert.ok(upgrade.indexOf('ops/install-release.mjs') < upgrade.indexOf('ops/cli.mjs update r3-001'));
  assert.equal(/compose (down|restart)/.test(upgrade), false); assert.equal(upgrade.includes('nginx -s'), false);
});
test('failed TD control startup exits the generated upgrade before exposing R3 or calling update', async t => {
  const e = await privateEnv(t); const config = await readPrivateEnv(e.file);
  const runtime = path.join(e.root, 'runtime'), output = path.join(e.root, 'prepared'), staging = path.join(e.root, 'staging');
  for (const dir of [runtime, path.join(output, 'runtime'), path.join(staging, 'releases/r3-001/db'), config.values.TD_RELEASES_DIR, config.values.TD_STATE_DIR]) await mkdir(dir, { recursive: true });
  await writeFile(path.join(output, 'roles.sql'), '-- fake SQL input, never executed');
  await writeFile(path.join(staging, 'releases/r3-001/db/r3-runtime-grants.sql'), '-- fake grants input, never executed');
  const script = commandPlan({ staging, output, envFile: e.file, runtimeDir: runtime, mode: 'upgrade-r0-r1', config });
  const startup = script.indexOf('until timeout 5s ');
  assert.ok(startup > script.indexOf('up -d runtime'));
  assert.ok(startup < script.indexOf('node "$TASK_RUNTIME_DIR/ops/install-release.mjs"'));
  assert.ok(startup < script.indexOf('ops/cli.mjs update r3-001'));
  const bin = path.join(e.root, 'fake-bin'); await mkdir(bin);
  const trace = path.join(e.root, 'trace'), failures = path.join(e.root, 'failed-status'), started = path.join(e.root, 'runtime-started');
  const docker = `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$TASK_FAKE_TRACE"
case "$*" in
  *'up -d runtime'*) : > "$TASK_FAKE_STARTED"; exit 0 ;;
  *'node ops/cli.mjs status'*)
    if [ -f "$TASK_FAKE_STARTED" ]; then printf 'failed\\n' >> "$TASK_FAKE_FAILURES"; exit 1; fi ;;
esac
exit 0
`;
  await writeFile(path.join(bin, 'docker'), docker, { mode: 0o700 });
  // All potentially mutating/network tools are replaced; only the shell and timeout are real.
  for (const tool of ['node', 'sleep', 'install', 'cp', 'curl']) await writeFile(path.join(bin, tool), `#!/bin/sh\nprintf '${tool} %s\\n' "$*" >> "$TASK_FAKE_TRACE"\nexit 0\n`, { mode: 0o700 });
  const file = path.join(e.root, 'commands.sh'); await writeFile(file, script);
  let failure;
  try { await exec('/bin/sh', [file], { timeout: 10000, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TASK_FAKE_TRACE: trace, TASK_FAKE_STARTED: started, TASK_FAKE_FAILURES: failures } }); }
  catch (error) { failure = error; }
  assert.ok(failure, 'startup failure must stop the command script'); assert.equal(failure.code, 1);
  assert.match(failure.stderr, /TD control readiness timeout/);
  assert.equal((await readFile(failures, 'utf8')).trim().split('\n').length, 90, 'the bounded startup gate must actually be reached');
  const calls = await readFile(trace, 'utf8');
  assert.match(calls, /stop runtime/); assert.match(calls, /RELEASES_DIR=\/candidate-releases/); assert.match(calls, /up -d runtime/);
  assert.equal(calls.includes('ops/install-release.mjs'), false, 'R2 must not enter the watched parent before old API recovery');
  assert.equal(calls.includes('ops/cli.mjs update r3-001'), false, 'update must not run after startup failure');
  assert.equal(calls.includes('curl '), false); await assert.rejects(access(path.join(config.values.TD_RELEASES_DIR, 'r2-001')));
});
test('R2 upgrade preserves the running container and stages migration before exposing the new archive', async t => {
  const e = await privateEnv(t), config = await readPrivateEnv(e.file);
  const script = commandPlan({ staging: '/candidate', output: '/prepared', envFile: e.file, runtimeDir: '/runtime', mode: 'upgrade-r2', config });
  assert.equal(/compose[^\n]*\b(?:build|stop|restart|down|up)\b/.test(script), false);
  assert.equal(script.includes('cp -a'), false); assert.equal(script.includes('install -m 0600'), false);
  assert.equal(script.includes('nginx -s'), false); assert.equal(script.includes('\\password'), false);
  assert.ok(script.indexOf('RELEASES_DIR=/candidate-releases') < script.indexOf('ops/install-release.mjs'));
  assert.ok(script.indexOf('r3-runtime-grants.sql') < script.indexOf('ops/install-release.mjs'));
  assert.ok(script.indexOf('ops/install-release.mjs') < script.indexOf('ops/cli.mjs update r3-001'));
  const file = path.join(e.root, 'upgrade.sh'); await writeFile(file, script); await exec('/bin/sh', ['-n', file]);
});
test('failed additive migration leaves R2 selected and never installs or switches R3', async t => {
  const e = await privateEnv(t), config = await readPrivateEnv(e.file);
  await mkdir(config.values.TD_STATE_DIR, { recursive: true });
  const selection = path.join(config.values.TD_STATE_DIR, 'selection.json');
  const raw = JSON.stringify({ apiReleaseId: 'r2-001', clientReleaseId: 'r2-001' }); await writeFile(selection, raw);
  const bin = path.join(e.root, 'bin'), trace = path.join(e.root, 'trace'); await mkdir(bin);
  await writeFile(path.join(bin, 'docker'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TASK_TRACE"\ncase "$*" in *"migrate-release.mjs r3-001"*) exit 23;; esac\nexit 0\n', { mode: 0o700 });
  const script = commandPlan({ staging: path.join(e.root, 'missing-candidate'), output: path.join(e.root, 'missing-prepared'), envFile: e.file, runtimeDir: path.join(e.root, 'runtime'), mode: 'upgrade-r2', config });
  const file = path.join(e.root, 'upgrade.sh'); await writeFile(file, script);
  let failure; try { await exec('/bin/sh', [file], { timeout: 10000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_TRACE: trace } }); } catch (error) { failure = error; }
  assert.equal(failure?.code, 23); assert.equal(await readFile(selection, 'utf8'), raw);
  const calls = await readFile(trace, 'utf8'); assert.match(calls, /migrate-release.mjs r3-001/);
  assert.equal(calls.includes('update r3-001'), false); await assert.rejects(access(path.join(config.values.TD_RELEASES_DIR, 'r3-001')));
});
test('camera plan keeps API001, uses content002 after base update, and performs no runtime or database mutations', async t => {
  const e = await privateEnv(t), config = await readPrivateEnv(e.file);
  const args = { staging:'/candidate',output:'/prepared',envFile:e.file,runtimeDir:'/runtime',config };
  const script = commandPlan({...args,mode:'camera-r3'});
  assert.match(script,/apiReleaseId!=="r3-001"/);
  assert.match(script,/r3-api-7b084f31d98e7e6f/);
  assert.equal(/compose[^\n]*\b(?:build|stop|restart|down|up|run)\b/.test(script),false);
  assert.equal(/migrate-release|psql|cp -a|update r3-content-002/.test(script),false);
  assert.ok(script.indexOf('/td/api/v1/version') < script.indexOf('ops/install-release.mjs'));
  assert.ok(script.indexOf('ops/install-release.mjs') < script.indexOf('ops/cli.mjs content r3-content-002'));
  for(const mode of ['first-install','upgrade-r0-r1','upgrade-r2']) {
    const initial = commandPlan({...args,mode});
    assert.ok(initial.indexOf('ops/cli.mjs update r3-001') < initial.indexOf('ops/cli.mjs content r3-content-002'));
    assert.equal(initial.includes('ops/cli.mjs update r3-content-002'),false);
  }
  const file=path.join(e.root,'camera.sh');await writeFile(file,script);await exec('/bin/sh',['-n',file]);
});
test('camera live API mismatch blocks install; failed content stops readback and preserves the durable old selection', async t => {
  const e = await privateEnv(t), config = await readPrivateEnv(e.file);
  await mkdir(config.values.TD_STATE_DIR,{recursive:true});
  const selection=path.join(config.values.TD_STATE_DIR,'selection.json');
  const old=JSON.stringify({apiReleaseId:'r3-001',clientReleaseId:'r3-001'});await writeFile(selection,old);
  const bin=path.join(e.root,'bin');await mkdir(bin);
  const trace=path.join(e.root,'trace'), scriptFile=path.join(e.root,'camera.sh');
  await writeFile(path.join(bin,'node'),'#!/bin/sh\ncase "$1" in */ops/install-release.mjs) printf "install\\n" >> "$TASK_TRACE"; exit 0;; esac\nexec "$TASK_REAL_NODE" "$@"\n',{mode:0o700});
  await writeFile(path.join(bin,'docker'),'#!/bin/sh\nprintf "docker %s\\n" "$*" >> "$TASK_TRACE"\ncase "$*" in *"content r3-content-002"*) exit 17;; *"ops/cli.mjs status"*) printf \'{"api":{"releaseId":"r3-001"},"selection":{"apiReleaseId":"r3-001","clientReleaseId":"r3-001"},"journal":{"phase":"complete"}}\\n\';; esac\n',{mode:0o700});
  await writeFile(path.join(bin,'curl'),'#!/bin/sh\nprintf "curl %s\\n" "$*" >> "$TASK_TRACE"\nprintf \'{"releaseId":"%s","versions":{"backend":"r3-api-7b084f31d98e7e6f"}}\\n\' "$TASK_FAKE_API"\n',{mode:0o700});
  const script=commandPlan({staging:path.join(e.root,'candidate'),output:'/unused',envFile:e.file,runtimeDir:path.join(e.root,'runtime'),mode:'camera-r3',config});
  await writeFile(scriptFile,script);
  const environment={...process.env,PATH:`${bin}:/usr/bin:/bin`,TASK_TRACE:trace,TASK_REAL_NODE:process.execPath};
  for(const [api,code] of [['r3-other',1],['r3-001',17]]) {
    await writeFile(trace,'');let failure;
    try {await exec('/bin/sh',[scriptFile],{timeout:10000,env:{...environment,TASK_FAKE_API:api}});}catch(error){failure=error;}
    assert.equal(failure?.code,code);assert.equal(await readFile(selection,'utf8'),old);
    const calls=await readFile(trace,'utf8');
    assert.equal(calls.includes('install\n'),api==='r3-001');
    assert.equal(calls.includes('content r3-content-002'),api==='r3-001');
    assert.equal(calls.includes('/td/current.json'),false);assert.equal(calls.includes('bootstrap?'),false);
  }
});
test('operator CLI prepares the real exact R3 package without invoking Docker or disclosing env secrets', async t => {
  const staging = process.env.TD_TEST_STAGING;
  if (!staging) { t.skip('Set TD_TEST_STAGING to the verified assembled R3 workspace'); return; }
  const e = await privateEnv(t); const fakeBin = path.join(e.root, 'bin'); await mkdir(fakeBin); const marker = path.join(e.root, 'docker-called');
  await writeFile(path.join(fakeBin, 'docker'), `#!/bin/sh\necho called > '${marker}'\nexit 1\n`, { mode: 0o700 });
  const output = path.join(e.root, 'prepared');
  const result = await exec(process.execPath, [path.join(deploy, 'operator.mjs'), '--staging', staging, '--env-file', e.file, '--output', output, '--mode', 'first-install', '--ack-backup-baseline', '--reviewed-env'], { env: { ...process.env, PATH: fakeBin } });
  assert.equal(JSON.parse(result.stdout).execution, 'NOT_STARTED'); assert.equal(JSON.parse(result.stdout).sourceHash, SOURCE_HASH);
  for (const secret of ['api-secret', 'owner-secret', 'postgresql://']) assert.equal((result.stdout + result.stderr).includes(secret), false);
  await assert.rejects(access(marker));
  const roleSql = await readFile(path.join(output, 'roles.sql'), 'utf8'); assert.match(roleSql, /NOINHERIT/); assert.match(roleSql, /pg_auth_members/); assert.equal(roleSql.includes('api-secret'), false);
});

test('actual archived API001 keeps its Node PID and cloud save through camera content002 promotion and rollback', {timeout:45000}, async t => {
  const staging=process.env.TD_TEST_STAGING, dependencies=process.env.TD_TEST_DEPENDENCIES;
  if(!staging||!dependencies){t.skip('Set TD_TEST_STAGING and TD_TEST_DEPENDENCIES for the actual API/PGlite child check');return;}
  const root=await temporary(t), releasesDir=path.join(staging,'releases');
  const {Supervisor,requestJson}=await import(pathToFileURL(path.join(releasesDir,'r2-001/ops/supervisor.mjs')));
  const worker=path.join(root,'api-child.mjs');
  await writeFile(worker,`import {PGlite} from ${JSON.stringify(pathToFileURL(path.join(dependencies,'@electric-sql/pglite/dist/index.js')).href)};
import {migrate} from ${JSON.stringify(pathToFileURL(path.join(releasesDir,'r3-001/scripts/migrate.mjs')).href)};
import {createApp} from ${JSON.stringify(pathToFileURL(path.join(releasesDir,'r3-001/server/app.mjs')).href)};
const db=new PGlite(process.env.PGLITE_DATA_DIR);const raw=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1)??{rows:[]};
let tail=Promise.resolve();async function acquire(){const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return release;}
const pool={query:async(...args)=>{const unlock=await acquire();try{return await raw(...args);}finally{unlock();}},connect:async()=>{const unlock=await acquire();return{query:raw,release:unlock};}};
await migrate(pool);const app=await createApp({pool,releasesDir:process.env.RELEASES_DIR,releaseId:'r3-001',secureCookies:false});
await app.listen({port:Number(process.env.PORT),host:'127.0.0.1'});console.log(JSON.stringify({port:app.server.address().port}));process.once('SIGTERM',async()=>{await app.close();await db.close();process.exit(0);});
`);
  let starts=0, migrations=0;
  class LocalSupervisor extends Supervisor {
    // The production app runs in a real child; only its local DB transport is substituted.
    async migrate(){migrations++;}
    async startChild(id){
      const existing=this.children.get(id);if(existing&&!existing.exited)return existing;
      assert.equal(id,'r3-001');starts++;
      const child=spawn(process.execPath,[worker],{env:{...process.env,RELEASES_DIR:releasesDir,PORT:'0',PGLITE_DATA_DIR:path.join(root,'database')},stdio:['ignore','pipe','pipe']});
      let output='';child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{output+=c;});
      // Discover the actual ephemeral port; production app logging remains disabled.
      const deadline=Date.now()+15000;let port;
      while(Date.now()<deadline&&!port){
        for(const line of output.split('\n')){try{const log=JSON.parse(line);if(Number.isInteger(log.port)&&log.port>0)port=log.port;}catch{}}
        if(child.exitCode!==null)throw Error('Actual API child failed: '+output);if(!port)await new Promise(r=>setTimeout(r,30));
      }
      if(!port){child.kill('SIGKILL');throw Error('Actual API readiness timeout: '+output);}
      const slot={id,port,child,active:0,exited:false,retiring:false};this.children.set(id,slot);child.once('exit',()=>{slot.exited=true;});
      assert.equal((await requestJson(port,'/api/v1/ready')).releaseId,id);return slot;
    }
  }
  const runtime=new LocalSupervisor({releasesDir,stateDir:path.join(root,'state'),launcherDir:path.join(staging,'launcher'),port:0,childPorts:[],controlEnabled:false});
  try {
    await runtime.start();await runtime.operate('update','r3-001');
    const apiPid=runtime.info().api.pid, gatewayPid=runtime.info().gatewayPid;
    const origin=`http://127.0.0.1:${runtime.port}`;
    const call=async(method,url,body,cookie)=>{
      const response=await fetch(origin+'/td/api/v1'+url,{method,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      assert.ok(response.ok,await response.clone().text());return response;
    };
    const guest=await call('POST','/guest-session',{}), cookie=guest.headers.get('set-cookie').split(';')[0];
    const {randomUUID}=await import('node:crypto');
    const {createGame,createSnapshot}=await import(pathToFileURL(path.join(releasesDir,'r3-001/core/game-core-r3.ts')));
    const {defaultR3Content}=await import(pathToFileURL(path.join(releasesDir,'r3-001/core/content-r3.ts')));
    const snapshot=createSnapshot(createGame(defaultR3Content,42));
    const newRun=async clientReleaseId=>(await call('POST','/runs',{clientRunId:randomUUID(),clientReleaseId,coreVersion:'r3-core-1',contentVersion:'r3-content-1',seed:42},cookie)).json();
    const oldRun=await newRun('r3-001');
    const checkpoint={requestId:randomUUID(),expectedRevision:1,snapshotSchemaVersion:4,snapshot};
    const saved=await (await call('PUT',`/runs/${oldRun.id}/checkpoint`,checkpoint,cookie)).json();
    await runtime.operate('content','r3-content-002');
    assert.equal(runtime.info().api.pid,apiPid);assert.equal(runtime.info().gatewayPid,gatewayPid);assert.equal(starts,1);assert.equal(migrations,1);
    assert.equal((await requestJson(runtime.port,'/td/current.json')).releaseId,'r3-content-002');
    const bootstrap=await requestJson(runtime.port,'/td/api/v1/bootstrap?clientReleaseId=r3-content-002');
    assert.equal(bootstrap.apiReleaseId,'r3-001');assert.equal(bootstrap.clientReleaseId,'r3-content-002');assert.equal(bootstrap.versions.content,'r3-content-1');
    assert.equal((await requestJson(runtime.port,'/td/api/v1/version')).pid,apiPid);
    assert.deepEqual((await (await call('GET',`/runs/${oldRun.id}/checkpoint`,undefined,cookie)).json()).snapshot,snapshot);
    assert.deepEqual(await (await call('PUT',`/runs/${oldRun.id}/checkpoint`,checkpoint,cookie)).json(),saved);
    const cameraRun=await newRun('r3-content-002');
    await call('PUT',`/runs/${cameraRun.id}/checkpoint`,{...checkpoint,requestId:randomUUID()},cookie);
    await runtime.operate('rollback','r3-001');
    assert.equal(runtime.info().api.pid,apiPid);assert.equal(starts,1);assert.equal(migrations,1);
    assert.equal((await requestJson(runtime.port,'/td/current.json')).releaseId,'r3-001');
    assert.deepEqual((await (await call('GET',`/runs/${cameraRun.id}/checkpoint`,undefined,cookie)).json()).snapshot,snapshot);
    assert.equal((await requestJson(runtime.port,'/td/api/v1/bootstrap?clientReleaseId=r3-content-002')).apiReleaseId,'r3-001');
  } finally {await runtime.close({force:true});}
});
