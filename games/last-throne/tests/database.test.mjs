import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';
import { readContent, readMetadataSchema, canonicalJson } from '../db/content.mjs';

let db;
const query = async (sql, params = []) => params.length ? db.query(sql, params) : (await db.exec(sql)).at(-1);
const pool = { query, connect: async () => ({ query, release() {} }) };
const hash = 'a'.repeat(64);
const seedType = '00000000-0000-4000-8000-000000000001';
const seedParameter = '00000000-0000-4000-8000-000000000101';
const seedEntity = '00000000-0000-4000-8000-000000000201';

before(async () => { db = new PGlite(); await migrate(pool); });
after(async () => { await db.close(); });

async function schema(definitions, { publish = true, includeSeed = false, codes = [], revisions = [] } = {}) {
  const version = `test-meta-${randomUUID()}`;
  const types = [];
  await query('INSERT INTO last_throne.metadata_schema_versions(version) VALUES($1)', [version]);
  for (const definition of definitions) {
    const index = types.length;
    const type = { id: randomUUID(), code: codes[index] ?? `record_${randomUUID().replaceAll('-', '')}`, params: [] };
    await query(`INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES($1,$2,'Test',$3)`, [type.id, type.code, revisions[index] ?? 1]);
    await query('INSERT INTO last_throne.metadata_schema_types VALUES($1,$2)', [version, type.id]);
    types.push(type);
    for (const parameter of definition) {
      const param = { id: randomUUID(), dataType: 'text', code: `p_${type.params.length}`, ...parameter };
      type.params.push(param);
    }
  }
  for (const type of types) for (const p of type.params) {
    const target = p.targetIndex === undefined ? p.targetType ?? null : types[p.targetIndex].id;
    await query(`INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9)`, [p.id, type.id, p.code, p.dataType, p.required ?? false, p.multiple ?? false, target, p.policy ?? null, p.constraints ?? {}]);
  }
  if (includeSeed) await query('INSERT INTO last_throne.metadata_schema_types VALUES($1,$2)', [version, seedType]);
  if (publish) await query('SELECT last_throne.publish_metadata_schema($1,$2)', [version, hash]);
  return { version, types };
}
async function entity(fixture, index = 0, scope = {}) {
  const id = randomUUID();
  await query(`INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,owner_id,run_id,checkpoint_id,release_id,pinned_release_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, fixture.types[index].id, fixture.version,
      scope.owner ?? (scope.release ? null : randomUUID()), scope.run ?? null, scope.checkpoint ?? null,
      scope.release ?? null, scope.pinned ?? scope.release ?? null]);
  return id;
}
async function value(fixture, id, index, paramIndex, val, ordinal = 0) {
  const p = fixture.types[index].params[paramIndex];
  const field = `${p.dataType}_value`;
  return query(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,ordinal,${field}) VALUES($1,$2,$3,$4,$5,$6)`,
    [id, fixture.types[index].id, p.id, p.dataType, ordinal, val]);
}
async function release(fixture) {
  const id = `test-content-${randomUUID()}`;
  await query(`INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash)
    VALUES($1,$1,1,$2,ARRAY['r0-core-1'],$3,$3)`, [id, fixture.version, hash]);
  return id;
}
async function rejects(sql, params, pattern) {
  await assert.rejects(() => query(sql, params), pattern);
}

test('seed reads EAV truth with published versions and boolean false', async () => {
  const content = await readContent(pool, 'r0-content-1');
  assert.equal(content.metadataSchemaVersion, 'r0-meta-1');
  assert.deepEqual(content.coreCompatibility, ['r0-core-1']);
  assert.equal(content.entities[0].parameters.title, 'Последний трон');
  assert.equal(content.entities[0].parameters.api_version, 1);
  assert.equal(content.entities[0].parameters.gameplay_available, false);
  assert.equal(await readContent(pool, 'unavailable'), null);
});

