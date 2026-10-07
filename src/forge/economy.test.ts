import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_FORGE_CONFIG, FORGE_COUNT_MAX, PRODUCTION_IDS,
  addForgeFraction, bonusForSeconds, productionPriceGoldMilli, productionRate,
  settleForge, validateForgeConfig, validateForgeState,
  type ForgeBalanceHistoryEntry, type ForgeConfig, type ForgeState,
} from './economy.js';

function config(): ForgeConfig { return structuredClone(DEFAULT_FORGE_CONFIG); }
function state(overrides: Partial<ForgeState> = {}): ForgeState {
  return { counts: { apprentice: 1, smelter: 0, press: 0, alchemy: 0 }, tapLevel: 0, organizationLevel: 0, settledAtMs: 0, fractionMillionths: '0', ...overrides };
}
function history(entryConfig = config()): ForgeBalanceHistoryEntry[] {
  return [{ revision: 'initial', publishedAtMs: 0, config: entryConfig }];
}

test('accepted original prices, rates, upgrade levels and clock values are exact', () => {
  const c = validateForgeConfig(DEFAULT_FORGE_CONFIG);
  assert.deepEqual(PRODUCTION_IDS.map(id => c.productions[id]), [
    { baseCostGoldMilli: '25000', rateGoldMilliPerSecond: '50' },
    { baseCostGoldMilli: '250000', rateGoldMilliPerSecond: '600' },
    { baseCostGoldMilli: '2500000', rateGoldMilliPerSecond: '7000' },
    { baseCostGoldMilli: '25000000', rateGoldMilliPerSecond: '80000' },
  ]);
  assert.equal(c.priceGrowthPermille, 1180);
  assert.deepEqual(c.tapGoldMilli, ['1000', '2000', '4000', '8000']);
  assert.deepEqual(c.tapUpgradeCostGoldMilli, ['100000', '500000', '2500000']);
  assert.deepEqual(c.organizationPermille, [1000, 1250, 1500, 2000]);
  assert.deepEqual(c.organizationUpgradeCostGoldMilli, ['1000000', '10000000', '100000000']);
  assert.equal(c.offlineCapSeconds, 8 * 60 * 60);
  assert.equal(c.clockEveryKills, 10);
  assert.equal(c.clockSeconds, 30);
});

test('production prices round only the exact final gold price', () => {
  const c = config();
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(n => productionPriceGoldMilli(c, 'apprentice', n)),
    ['25000', '30000', '35000', '42000', '49000', '58000', '68000']);
  assert.equal(productionPriceGoldMilli(c, 'smelter', 1), '295000');
  assert.equal(productionPriceGoldMilli(c, 'press', 1), '2950000');
  assert.equal(productionPriceGoldMilli(c, 'alchemy', 1), '29500000');
});

test('zero cost and constant growth remain exact even at the count boundary', () => {
  const c = config();
  c.productions.apprentice.baseCostGoldMilli = '0';
  assert.equal(productionPriceGoldMilli(c, 'apprentice', FORGE_COUNT_MAX), '0');
  c.priceGrowthPermille = 1000;
  assert.equal(productionPriceGoldMilli(c, 'alchemy', FORGE_COUNT_MAX), '25000000');
});

test('price boundaries reject overflow rather than wrap or silently clamp', () => {
  const c = config();
  c.productions.apprentice.baseCostGoldMilli = '9223372036854775000';
  assert.equal(productionPriceGoldMilli(c, 'apprentice', 0), '9223372036854775000');
  assert.equal(productionPriceGoldMilli(c, 'apprentice', 1), null);
  assert.equal(productionPriceGoldMilli(c, 'alchemy', FORGE_COUNT_MAX), null);
  c.priceGrowthPermille = 1001;
  c.productions.apprentice.baseCostGoldMilli = '1000';
  assert.equal(productionPriceGoldMilli(c, 'apprentice', 54_000), null);
  assert.throws(() => productionPriceGoldMilli(c, 'apprentice', FORGE_COUNT_MAX + 1));
  assert.throws(() => productionPriceGoldMilli(c, 'apprentice', -1));
});

test('organization replaces the previous multiplier and combines all production', () => {
  const s = state({ counts: { apprentice: 1, smelter: 1, press: 1, alchemy: 1 } });
  assert.deepEqual([0, 1, 2, 3].map(level => productionRate(config(), { ...s, organizationLevel: level })), [
    { numerator: '87650000', denominator: 1000 },
    { numerator: '109562500', denominator: 1000 },
    { numerator: '131475000', denominator: 1000 },
    { numerator: '175300000', denominator: 1000 },
  ]);
});

test('submillisecond monetary fractions are preserved exactly', () => {
  const s = state({ organizationLevel: 1 });
  const first = settleForge(s, history(), 1);
  assert.equal(first.goldMilli, '0');
  assert.equal(first.state.fractionMillionths, '62500');
  const second = settleForge(first.state, history(), 16);
  assert.equal(second.goldMilli, '1');
  assert.equal(second.state.fractionMillionths, '0');
  const oneSecond = settleForge(s, history(), 1000);
  assert.equal(oneSecond.goldMilli, '62');
  assert.equal(oneSecond.state.fractionMillionths, '500000');
});

