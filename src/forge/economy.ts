/** Exact workshop economics. Monetary values are thousandths of one gold. */
export const PRODUCTION_IDS = ['apprentice', 'smelter', 'press', 'alchemy'] as const;
export type ProductionId = (typeof PRODUCTION_IDS)[number];
export const FORGE_COUNT_MAX = 2_147_483_647;
export const FORGE_FRACTION_DENOMINATOR = 1_000_000n;
const GOLD_MAX_MILLI = 9_223_372_036_854_775_807n;

export interface ForgeProductionConfig {
  /** Whole gold, represented in goldMilli for the existing balance editor. */
  baseCostGoldMilli: string;
  rateGoldMilliPerSecond: string;
}
export interface ForgeConfig {
  productions: Record<ProductionId, ForgeProductionConfig>;
  priceGrowthPermille: number;
  tapGoldMilli: [string, string, string, string];
  tapUpgradeCostGoldMilli: [string, string, string];
  organizationPermille: [number, number, number, number];
  organizationUpgradeCostGoldMilli: [string, string, string];
  offlineCapSeconds: number;
  clockEveryKills: number;
  clockSeconds: number;
}
export interface ForgeState {
  counts: Record<ProductionId, number>;
  tapLevel: number;
  organizationLevel: number;
  settledAtMs: number;
  /** Remaining millionths of goldMilli: the denominator never changes. */
  fractionMillionths: string;
}
export interface ForgeBalanceHistoryEntry {
  revision: string;
  publishedAtMs: number;
  config: ForgeConfig;
}
export interface ForgeFractionResult { goldMilli: string; fractionMillionths: string; }
export interface ForgeSettlement {
  state: ForgeState;
  goldMilli: string;
  elapsedMs: number;
  creditedMs: number;
  discardedMs: number;
}

export const DEFAULT_FORGE_CONFIG: ForgeConfig = {
  productions: {
    apprentice: { baseCostGoldMilli: '25000', rateGoldMilliPerSecond: '50' },
    smelter: { baseCostGoldMilli: '250000', rateGoldMilliPerSecond: '600' },
    press: { baseCostGoldMilli: '2500000', rateGoldMilliPerSecond: '7000' },
    alchemy: { baseCostGoldMilli: '25000000', rateGoldMilliPerSecond: '80000' },
  },
  priceGrowthPermille: 1180,
  tapGoldMilli: ['1000', '2000', '4000', '8000'],
  tapUpgradeCostGoldMilli: ['100000', '500000', '2500000'],
  organizationPermille: [1000, 1250, 1500, 2000],
  organizationUpgradeCostGoldMilli: ['1000000', '10000000', '100000000'],
  offlineCapSeconds: 28_800,
  clockEveryKills: 10,
  clockSeconds: 30,
};

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid forge object');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid forge fields');
  return value;
}
function integer(input: unknown, max = Number.MAX_SAFE_INTEGER): asserts input is number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || input > max) throw new Error('Invalid forge integer');
}
function money(input: unknown): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]*)$/.test(input) || input.length > 19) throw new Error('Invalid forge money');
  const result = BigInt(input);
  if (result > GOLD_MAX_MILLI) throw new Error('Forge gold overflow');
  return result;
}
function fraction(input: unknown): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]*)$/.test(input) || input.length > 6) throw new Error('Invalid forge fraction');
  const result = BigInt(input);
  if (result >= FORGE_FRACTION_DENOMINATOR) throw new Error('Invalid forge fraction');
  return result;
}
function tuple(input: unknown, length: number): unknown[] {
  if (!Array.isArray(input) || input.length !== length) throw new Error('Invalid forge levels');
  return input;
}