test('seed metadata and content hashes match canonical projections of EAV truth', async () => {
  const metadata = await readMetadataSchema(pool, 'r0-meta-1');
  const content = await readContent(pool, 'r0-content-1');
  const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
  assert.equal((await query(`SELECT manifest_hash FROM last_throne.metadata_schema_versions WHERE version='r0-meta-1'`)).rows[0].manifest_hash, digest(metadata));
  assert.equal((await query(`SELECT projection_hash FROM last_throne.content_releases WHERE id='r0-content-1'`)).rows[0].projection_hash, digest(content));
});

test('migrations rerun without duplicating seed or history', async () => {
  const before = (await query('SELECT count(*)::int AS count FROM last_throne.schema_migrations')).rows[0].count;
  assert.deepEqual(await migrate(pool), []);
  assert.equal((await query('SELECT count(*)::int AS count FROM last_throne.schema_migrations')).rows[0].count, before);
  assert.equal((await query('SELECT count(*)::int AS count FROM last_throne.entities WHERE release_id=$1', ['r0-content-1'])).rows[0].count, 1);
});

test('busy migration lock refuses immediately without schema mutation and releases client', async () => {
  const calls = [];
  let released = false;
  const busyPool = { connect: async () => ({
    query: async sql => { calls.push(sql); return { rows: sql.includes('pg_try_advisory_lock') ? [{ locked: false }] : [] }; },
    release() { released = true; },
  }) };
  await assert.rejects(() => migrate(busyPool), /MIGRATION_BUSY/);
  assert(calls.every(sql => !sql.includes('CREATE') && !sql.includes('INSERT')));
  assert(calls[0].includes('lock_timeout'));
  assert(calls[1].includes('statement_timeout'));
  assert.equal(released, true);
});

