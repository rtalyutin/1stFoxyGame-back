import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import { migrate, readMigrations } from '../../dist/db/migrate.js';
import { economyId, economySeedSql, ECONOMY_TYPES } from '../../dist/db/economy-seed.js';
import { REWARD_CATALOG } from '../../dist/game/rewards.js';
import { EntityStore } from '../../dist/db/entity-store.js';
import { PgRepository } from '../../dist/profile/repository.js';
import { hashPassword } from '../../dist/profile/auth.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required; real economy migration tests are never skipped.');
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const entityId = (type, code) => economyId(`entity:${type}:r34.1:${code}`);
async function atomic(client, action) {
  await client.query('BEGIN');
  try { await action(); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

test('PostgreSQL 18 reward migration preserves prior property, exact typed seed and constraints', async (t) => {
  const admin = new Client({ connectionString: url }); await admin.connect();
  assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^18\./);
  const schema = `foxy_economy_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${quote(schema)}`); await admin.query(`SET search_path TO ${quote(schema)},public`);
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
  const repository = new PgRepository(pool);
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await admin.end(); });
  const migrations = readMigrations();
  await migrate(admin, migrations.filter((migration) => migration.id < '004-economy.sql'));
  const accountId = randomUUID();
  await repository.provision([{ accountId, login: `economy_${accountId.replaceAll('-', '')}`, passwordHash: await hashPassword('synthetic-only-test-password') }]);
  // Seed the old 001–003 authority directly: the current repository's run transaction
  // intentionally requires the new balance columns and cannot emulate an old app.
  await atomic(admin, async () => {
    const profileId = (await admin.query("SELECT v.entity_id FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entity_types t ON t.id=v.entity_type_id WHERE t.code='profile' AND p.code='owner' AND v.value_reference=$1", [accountId])).rows[0].entity_id;
    const store = new EntityStore(admin);
    await store.set(profileId, 'gold-milli', { type: 'decimal', value: '123456' });
    for (const [code, value] of Object.entries({ steel: 4, ember: 5, core: 6 })) await store.set(profileId, code, { type: 'integer', value: BigInt(value) });
    await admin.query('UPDATE entities SET revision=3 WHERE id=$1', [profileId]);
  });
  const profile = await repository.getProfile(accountId);
  assert.deepEqual(await migrate(admin), ['004-economy.sql','005-balance.sql','006-forge.sql']);
  assert.deepEqual(await migrate(admin), []);
  assert.deepEqual(await repository.getProfile(accountId), profile);
  await repository.readiness();

  await t.test('all six active definitions retain scalar types, labels, version and source values', async () => {
    const count = await admin.query("SELECT count(*)::int AS n FROM entities e JOIN entity_types t ON t.id=e.entity_type_id WHERE t.code=ANY($1::text[]) AND e.state='active'", [ECONOMY_TYPES]);
    assert.equal(count.rows[0].n, 6);
    const values = async (type, code) => (await admin.query('SELECT p.code,v.data_type,v.value_text,v.value_integer,v.value_decimal FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 ORDER BY p.code', [entityId(type, code)])).rows;
    for (const component of REWARD_CATALOG.components) {
      const rows = await values('component-definition', component.id);
      assert.deepEqual(rows.map((row) => [row.code, row.data_type, row.value_text]), [['code','text',component.id],['label','text',component.label],['version','text','r34.1']]);
    }
    for (const reward of REWARD_CATALOG.rewards) {
      const rows = await values('reward-definition', reward.kind);
      const value = Object.fromEntries(rows.map((row) => [row.code, row.value_text ?? row.value_integer ?? row.value_decimal]));
      assert.deepEqual(value, { 'base-gold-milli': reward.baseGoldMilli, code: reward.kind, 'common-drops': String(reward.commonDrops), 'core-drops': String(reward.coreDrops), 'steel-probability': String(reward.steelProbability), version: 'r34.1' });
      assert.equal(rows.find((row) => row.code === 'base-gold-milli').data_type, 'decimal');
      assert.equal(rows.find((row) => row.code === 'common-drops').data_type, 'integer');
    }
  });

  await t.test('direct typed writes cannot create fractional/negative/overflowing gold or invalid drops', async () => {
    const store = new EntityStore(admin), boss = entityId('reward-definition', 'boss');
    for (const value of ['0.5', '-1', '9223372036854775808']) {
      await assert.rejects(atomic(admin, () => store.set(boss, 'base-gold-milli', { type: 'decimal', value })), (error) => error.code === '23514');
    }
    await assert.rejects(atomic(admin, () => store.set(boss, 'common-drops', { type: 'integer', value: 3n })), (error) => error.code === '23514');
    await assert.rejects(atomic(admin, () => store.set(boss, 'steel-probability', { type: 'decimal', value: '1.1' })), (error) => error.code === '23514');
    await assert.rejects(atomic(admin, () => admin.query('DELETE FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2', [boss, economyId('parameter:reward-definition:version')])), (error) => error.code === '23514');
    await assert.rejects(atomic(admin, () => store.set(boss, 'code', { type: 'text', value: 'unknown' })), (error) => error.code === '23514');
    assert.deepEqual(await repository.getProfile(accountId), profile);
  });

  await t.test('new version coexists without resetting the previous reward snapshot or profile', async () => {
    const next = structuredClone(REWARD_CATALOG); next.version = 'r34.2'; next.rewards[0].baseGoldMilli = '5001';
    await atomic(admin, () => admin.query(economySeedSql(next, false)));
    const previous = await admin.query('SELECT value_decimal FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2', [entityId('reward-definition', 'normal'), economyId('parameter:reward-definition:base-gold-milli')]);
    const current = await admin.query('SELECT value_decimal FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2', [economyId('entity:reward-definition:r34.2:normal'), economyId('parameter:reward-definition:base-gold-milli')]);
    assert.equal(previous.rows[0].value_decimal, '5000'); assert.equal(current.rows[0].value_decimal, '5001');
    await assert.rejects(atomic(admin, () => admin.query(economySeedSql(next, false))), (error) => error.code === '23505');
    assert.deepEqual(await repository.getProfile(accountId), profile);
    await repository.readiness();
  });
});