export function validateForgeConfig(input: unknown): ForgeConfig {
  const value = object(input, ['productions', 'priceGrowthPermille', 'tapGoldMilli', 'tapUpgradeCostGoldMilli', 'organizationPermille', 'organizationUpgradeCostGoldMilli', 'offlineCapSeconds', 'clockEveryKills', 'clockSeconds']);
  const productions = object(value.productions, PRODUCTION_IDS);
  for (const id of PRODUCTION_IDS) {
    const entry = object(productions[id], ['baseCostGoldMilli', 'rateGoldMilliPerSecond']);
    if (money(entry.baseCostGoldMilli) % 1000n !== 0n) throw new Error('Production base price must be whole gold');
    money(entry.rateGoldMilliPerSecond);
  }
  integer(value.priceGrowthPermille, 10_000);
  if (value.priceGrowthPermille < 1000) throw new Error('Production price growth cannot decrease prices');
  for (const key of ['tapGoldMilli', 'tapUpgradeCostGoldMilli', 'organizationUpgradeCostGoldMilli'] as const) {
    for (const entry of tuple(value[key], key === 'tapGoldMilli' ? 4 : 3)) money(entry);
  }
  for (const entry of tuple(value.organizationPermille, 4)) {
    integer(entry, 100_000);
    if (entry < 1000) throw new Error('Organization multiplier cannot be below one');
  }
  integer(value.offlineCapSeconds, 604_800);
  if (value.offlineCapSeconds === 0) throw new Error('Offline cap must be positive');
  integer(value.clockEveryKills, 1000);
  if (value.clockEveryKills === 0) throw new Error('Clock kill interval must be positive');
  integer(value.clockSeconds, 3600);
  if (value.clockSeconds === 0) throw new Error('Clock seconds must be positive');
  return structuredClone(value) as unknown as ForgeConfig;
}

export function validateForgeState(input: unknown): ForgeState {
  const value = object(input, ['counts', 'tapLevel', 'organizationLevel', 'settledAtMs', 'fractionMillionths']);
  const counts = object(value.counts, PRODUCTION_IDS);
  for (const id of PRODUCTION_IDS) integer(counts[id], FORGE_COUNT_MAX);
  integer(value.tapLevel, 3);
  integer(value.organizationLevel, 3);
  integer(value.settledAtMs);
  fraction(value.fractionMillionths);
  return structuredClone(value) as unknown as ForgeState;
}

/** Exact goldMilli per second; numerator / 1000 includes organization. */
export function productionRate(config: ForgeConfig, state: ForgeState): { numerator: string; denominator: 1000 } {
  integer(state.organizationLevel, 3);
  let base = 0n;
  for (const id of PRODUCTION_IDS) {
    integer(state.counts[id], FORGE_COUNT_MAX);
    base += money(config.productions[id].rateGoldMilliPerSecond) * BigInt(state.counts[id]);
  }
  const multiplier = config.organizationPermille[state.organizationLevel]!;
  integer(multiplier, 100_000);
  if (multiplier < 1000) throw new Error('Organization multiplier cannot be below one');
  return { numerator: (base * BigInt(multiplier)).toString(), denominator: 1000 };
}

/** ceil(baseCostGold × (growth / 1000)^owned), then convert whole gold to goldMilli. */
export function productionPriceGoldMilli(config: ForgeConfig, id: ProductionId, owned: number): string | null {
  integer(owned, FORGE_COUNT_MAX);
  const baseMilli = money(config.productions[id].baseCostGoldMilli);
  if (baseMilli % 1000n !== 0n) throw new Error('Production base price must be whole gold');
  const baseGold = baseMilli / 1000n;
  const growth = config.priceGrowthPermille;
  integer(growth, 10_000);
  if (growth < 1000) throw new Error('Production price growth cannot decrease prices');
  if (baseGold === 0n) return '0';
  if (growth === 1000 || owned === 0) return (baseGold * 1000n).toString();
  // Bernoulli: (1 + delta/1000)^ceil(1000/delta) >= 2. Since
  // the wallet holds fewer than 2^54 whole gold, this exact bound rejects
  // overflow before attacker-supplied counts can create unbounded powers.
  const doublingGroup = Math.max(1, Math.ceil(1000 / (growth - 1000)));
  if (owned >= 54 * doublingGroup) return null;
  const exponent = BigInt(owned);
  const denominator = 1000n ** exponent;
  const numerator = baseGold * BigInt(growth) ** exponent;
  const wholeGold = (numerator + denominator - 1n) / denominator;
  const price = wholeGold * 1000n;
  return price > GOLD_MAX_MILLI ? null : price.toString();
}