test('changed migration checksum blocks before altering data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'throne-checksum-'));
  try {
    const names = await readdir(new URL('../db/migrations/', import.meta.url));
    for (const name of names) await copyFile(new URL(`../db/migrations/${name}`, import.meta.url), join(dir, name));
    await writeFile(join(dir, names[0]), `${await readFile(join(dir, names[0]), 'utf8')}\n-- modified\n`);
    await assert.rejects(() => migrate(pool, { directory: dir }), /MIGRATION_CHECKSUM_MISMATCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed migration transaction rolls back both DDL and history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'throne-failed-'));
  try {
    await writeFile(join(dir, '003_failure.sql'), `CREATE TABLE last_throne.should_not_survive(id integer); SELECT missing_migration_function();`);
    await assert.rejects(() => migrate(pool, { directory: dir }), /missing_migration_function/);
    assert.equal((await query(`SELECT to_regclass('last_throne.should_not_survive') AS table_name`)).rows[0].table_name, null);
    assert.equal((await query(`SELECT count(*)::int AS count FROM last_throne.schema_migrations WHERE id='003_failure.sql'`)).rows[0].count, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('draft entity may omit required values; publication rejects omission atomically', async () => {
  const f = await schema([[{ required: true }]]);
  const r = await release(f);
  const id = await entity(f, 0, { release: r });
  await rejects('SELECT last_throne.publish_content_release($1)', [r], /REQUIRED_PARAMETER_MISSING/);
  assert.equal((await query('SELECT status FROM last_throne.content_releases WHERE id=$1', [r])).rows[0].status, 'draft');
  assert.equal((await query('SELECT status FROM last_throne.entities WHERE id=$1', [id])).rows[0].status, 'draft');
  await value(f, id, 0, 0, 'ready');
  await query('SELECT last_throne.publish_content_release($1)', [r]);
  assert.equal((await readContent(pool, r)).entities[0].parameters.p_0, 'ready');
});

test('value rejects unknown entity, unknown parameter and parameter belonging to another type', async () => {
  const f = await schema([[{}], [{}]]);
  const id = await entity(f);
  await assert.rejects(() => value(f, randomUUID(), 0, 0, 'x'), /foreign key constraint/);
  await rejects(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,text_value) VALUES($1,$2,$3,'text','x')`, [id, f.types[0].id, randomUUID()], /foreign key constraint/);
  await rejects(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,text_value) VALUES($1,$2,$3,'text','x')`, [id, f.types[0].id, f.types[1].params[0].id], /foreign key constraint/);
});

test('typed columns require exactly one value and preserve zero/false', async () => {
  const f = await schema([[{ dataType: 'integer' }, { dataType: 'boolean' }]]);
  const id = await entity(f);
  await rejects(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,text_value) VALUES($1,$2,$3,'integer','wrong')`, [id, f.types[0].id, f.types[0].params[0].id], /check constraint/);
  await rejects(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,integer_value,text_value) VALUES($1,$2,$3,'integer',1,'two')`, [id, f.types[0].id, f.types[0].params[0].id], /check constraint/);
  await rejects(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type) VALUES($1,$2,$3,'integer')`, [id, f.types[0].id, f.types[0].params[0].id], /check constraint/);
  await value(f, id, 0, 0, 0);
  await value(f, id, 0, 1, false);
  const rows = (await query('SELECT integer_value,boolean_value FROM last_throne.entity_parameter_values WHERE entity_id=$1 ORDER BY parameter_id', [id])).rows;
  assert(rows.some(row => Number(row.integer_value) === 0 && row.integer_value !== null));
  assert(rows.some(row => row.boolean_value === false));
});

test('single value cannot duplicate via an ordinal; multiple values keep unique ordinals', async () => {
  const f = await schema([[{}, { multiple: true }]]);
  const id = await entity(f);
  await value(f, id, 0, 0, 'first');
  await assert.rejects(() => value(f, id, 0, 0, 'duplicate'), /duplicate key/);
  await assert.rejects(() => value(f, id, 0, 0, 'bypass', 1), /SINGLE_VALUE_ORDINAL/);
  await value(f, id, 0, 1, 'a', 0);
  await value(f, id, 0, 1, 'b', 1);
  await assert.rejects(() => value(f, id, 0, 1, 'duplicate', 1), /duplicate key/);
});

test('runtime projection preserves decimal precision, timestamps, large integers and multiple ordinals', async () => {
  const f = await schema([[{ dataType: 'numeric' }, { dataType: 'timestamp' }, { multiple: true }, { dataType: 'integer' }]]);
  const r = await release(f);
  const id = await entity(f, 0, { release: r });
  await value(f, id, 0, 0, '123.450');
  await value(f, id, 0, 1, '2026-10-04T12:00:00Z');
  await value(f, id, 0, 2, 'first', 0);
  await value(f, id, 0, 2, 'fourth', 3);
  await value(f, id, 0, 3, '9223372036854775807');
  await query('SELECT last_throne.publish_content_release($1)', [r]);
  const parameters = (await readContent(pool, r)).entities[0].parameters;
  assert.equal(parameters.p_0, '123.450');
  assert.equal(parameters.p_1, '2026-10-04T12:00:00.000Z');
  assert.deepEqual(parameters.p_2, [{ ordinal: 0, value: 'first' }, { ordinal: 3, value: 'fourth' }]);
  assert.equal(parameters.p_3, '9223372036854775807');
});

test('published multiple constructor parameter projects without inherited object values', async () => {
  const f = await schema([[{ code: 'constructor', multiple: true }]]);
  const r = await release(f);
  const id = await entity(f, 0, { release: r });
  await value(f, id, 0, 0, 'first', 0);
  await value(f, id, 0, 0, 'second', 1);
  await query('SELECT last_throne.publish_content_release($1)', [r]);
  const content = await readContent(pool, r);
  assert.deepEqual(content.entities[0].parameters.constructor, [{ ordinal: 0, value: 'first' }, { ordinal: 1, value: 'second' }]);
  assert.equal(Object.getPrototypeOf(content.entities[0].parameters), null);
  assert.deepEqual(JSON.parse(JSON.stringify(content)).entities[0].parameters.constructor, [{ ordinal: 0, value: 'first' }, { ordinal: 1, value: 'second' }]);
  await assert.rejects(() => schema([[{ code: '__proto__', multiple: true }]], { publish: false }), /check constraint/);
});

test('projection dictionary handles __proto__ safely even if a future schema admits that code', async () => {
  const id = randomUUID();
  let call = 0;
  const syntheticPool = { query: async () => ({ rows: ++call === 1 ? [{
    id: 'synthetic-content', content_version: 'synthetic-content', metadata_schema_version: 'synthetic-meta',
    schema_version: 1, core_compatibility: ['r0-core-1'], source_revision: 1,
  }] : [0, 1].map(ordinal => ({ id, type_code: 'synthetic_type', schema_revision: 1, revision: 1,
    parameter_code: '__proto__', multiple: true, data_type: 'text', ordinal, text_value: `entry-${ordinal}`,
  })) }) };
  const parameters = (await readContent(syntheticPool, 'synthetic-content')).entities[0].parameters;
  assert.equal(Object.getPrototypeOf(parameters), null);
  assert.equal(Object.hasOwn(parameters, '__proto__'), true);
  assert.deepEqual(parameters.__proto__, [{ ordinal: 0, value: 'entry-0' }, { ordinal: 1, value: 'entry-1' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(parameters)).__proto__, parameters.__proto__);
});

test('range, length and enum constraints are enforced; unknown expression is rejected', async () => {
  const f = await schema([[{ dataType: 'integer', constraints: { min: 0, max: 10 } }, { constraints: { minLength: 2, maxLength: 4, enum: ['ok', 'yes'] } }]]);
  const id = await entity(f);
  await assert.rejects(() => value(f, id, 0, 0, -1), /VALUE_CONSTRAINT_FAILED/);
  await assert.rejects(() => value(f, id, 0, 0, 11), /VALUE_CONSTRAINT_FAILED/);
  await assert.rejects(() => value(f, id, 0, 1, 'no'), /VALUE_CONSTRAINT_FAILED/);
  await assert.rejects(() => value(f, id, 0, 1, 'x'), /VALUE_CONSTRAINT_FAILED/);
  await value(f, id, 0, 0, 0);
  await value(f, id, 0, 1, 'ok');
  await assert.rejects(() => schema([[{ constraints: { javascript: 'return true' } }]], { publish: false }), /UNKNOWN_PARAMETER_CONSTRAINT/);
  await assert.rejects(() => schema([[{ dataType: 'integer', constraints: { enum: ['text'] } }]], { publish: false }), /CONSTRAINT_ENUM_TYPE/);
});

test('published metadata cannot be modified, deleted, extended or moved into a draft type', async () => {
  const draft = await schema([[]], { publish: false });
  const unused = await schema([[{}]]);
  await rejects('UPDATE last_throne.entity_parameters SET required=false WHERE id=$1', [seedParameter], /METADATA_IMMUTABLE/);
  await rejects('DELETE FROM last_throne.entity_types WHERE id=$1', [seedType], /METADATA_IMMUTABLE/);
  await rejects(`INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type) VALUES($1,$2,'new_field','New','text')`, [randomUUID(), seedType], /METADATA_IMMUTABLE/);
  await rejects('UPDATE last_throne.entity_parameters SET entity_type_id=$1 WHERE id=$2', [draft.types[0].id, seedParameter], /METADATA_IMMUTABLE/);
  await rejects('UPDATE last_throne.entity_parameters SET entity_type_id=$1 WHERE id=$2', [draft.types[0].id, unused.types[0].params[0].id], /METADATA_IMMUTABLE/);
  await rejects('UPDATE last_throne.metadata_schema_types SET metadata_schema_version=$1 WHERE metadata_schema_version=$2', [draft.version, 'r0-meta-1'], /METADATA_IMMUTABLE/);
  await rejects('UPDATE last_throne.metadata_schema_versions SET manifest_hash=$1 WHERE version=$2', [hash, 'r0-meta-1'], /METADATA_IMMUTABLE/);
});

test('draft parameter with existing values cannot change multiplicity/range', async () => {
  const f = await schema([[{ multiple: true }]], { publish: false });
  const id = await entity(f);
  await value(f, id, 0, 0, 'a', 1);
  await rejects('UPDATE last_throne.entity_parameters SET multiple=false WHERE id=$1', [f.types[0].params[0].id], /PARAMETER_HAS_VALUES_CREATE_REVISION/);
  await rejects(`UPDATE last_throne.entity_parameters SET constraints='{"maxLength":0}' WHERE id=$1`, [f.types[0].params[0].id], /PARAMETER_HAS_VALUES_CREATE_REVISION/);
  await query('SELECT last_throne.publish_metadata_schema($1,$2)', [f.version, hash]);
});

test('new metadata revision adds a parameter without DDL and preserves old version', async () => {
  const f = await schema([[{}]]);
  const tableCount = (await query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='last_throne'`)).rows[0].count;
  const next = await schema([[{}, { code: 'additional', dataType: 'integer' }]], { codes: [f.types[0].code], revisions: [2] });
  const id = await entity(next);
  await value(next, id, 0, 1, 12);
  await query(`UPDATE last_throne.entities SET status='frozen' WHERE id=$1`, [id]);
  assert.equal((await query('SELECT status FROM last_throne.metadata_schema_versions WHERE version=$1', [f.version])).rows[0].status, 'published');
  assert.equal((await query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='last_throne'`)).rows[0].count, tableCount);
  assert.equal((await query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='last_throne' AND table_name IN ('heroes','towers')`)).rows[0].count, 0);
});

