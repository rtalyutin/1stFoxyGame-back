// Proposed independent acceptance test. Copy verbatim to backend test/db/.
// Actual PostgreSQL is required; this interrupts an SQL write, not a process.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Client, Pool } from 'pg';
import { migrate } from '../../dist/db/migrate.js';
import { PgRepository } from '../../dist/profile/repository.js';
import { ProfileService } from '../../dist/profile/service.js';
import { hashPassword } from '../../dist/profile/auth.js';
import { RunSimulation } from '../../dist/combat/simulation.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('A41 requires actual PostgreSQL DATABASE_URL; it is never skipped.');
const quote = value => `"${value.replaceAll('"', '""')}"`;
const NOTICE = 'A41_SQL_KILL_BEFORE_COMMIT_CONFIRMED';
const targetId = 'a41-reward-target';
const hasAliveTarget = run => run.snapshot.state.enemies.some(enemy => enemy.id === targetId && enemy.status === 'alive');

test('A41 actual SQL interruption immediately after kill restores coherent wallet/enemy and rewards once', async t => {
  const admin = new Client({ connectionString });
  await admin.connect();
  const schema = `foxy_a41_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${quote(schema)}`);
  const pools = [];
  let probe;
  const newPool = () => {
    const item = { pool: new Pool({ connectionString, options: `-c search_path=${schema},public`, max: 4 }), closed: false };
    pools.push(item);
    return item;
  };
  const closePool = async item => { await item.pool.end(); item.closed = true; };
  t.after(async () => {
    if (probe) { probe.release(); probe = null; }
    for (const item of pools) if (!item.closed) await closePool(item);
    await admin.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await admin.end();
  });

  const notices = [];
  const first = newPool();
  first.pool.on('connect', client => client.on('notice', notice => notices.push(notice.message)));
  probe = await first.pool.connect();
  const serverVersion = (await probe.query('SHOW server_version')).rows[0].server_version;
  assert.match(serverVersion, /^18\./);
  await migrate(probe);
  const repo = new PgRepository(first.pool);
  const accountId = randomUUID(), clientId = randomUUID(), runId = randomUUID();
  await repo.provision([{
    accountId,
    login: `a41_${randomUUID().slice(0, 8)}`,
    passwordHash: await hashPassword('a41-synthetic-test-access-only'),
  }]);
  const now = Date.now();
  const sim = new RunSimulation(runId, 41, {
    config: { spawning: false },
    initialEnemies: [{ id: targetId, x: 0, z: 4 }],
  });
  await repo.transaction(accountId, tx => {
    tx.run = {
      runId, snapshot: sim.exportSnapshot(), ownerClientId: clientId, ownerEpoch: 1,
      updatedAt: new Date(now).toISOString(), wallAnchorMs: now - 10_000,
      simAnchorTime: 0, rewardedEnemyIds: [], statsCommitted: false,
      loot: { goldMilli: '0', components: { steel: 0, ember: 0, core: 0 } },
    };
  });
  const beforeProfile = await repo.getProfile(accountId), beforeRun = await repo.getRun(accountId);
  assert.equal(beforeProfile.goldMilli, '0');
  assert.equal(hasAliveTarget(beforeRun), true);
  const operation = {
    operationId: randomUUID(), expectedRevision: beforeProfile.revision, clientId, type: 'advance_run',
    payload: { runId, ownerEpoch: 1, frames: Array.from({ length: 120 }, (_, index) => index === 0 ? [{ type: 'cast', aim: { x: 0, z: 20 } }] : []) },
  };

  // This is installed only in the synthetic schema. The receipt INSERT is after
  // wallet and run writes. Prove the kill has reached all those SQL records,
  // then abort that same transaction before its receipt/COMMIT can persist.
  await probe.query(`CREATE FUNCTION a41_interrupt_after_kill() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE observed_gold numeric; observed_loot numeric; observed_snapshot jsonb; observed_ids text[];
    BEGIN
      IF NEW.operation_id = '${operation.operationId}'::uuid THEN
        SELECT money.value_decimal INTO observed_gold
          FROM entity_parameter_values money
          JOIN entity_parameters money_parameter ON money_parameter.id=money.parameter_id AND money_parameter.code='gold-milli'
          JOIN entity_types profile_type ON profile_type.id=money_parameter.entity_type_id AND profile_type.code='profile'
          JOIN entity_parameter_values owner_value ON owner_value.entity_id=money.entity_id
          JOIN entity_parameters owner_parameter ON owner_parameter.id=owner_value.parameter_id AND owner_parameter.code='owner'
          WHERE owner_value.value_reference=NEW.account_id;
        SELECT snapshot,loot_gold_milli,rewarded_enemy_ids INTO observed_snapshot,observed_loot,observed_ids
          FROM profile_runs WHERE account_id=NEW.account_id AND run_id='${runId}'::uuid;
        IF observed_gold IS DISTINCT FROM 5000 OR observed_loot IS DISTINCT FROM 5000
          OR NOT coalesce(observed_ids @> ARRAY['${targetId}']::text[],false)
          OR (observed_snapshot #>> '{state,kills,normal}') IS DISTINCT FROM '1'
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(observed_snapshot #> '{state,enemies}') enemy
            WHERE enemy->>'id'='${targetId}' AND enemy->>'status'='alive')
          OR (NEW.result #>> '{profile,goldMilli}') IS DISTINCT FROM '5000'
          OR (NEW.result #>> '{run,loot,goldMilli}') IS DISTINCT FROM '5000' THEN
          RAISE EXCEPTION 'A41 setup did not reach coherent post-kill SQL boundary';
        END IF;
        RAISE NOTICE '${NOTICE}';
        RAISE EXCEPTION 'A41 injected SQL write interruption after kill before commit';
      END IF;
      RETURN NEW;
    END $$`);
  await probe.query('CREATE TRIGGER a41_interrupt_after_kill BEFORE INSERT ON profile_operations FOR EACH ROW EXECUTE FUNCTION a41_interrupt_after_kill()');
  try {
    await assert.rejects(new ProfileService(repo, () => now).perform(accountId, operation), error => error.code === 'PROFILE_STORAGE_UNAVAILABLE');
    assert.equal(notices.filter(message => message === NOTICE).length, 1, 'The real SQL trigger observed coherent kill writes before interrupting them.');
    assert.deepEqual(await repo.getProfile(accountId), beforeProfile);
    assert.deepEqual(await repo.getRun(accountId), beforeRun);
    assert.equal(await repo.getOperation(accountId, operation.operationId), null);
  } finally {
    await probe.query('DROP TRIGGER a41_interrupt_after_kill ON profile_operations');
    await probe.query('DROP FUNCTION a41_interrupt_after_kill()');
  }

  probe.release(); probe = null;
  await closePool(first);
  const reopened = newPool(), recoveredRepo = new PgRepository(reopened.pool);
  const recoveredProfile = await recoveredRepo.getProfile(accountId), recoveredRun = await recoveredRepo.getRun(accountId);
  assert.deepEqual(recoveredProfile, beforeProfile);
  assert.deepEqual(recoveredRun, beforeRun);
  assert.equal(hasAliveTarget(recoveredRun), true);
  assert.equal(recoveredRun.rewardedEnemyIds.includes(targetId), false);
  assert.equal(await recoveredRepo.getOperation(accountId, operation.operationId), null);

  const recoveredService = new ProfileService(recoveredRepo, () => now);
  const committed = await recoveredService.perform(accountId, operation);
  assert.equal(committed.replayed, false);
  assert.equal(committed.profile.goldMilli, '5000');
  assert.equal(committed.profile.stats.totalKills, beforeProfile.stats.totalKills + 1);
  assert.equal(committed.run.loot.goldMilli, '5000');
  const committedRun = await recoveredRepo.getRun(accountId);
  assert.equal(hasAliveTarget(committedRun), false);
  assert.equal(committedRun.rewardedEnemyIds.filter(id => id === targetId).length, 1);
  assert.equal(committedRun.snapshot.state.kills.normal, 1);
  assert.equal(committedRun.ownerClientId, clientId);
  assert.equal(committedRun.ownerEpoch, 1);
  assert.deepEqual((await recoveredRepo.getOperation(accountId, operation.operationId)).result, committed);

  const repeated = await recoveredService.perform(accountId, structuredClone(operation));
  assert.equal(repeated.replayed, true);
  assert.deepEqual(repeated.profile, committed.profile);
  assert.deepEqual(await recoveredRepo.getProfile(accountId), committed.profile);
  assert.deepEqual(await recoveredRepo.getRun(accountId), committedRun);
  const advanced = await recoveredService.perform(accountId, {
    operationId: randomUUID(), expectedRevision: committed.profile.revision, clientId, type: 'advance_run',
    payload: { runId, ownerEpoch: 1, frames: [[]] },
  });
  assert.equal(advanced.profile.goldMilli, '5000');
  assert.equal(advanced.profile.stats.totalKills, committed.profile.stats.totalKills);
  assert.equal(advanced.run.loot.goldMilli, '5000');
  const finalRun = await recoveredRepo.getRun(accountId);
  assert.equal(hasAliveTarget(finalRun), false);
  assert.equal(finalRun.rewardedEnemyIds.filter(id => id === targetId).length, 1);
  t.diagnostic(`Actual PostgreSQL ${serverVersion}: post-kill SQL boundary observed; aborted write, new pool recovery, same operation retry/replay, and no rewarded enemy resurrection.`);
});