test('publications change future income while preserving past intervals', () => {
  const second = config(), third = config();
  second.productions.apprentice.rateGoldMilliPerSecond = '100';
  third.productions.apprentice.rateGoldMilliPerSecond = '20';
  const revisions = [
    ...history(),
    { revision: 'second', publishedAtMs: 4000, config: second },
    { revision: 'third', publishedAtMs: 7000, config: third },
  ];
  const result = settleForge(state(), revisions, 10_000);
  assert.equal(result.goldMilli, '560');
  assert.equal(result.state.fractionMillionths, '0');
  assert.equal(result.creditedMs, 10_000);
});

test('a publication at the settlement boundary applies starting at that boundary', () => {
  const c = config();
  c.productions.apprentice.rateGoldMilliPerSecond = '100';
  const revisions = [...history(), { revision: 'new', publishedAtMs: 1000, config: c }];
  assert.equal(settleForge(state(), revisions, 1000).goldMilli, '50');
  assert.equal(settleForge(state({ settledAtMs: 1000 }), revisions, 2000).goldMilli, '100');
});

test('same-millisecond publications use the last ordered committed revision', () => {
  const first = config(), last = config();
  first.productions.apprentice.rateGoldMilliPerSecond = '100';
  last.productions.apprentice.rateGoldMilliPerSecond = '200';
  const revisions = [...history(),
    { revision: 'first', publishedAtMs: 1000, config: first },
    { revision: 'last', publishedAtMs: 1000, config: last },
  ];
  assert.equal(settleForge(state(), revisions, 2000).goldMilli, '250');
  assert.equal(settleForge(state({ settledAtMs: 1000 }), revisions, 2000).goldMilli, '200');
});

test('one eight-hour prefix is credited across publications, and discarded time cannot be reclaimed', () => {
  const c = config();
  c.productions.apprentice.rateGoldMilliPerSecond = '100';
  const revisions = [...history(), { revision: 'six-hours', publishedAtMs: 6 * 3_600_000, config: c }];
  const now = 30 * 3_600_000;
  const result = settleForge(state(), revisions, now);
  assert.equal(result.goldMilli, '1800000'); // 6 h × .05 + 2 h × .1 gold/s.
  assert.equal(result.creditedMs, 8 * 3_600_000);
  assert.equal(result.discardedMs, 22 * 3_600_000);
  assert.equal(result.state.settledAtMs, now);
  assert.equal(settleForge(result.state, revisions, now).goldMilli, '0');
  assert.equal(settleForge(result.state, revisions, now + 1000).goldMilli, '100');
});

test('cap changes preserve the policy at absence start instead of granting one cap per revision', () => {
  const c = config();
  c.offlineCapSeconds = 3600;
  c.productions.apprentice.rateGoldMilliPerSecond = '100';
  const revisions = [...history(), { revision: 'smaller-cap', publishedAtMs: 2 * 3_600_000, config: c }];
  const first = settleForge(state(), revisions, 30 * 3_600_000);
  assert.equal(first.creditedMs, 8 * 3_600_000);
  assert.equal(first.goldMilli, '2520000');
  const second = settleForge(first.state, revisions, 32 * 3_600_000);
  assert.equal(second.creditedMs, 3_600_000);
  assert.equal(second.discardedMs, 3_600_000);
  assert.equal(second.goldMilli, '360000');
});

test('frequent active settlements have no eight-hour daily cap', () => {
  let s = state();
  let gold = 0n;
  for (let hour = 1; hour <= 24; hour++) {
    const result = settleForge(s, history(), hour * 3_600_000);
    gold += BigInt(result.goldMilli);
    assert.equal(result.discardedMs, 0);
    s = result.state;
  }
  assert.equal(gold, 4_320_000n);
});

test('clock rollback never regresses the persisted marker or refunds the same interval', () => {
  const s = state({ settledAtMs: 10_000, fractionMillionths: '500000' });
  const result = settleForge(s, history(), 9000);
  assert.deepEqual(result, { state: s, goldMilli: '0', elapsedMs: 0, creditedMs: 0, discardedMs: 0 });
  assert.equal(settleForge(result.state, history(), 11_000).goldMilli, '50');
  assert.equal(s.settledAtMs, 10_000);
});

test('zero production advances the marker without inventing gold or dropping fractions', () => {
  const s = state({ counts: { apprentice: 0, smelter: 0, press: 0, alchemy: 0 }, fractionMillionths: '999999' });
  const result = settleForge(s, history(), 1000);
  assert.equal(result.goldMilli, '0');
  assert.equal(result.creditedMs, 1000);
  assert.equal(result.discardedMs, 0);
  assert.equal(result.state.settledAtMs, 1000);
  assert.equal(result.state.fractionMillionths, '999999');
  assert.equal(settleForge(state({ counts: { apprentice: 0, smelter: 0, press: 0, alchemy: 0 } }), history(), 28_800_000).goldMilli, '0');
});