test('owner and run policies allow only their declared scope', async () => {
  const owner = randomUUID(), run = randomUUID();
  const f = await schema([[{ dataType: 'reference', targetIndex: 1, policy: 'same_owner' }, { dataType: 'reference', targetIndex: 1, policy: 'same_run' }], []]);
  const id = await entity(f, 0, { owner, run });
  const sameOwnerOtherRun = await entity(f, 1, { owner, run: randomUUID() });
  const sameRunOtherCheckpoint = await entity(f, 1, { owner, run, checkpoint: randomUUID() });
  await value(f, id, 0, 0, sameOwnerOtherRun);
  await assert.rejects(() => value(f, id, 0, 1, sameOwnerOtherRun), /REFERENCE_SCOPE/);
  await value(f, id, 0, 1, sameRunOtherCheckpoint);
});

test('metadata publication rejects two revisions of one type in a single pinned schema', async () => {
  const code = `record_${randomUUID().replaceAll('-', '')}`;
  const f = await schema([[], []], { publish: false, codes: [code, code], revisions: [1, 2] });
  await rejects('SELECT last_throne.publish_metadata_schema($1,$2)', [f.version, hash], /METADATA_SCHEMA_INVALID/);
  assert.equal((await query('SELECT status FROM last_throne.metadata_schema_versions WHERE version=$1', [f.version])).rows[0].status, 'draft');
});

