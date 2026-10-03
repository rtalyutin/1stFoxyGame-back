import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REWARD_CATALOG, rewardFor, validateRewardCatalog } from '../dist/game/rewards.js';
import { economyId, economySeedSql } from '../dist/db/economy-seed.js';

test('R34 exact rewards and component definitions come from one immutable versioned source', () => {
  assert.deepEqual(REWARD_CATALOG, JSON.parse(readFileSync(new URL('../content/rewards.json', import.meta.url), 'utf8')));
  assert.deepEqual(REWARD_CATALOG.components.map((component) => component.id), ['steel', 'ember', 'core']);
  assert.equal(rewardFor('normal').baseGoldMilli, '5000');
  assert.equal(rewardFor('strong').baseGoldMilli, '20000');
  assert.equal(rewardFor('boss').baseGoldMilli, '100000');
  assert.deepEqual(REWARD_CATALOG.rewards.map((reward) => [reward.commonDrops, reward.coreDrops, reward.steelProbability]), [[0,0,.5],[1,0,.5],[2,1,.5]]);
  assert.ok(Object.isFrozen(REWARD_CATALOG));
  assert.ok(Object.isFrozen(rewardFor('boss')));
  assert.throws(() => { rewardFor('boss').baseGoldMilli = '0'; }, TypeError);
});

test('reward validator rejects forged properties, sources, fractional money and overflow', () => {
  for (const mutate of [
    (catalog) => { catalog.rewards[0].baseGoldMilli = '5.5'; },
    (catalog) => { catalog.rewards[0].baseGoldMilli = '9223372036854775808'; },
    (catalog) => { catalog.rewards[0].baseGoldMilli = '-1'; },
    (catalog) => { catalog.rewards[0].bossHits = 1; },
    (catalog) => { catalog.rewards[0].kind = 'boss'; },
    (catalog) => { catalog.components[0].id = 'gem'; },
    (catalog) => { catalog.rewards[0].commonDrops = 1; },
    (catalog) => { catalog.rewards[1].coreDrops = 1; },
    (catalog) => { catalog.rewards[2].commonDrops = 3; },
    (catalog) => { catalog.rewards[2].coreDrops = .5; },
    (catalog) => { catalog.rewards[2].steelProbability = Number.NaN; },
    (catalog) => { catalog.rewards[2].steelProbability = 1.1; },
    (catalog) => { catalog.version = 'unversioned'; },
  ]) {
    const catalog = structuredClone(REWARD_CATALOG); mutate(catalog);
    assert.throws(() => validateRewardCatalog(catalog));
  }
});

test('generated economy migration exactly matches catalog, uses deterministic UUIDs and escapes labels', () => {
  assert.equal(economySeedSql(), readFileSync(new URL('../migrations/004-economy.sql', import.meta.url), 'utf8'));
  assert.match(economyId('type:reward-definition'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(economyId('type:reward-definition'), economyId('type:component-definition'));
  const edited = structuredClone(REWARD_CATALOG); edited.components[0].label = "Smith's steel";
  const seed = economySeedSql(edited);
  assert.ok(seed.includes("'Smith''s steel'"));
  assert.notEqual(seed, economySeedSql());
  const nextVersion = structuredClone(REWARD_CATALOG);
  nextVersion.version = 'r34.2'; nextVersion.rewards[0].baseGoldMilli = '5001';
  const update = economySeedSql(nextVersion, false);
  assert.ok(update.includes(economyId('entity:reward-definition:r34.2:normal')));
  assert.ok(!update.includes('INSERT INTO entity_types'));
  assert.ok(!update.includes('CREATE FUNCTION'));
  assert.equal(REWARD_CATALOG.version, 'r34.1');
  assert.equal(rewardFor('normal').baseGoldMilli, '5000');
});