/** Adds exact millionths of goldMilli; callers persist the returned remainder. */
export function addForgeFraction(fractionMillionths: string, numeratorMillionths: bigint): ForgeFractionResult {
  if (numeratorMillionths < 0n) throw new Error('Negative forge income');
  const total = fraction(fractionMillionths) + numeratorMillionths;
  const gold = total / FORGE_FRACTION_DENOMINATOR;
  if (gold > GOLD_MAX_MILLI) throw new Error('Forge gold overflow');
  return { goldMilli: gold.toString(), fractionMillionths: (total % FORGE_FRACTION_DENOMINATOR).toString() };
}

function validateHistory(history: readonly ForgeBalanceHistoryEntry[]): void {
  if (history.length === 0) throw new Error('Missing forge balance history');
  let previous = -1;
  for (const entry of history) {
    integer(entry.publishedAtMs);
    if (entry.publishedAtMs < previous || typeof entry.revision !== 'string' || entry.revision.length === 0) throw new Error('Invalid forge balance history');
    previous = entry.publishedAtMs;
    validateForgeConfig(entry.config);
  }
}

/**
 * One cap applies to the complete absence, using the cap active at its start.
 * Its earliest prefix is credited; later time is discarded and the marker still
 * advances to now. Each publication splits that prefix at its actual timestamp.
 * Purchases/upgrades must settle before changing counts or organization level.
 */
export function settleForge(state: ForgeState, history: readonly ForgeBalanceHistoryEntry[], nowMs: number): ForgeSettlement {
  const next = validateForgeState(state);
  integer(nowMs);
  validateHistory(history);
  const elapsedMs = Math.max(0, nowMs - state.settledAtMs);
  if (elapsedMs === 0) return { state: next, goldMilli: '0', elapsedMs: 0, creditedMs: 0, discardedMs: 0 };
  let activeIndex = -1;
  for (let index = 0; index < history.length && history[index]!.publishedAtMs <= state.settledAtMs; index++) activeIndex = index;
  if (activeIndex < 0) throw new Error('Missing historical forge balance');
  const creditedMs = Math.min(elapsedMs, history[activeIndex]!.config.offlineCapSeconds * 1000);
  const creditEnd = state.settledAtMs + creditedMs;
  let cursor = state.settledAtMs;
  let numerator = 0n;
  while (cursor < creditEnd) {
    const nextEntry = history[activeIndex + 1];
    const end = Math.min(creditEnd, nextEntry?.publishedAtMs ?? creditEnd);
    numerator += BigInt(productionRate(history[activeIndex]!.config, state).numerator) * BigInt(end - cursor);
    cursor = end;
    if (nextEntry && nextEntry.publishedAtMs <= cursor) activeIndex++;
  }
  const income = addForgeFraction(state.fractionMillionths, numerator);
  next.settledAtMs = nowMs;
  next.fractionMillionths = income.fractionMillionths;
  return { state: next, goldMilli: income.goldMilli, elapsedMs, creditedMs, discardedMs: elapsedMs - creditedMs };
}

/** Clock payout is extra income; it does not advance the production marker. */
export function bonusForSeconds(config: ForgeConfig, state: ForgeState, seconds: number, fractionMillionths = state.fractionMillionths): ForgeFractionResult {
  integer(seconds, Math.floor(Number.MAX_SAFE_INTEGER / 1000));
  return addForgeFraction(fractionMillionths, BigInt(productionRate(config, state).numerator) * BigInt(seconds) * 1000n);
}