test('published entities/values/releases cannot be updated or moved', async () => {
  await rejects('UPDATE last_throne.entities SET owner_id=$1,release_id=NULL WHERE id=$2', [randomUUID(), seedEntity], /ENTITY_IMMUTABLE/);
  await rejects('DELETE FROM last_throne.entity_parameter_values WHERE entity_id=$1', [seedEntity], /ENTITY_IMMUTABLE/);
  await rejects(`UPDATE last_throne.content_releases SET source_revision=2 WHERE id='r0-content-1'`, [], /RELEASE_IMMUTABLE/);
  await rejects(`UPDATE last_throne.content_releases SET status='draft' WHERE id='r0-content-1'`, [], /RELEASE_IMMUTABLE/);
});

test('reference enforces target type, owner, run and checkpoint and restricts deletion', async () => {
  const f = await schema([[{ dataType: 'reference', targetIndex: 1, policy: 'same_checkpoint' }], []]);
  const owner = randomUUID(), run = randomUUID(), checkpoint = randomUUID();
  const id = await entity(f, 0, { owner, run, checkpoint });
  const wrongType = await entity(f, 0, { owner, run, checkpoint });
  const wrongOwner = await entity(f, 1, { owner: randomUUID(), run, checkpoint });
  const wrongRun = await entity(f, 1, { owner, run: randomUUID(), checkpoint });
  const wrongCheckpoint = await entity(f, 1, { owner, run, checkpoint: randomUUID() });
  const valid = await entity(f, 1, { owner, run, checkpoint });
  await assert.rejects(() => value(f, id, 0, 0, randomUUID()), /REFERENCE_TARGET_TYPE/);
  await assert.rejects(() => value(f, id, 0, 0, wrongType), /REFERENCE_TARGET_TYPE/);
  for (const target of [wrongOwner, wrongRun, wrongCheckpoint]) await assert.rejects(() => value(f, id, 0, 0, target), /REFERENCE_SCOPE/);
  await value(f, id, 0, 0, valid);
  await rejects('DELETE FROM last_throne.entities WHERE id=$1', [valid], /foreign key constraint/);
  await rejects('UPDATE last_throne.entities SET checkpoint_id=$1 WHERE id=$2', [randomUUID(), valid], /ENTITY_SCOPE_IMMUTABLE_AFTER_VALUES/);
});