test('settlement before a purchase prevents newly bought production from earning past income', () => {
  const before = state({ counts: { apprentice: 0, smelter: 0, press: 0, alchemy: 0 } });
  const settled = settleForge(before, history(), 10_000);
  assert.equal(settled.goldMilli, '0');
  const bought = { ...settled.state, counts: { ...settled.state.counts, apprentice: 1 } };
  assert.equal(settleForge(bought, history(), 11_000).goldMilli, '50');
});

test('clock adds thirty seconds at the current rate without moving normal accrual time', () => {
  const s = state({ organizationLevel: 1, settledAtMs: 1234, fractionMillionths: '500000' });
  assert.deepEqual(bonusForSeconds(config(), s, 30), { goldMilli: '1875', fractionMillionths: '500000' });
  assert.equal(s.settledAtMs, 1234);
  assert.equal(s.fractionMillionths, '500000');
  const c = config();
  c.productions.apprentice.rateGoldMilliPerSecond = '100';
  assert.equal(bonusForSeconds(c, s, 30).goldMilli, '3750');
  assert.equal(settleForge(s, history(), 2234).goldMilli, '63');
});

test('fraction accumulation and overflow use exact integer arithmetic', () => {
  assert.deepEqual(addForgeFraction('999999', 1n), { goldMilli: '1', fractionMillionths: '0' });
  assert.deepEqual(addForgeFraction('0', 9_223_372_036_854_775_807n * 1_000_000n), { goldMilli: '9223372036854775807', fractionMillionths: '0' });
  assert.throws(() => addForgeFraction('0', 9_223_372_036_854_775_808n * 1_000_000n));
  assert.throws(() => addForgeFraction('0', -1n));
  assert.throws(() => addForgeFraction('1000000', 0n));
});

test('partitioning time does not lose gold or fractions across arbitrary publications', () => {
  const revisions = history();
  for (let index = 1; index <= 15; index++) {
    const c = config();
    c.productions.apprentice.rateGoldMilliPerSecond = String(index * 19 + 1);
    c.productions.smelter.rateGoldMilliPerSecond = String(index * 31 + 3);
    c.organizationPermille[2] = 1000 + index * 23;
    revisions.push({ revision: `revision-${index}`, publishedAtMs: index * 997, config: c });
  }
  const initial = state({ counts: { apprentice: 7, smelter: 3, press: 0, alchemy: 0 }, organizationLevel: 2, fractionMillionths: '912345' });
  const once = settleForge(initial, revisions, 20_000);
  let s = initial, gold = 0n, cursor = 0, random = 12345;
  while (cursor < 20_000) {
    random = (random * 1664525 + 1013904223) >>> 0;
    cursor = Math.min(20_000, cursor + random % 211 + 1);
    const part = settleForge(s, revisions, cursor);
    gold += BigInt(part.goldMilli);
    s = part.state;
  }
  assert.equal(gold.toString(), once.goldMilli);
  assert.equal(s.fractionMillionths, once.state.fractionMillionths);
  assert.equal(s.settledAtMs, once.state.settledAtMs);
});

test('mutating future revisions cannot change an earlier settlement', () => {
  const c = config();
  c.productions.apprentice.rateGoldMilliPerSecond = '9223372036854775807';
  c.organizationPermille[0] = 100_000;
  const earlier = settleForge(state(), history(), 999);
  const withFuture = settleForge(state(), [...history(), { revision: 'future', publishedAtMs: 1000, config: c }], 999);
  assert.deepEqual(withFuture, earlier);
});

test('config and persisted state reject malformed or unsupported values', () => {
  for (const invalid of [null, {}, { ...config(), extra: 1 }, { ...config(), priceGrowthPermille: 999 }, { ...config(), clockEveryKills: 0 }, { ...config(), offlineCapSeconds: 0.5 }, { ...config(), organizationPermille: [1000, 1250] }]) {
    assert.throws(() => validateForgeConfig(invalid));
  }
  const fractionalCost = config();
  fractionalCost.productions.apprentice.baseCostGoldMilli = '25001';
  assert.throws(() => validateForgeConfig(fractionalCost));
  const invalidMoney = config();
  invalidMoney.tapGoldMilli[0] = '01';
  assert.throws(() => validateForgeConfig(invalidMoney));
  for (const invalid of [null, {}, { ...state(), organizationLevel: 4 }, { ...state(), tapLevel: 4 }, { ...state(), settledAtMs: -1 }, { ...state(), fractionMillionths: '1000000' }, { ...state(), counts: { ...state().counts, apprentice: FORGE_COUNT_MAX + 1 } }]) {
    assert.throws(() => validateForgeState(invalid));
  }
  assert.throws(() => settleForge(state(), [], 1000));
  assert.throws(() => settleForge(state(), [{ revision: 'late-only', publishedAtMs: 1, config: config() }], 1000));
  assert.throws(() => settleForge(state(), [...history(), { revision: 'out-of-order', publishedAtMs: 10, config: config() }, { revision: 'earlier', publishedAtMs: 5, config: config() }], 1000));
  assert.throws(() => settleForge(state(), history(), Number.MAX_SAFE_INTEGER + 1));
});