test('finalized references require finalized targets; a complete group can freeze atomically', async () => {
  const f = await schema([[{ dataType: 'reference', targetIndex: 1, policy: 'same_checkpoint' }], []]);
  const owner = randomUUID(), run = randomUUID(), checkpoint = randomUUID();
  const source = await entity(f, 0, { owner, run, checkpoint });
  const target = await entity(f, 1, { owner, run, checkpoint });
  await value(f, source, 0, 0, target);
  await rejects(`UPDATE last_throne.entities SET status='frozen' WHERE id=$1`, [source], /FINAL_REFERENCE_TARGET_IS_DRAFT/);
  assert.equal((await query('SELECT status FROM last_throne.entities WHERE id=$1', [source])).rows[0].status, 'draft');
  await query('BEGIN');
  try {
    await query(`UPDATE last_throne.entities SET status='frozen' WHERE id=$1`, [source]);
    await query(`UPDATE last_throne.entities SET status='frozen' WHERE id=$1`, [target]);
    await query('COMMIT');
  } catch (error) { await query('ROLLBACK'); throw error; }
});

test('pinned public reference admits the pinned release and rejects another release', async () => {
  const f = await schema([[{ dataType: 'reference', targetType: seedType, policy: 'pinned_release' }]], { includeSeed: true });
  const id = await entity(f, 0, { pinned: 'r0-content-1' });
  await value(f, id, 0, 0, seedEntity);
  const otherRelease = await release({ version: 'r0-meta-1' });
  const another = randomUUID();
  await query(`INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,'r0-meta-1',$3,$3)`, [another, seedType, otherRelease]);
  const source = await entity(f, 0, { pinned: 'r0-content-1' });
  await assert.rejects(() => value(f, source, 0, 0, another), /REFERENCE_SCOPE/);
});

test('mixed metadata and draft active release are rejected; channel switch retains old catalog', async () => {
  const f = await schema([[]]);
  const r = await release(f);
  await rejects(`INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,'r0-meta-1',$3,$3)`, [randomUUID(), seedType, r], /METADATA_VERSION_MISMATCH/);
  await rejects('SELECT last_throne.activate_content_release($1,$2)', ['test', r], /RELEASE_NOT_PUBLISHED/);
  await query('SELECT last_throne.publish_content_release($1)', [r]);
  await query('SELECT last_throne.activate_content_release($1,$2)', ['test', r]);
  assert.equal((await query('SELECT release_id FROM last_throne.content_release_channels WHERE channel=$1', ['test'])).rows[0].release_id, r);
  assert.notEqual(await readContent(pool, 'r0-content-1'), null);
});

test('non-owner runtime role can read content but cannot write configuration or publish', async () => {
  const role = `r0_reader_${randomUUID().replaceAll('-', '')}`;
  await query(`CREATE ROLE ${role} NOLOGIN`);
  await query(`GRANT USAGE ON SCHEMA last_throne TO ${role}`);
  await query(`GRANT SELECT ON ALL TABLES IN SCHEMA last_throne TO ${role}`);
  await query(`SET ROLE ${role}`);
  try {
    assert.equal((await readContent(pool, 'r0-content-1')).contentVersion, 'r0-content-1');
    await rejects(`UPDATE last_throne.entity_types SET label='unauthorized' WHERE id=$1`, [seedType], /permission denied/);
    await rejects(`SELECT last_throne.activate_content_release('stable','r0-content-1')`, [], /permission denied/);
  } finally { await query('RESET ROLE'); }
});
