import { readFileSync } from 'node:fs';
import type { ComponentId, Components, ConsumableId, ConsumableDefinition, EquipmentCatalog, EquipmentModifiers, GoldMilli, ItemDefinition, ItemDefinitionId, ItemInstance, Profile, Recipe, Slot } from './contracts.js';
export type * from './contracts.js';

/** Exact wallet limits align with PostgreSQL signed bigint / component integer columns. */
export const GOLD_MAX_MILLI = '9223372036854775807';
export const COMPONENT_MAX = 2147483647;
export const EQUIPMENT_SLOTS: readonly Slot[] = Object.freeze(['weapon', 'body', 'legs', 'talisman']);
export const COMPONENT_IDS: readonly ComponentId[] = Object.freeze(['steel', 'ember', 'core']);
export const CONSUMABLE_IDS: readonly ConsumableId[] = Object.freeze(['slow_dust', 'collector_vial']);
export const BASE_MODIFIERS: Readonly<EquipmentModifiers> = Object.freeze({
  rangeMultiplier: 1, outboundSpeedMultiplier: 1, returnSpeedMultiplier: 1,
  cooldown: 2, lateralSpeedMultiplier: 1, pierceTargets: 1, returnHitTargets: 0, goldMultiplierMilli: 1000,
});
const ITEM_RULES = {
  fast_reel: { slot: 'weapon', hero: 'pudge', levels: 3, keys: ['returnSpeedMultiplier', 'cooldown'] },
  long_link: { slot: 'weapon', hero: 'pudge', levels: 1, keys: ['rangeMultiplier', 'outboundSpeedMultiplier'] },
  piercing_tooth: { slot: 'weapon', hero: 'pudge', levels: 1, keys: ['pierceTargets'] },
  return_sickle: { slot: 'weapon', hero: 'pudge', levels: 1, keys: ['returnHitTargets'] },
  conductor_cuffs: { slot: 'body', hero: 'all', levels: 3, keys: ['outboundSpeedMultiplier'] },
  side_step_boots: { slot: 'legs', hero: 'all', levels: 3, keys: ['lateralSpeedMultiplier'] },
  trophy_counter: { slot: 'talisman', hero: 'all', levels: 3, keys: ['goldMultiplierMilli'] },
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(input: unknown, keys: readonly string[]): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected equipment object');
  const actual = Object.keys(input);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error('Unexpected or missing equipment field');
}
function integer(input: unknown, max = COMPONENT_MAX): asserts input is number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || input > max) throw new Error('Invalid nonnegative integer');
}
function finite(input: unknown, minimum: number, maximum: number): asserts input is number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < minimum || input > maximum) throw new Error('Invalid equipment number');
}
function nonempty(input: unknown): asserts input is string {
  if (typeof input !== 'string' || input.trim().length < 1 || input.length > 128) throw new Error('Invalid equipment name');
}
function id(input: unknown): asserts input is string {
  if (typeof input !== 'string' || !UUID.test(input)) throw new Error('Invalid instance/account ID');
}
export function parseGoldMilli(input: unknown): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(input)) throw new Error('Invalid goldMilli');
  const value = BigInt(input);
  if (value > BigInt(GOLD_MAX_MILLI)) throw new Error('Gold overflow');
  return value;
}
export function addGoldMilli(a: GoldMilli, b: GoldMilli): GoldMilli {
  const sum = parseGoldMilli(a) + parseGoldMilli(b);
  if (sum > BigInt(GOLD_MAX_MILLI)) throw new Error('Gold overflow');
  return sum.toString();
}
function validateComponents(input: unknown): asserts input is Components {
  object(input, COMPONENT_IDS);
  for (const key of COMPONENT_IDS) integer(input[key]);
}
export function validateRecipe(input: unknown): Recipe {
  object(input, ['goldMilli', 'components']);
  parseGoldMilli(input.goldMilli);
  validateComponents(input.components);
  return structuredClone(input) as unknown as Recipe;
}
/** Rejects unknown slots/heroes/modifiers, impossible recipes, and boss-hit bypasses. */
export function validateCatalog(input: unknown): EquipmentCatalog {
  object(input, ['version', 'items', 'consumables']);
  if (input.version !== 'r34.1') throw new Error('Unsupported equipment version');
  if (!Array.isArray(input.items) || input.items.length !== 7) throw new Error('R34 requires seven active items');
  const seen = new Set<string>();
  for (const item of input.items) {
    object(item, ['id', 'name', 'slot', 'hero', 'levels']);
    if (typeof item.id !== 'string' || !(item.id in ITEM_RULES) || seen.has(item.id)) throw new Error('Unknown/duplicate item');
    seen.add(item.id);
    const rule = ITEM_RULES[item.id as ItemDefinitionId];
    if (item.slot !== rule.slot || item.hero !== rule.hero) throw new Error('Incompatible item slot/hero');
    nonempty(item.name);
    if (!Array.isArray(item.levels) || item.levels.length !== rule.levels) throw new Error('Invalid item levels');
    for (const [index, level] of item.levels.entries()) {
      object(level, ['level', 'recipe', 'modifiers']);
      if (level.level !== index + 1) throw new Error('Noncontiguous item levels');
      validateRecipe(level.recipe);
      object(level.modifiers, rule.keys);
      for (const [key, value] of Object.entries(level.modifiers)) {
        if (key === 'pierceTargets') { integer(value, 2); if (value < 1) throw new Error('Invalid pierce target cap'); }
        else if (key === 'returnHitTargets') integer(value, 1);
        else if (key === 'goldMultiplierMilli') { integer(value, 2000); if (value < 1000) throw new Error('Invalid gold multiplier'); }
        else if (key === 'cooldown') finite(value, 0.1, 2);
        else finite(value, 1, 2);
      }
    }
  }
  if (!Array.isArray(input.consumables) || input.consumables.length !== 2) throw new Error('R34 requires two consumables');
  const consumables = new Set<string>();
  for (const consumable of input.consumables) {
    object(consumable, ['id', 'name', 'recipe', 'effect']);
    if (!CONSUMABLE_IDS.includes(consumable.id as ConsumableId) || consumables.has(consumable.id as string)) throw new Error('Unknown/duplicate consumable');
    consumables.add(consumable.id as string);
    nonempty(consumable.name); validateRecipe(consumable.recipe);
    if (consumable.id === 'slow_dust') {
      object(consumable.effect, ['type', 'durationSeconds', 'speedMultiplier']);
      if (consumable.effect.type !== 'slow') throw new Error('Invalid slow effect');
      finite(consumable.effect.durationSeconds, 0.1, 30); finite(consumable.effect.speedMultiplier, 0.1, 1);
    } else {
      object(consumable.effect, ['type', 'kills', 'goldMultiplierMilli']);
      if (consumable.effect.type !== 'collector') throw new Error('Invalid collector effect');
      integer(consumable.effect.kills, 100); if (consumable.effect.kills < 1) throw new Error('Invalid collector length');
      integer(consumable.effect.goldMultiplierMilli, 2000); if (consumable.effect.goldMultiplierMilli < 1000) throw new Error('Invalid collector multiplier');
    }
  }
  return structuredClone(input) as unknown as EquipmentCatalog;
}
function freezeCatalog<T>(input: T): T {
  if (input && typeof input === 'object') {
    for (const child of Object.values(input)) freezeCatalog(child);
    Object.freeze(input);
  }
  return input;
}
export function getItemDefinition(definitionId: string, catalog: EquipmentCatalog = EQUIPMENT_CATALOG): ItemDefinition {
  const item = catalog.items.find((candidate) => candidate.id === definitionId);
  if (!item) throw new Error('Unknown item definition');
  return item;
}
export function getConsumableDefinition(definitionId: string, catalog: EquipmentCatalog = EQUIPMENT_CATALOG): ConsumableDefinition {
  const item = catalog.consumables.find((candidate) => candidate.id === definitionId);
  if (!item) throw new Error('Unknown consumable definition');
  return item;
}
/** Level 0 means craft; levels 1/2 request the cost of upgrading that existing level. */
export function recipeCost(definitionId: string, currentLevel = 0, catalog: EquipmentCatalog = EQUIPMENT_CATALOG): Recipe {
  validateCatalog(catalog);
  integer(currentLevel, 3);
  if (CONSUMABLE_IDS.includes(definitionId as ConsumableId)) {
    if (currentLevel !== 0) throw new Error('Consumables cannot be upgraded');
    return structuredClone(getConsumableDefinition(definitionId, catalog).recipe);
  }
  const next = getItemDefinition(definitionId, catalog).levels.find((candidate) => candidate.level === currentLevel + 1);
  if (!next) throw new Error('Item has no further level');
  return structuredClone(next.recipe);
}
export const cost = recipeCost;
export function canCraft(profile: Pick<Profile, 'goldMilli' | 'components'>, recipe: Recipe): boolean {
  validateRecipe(recipe); validateComponents(profile.components);
  return parseGoldMilli(profile.goldMilli) >= parseGoldMilli(recipe.goldMilli)
    && COMPONENT_IDS.every((component) => profile.components[component] >= recipe.components[component]);
}
export function createEmptyProfile(accountId: string): Profile {
  id(accountId);
  return { accountId, revision: 0, goldMilli: '0', components: { steel: 0, ember: 0, core: 0 }, items: [],
    loadouts: { pudge: { weapon: null, body: null, legs: null, talisman: null, quick: [null, null] } },
    consumables: { slow_dust: 0, collector_vial: 0 }, stats: { runs: 0, totalKills: 0, bestDistance: 0 } };
}
/** Corrupted authority is rejected; this function never repairs with an empty profile. */
export function validateProfile(input: unknown, catalog: EquipmentCatalog = EQUIPMENT_CATALOG): Profile {
  validateCatalog(catalog);
  object(input, ['accountId', 'revision', 'goldMilli', 'components', 'items', 'loadouts', 'consumables', 'stats']);
  id(input.accountId); integer(input.revision, Number.MAX_SAFE_INTEGER); parseGoldMilli(input.goldMilli); validateComponents(input.components);
  if (!Array.isArray(input.items) || input.items.length > 10000) throw new Error('Invalid item inventory');
  const instances = new Map<string, ItemInstance>();
  for (const item of input.items) {
    object(item, ['id', 'definitionId', 'level']); id(item.id);
    if (instances.has(item.id)) throw new Error('Duplicate item instance');
    const definition = getItemDefinition(item.definitionId as string, catalog);
    if (!definition.levels.some((level) => level.level === item.level)) throw new Error('Invalid owned item level');
    instances.set(item.id, item as unknown as ItemInstance);
  }
  object(input.loadouts, ['pudge']); object(input.loadouts.pudge, [...EQUIPMENT_SLOTS, 'quick']);
  for (const slot of EQUIPMENT_SLOTS) {
    const instanceId = input.loadouts.pudge[slot];
    if (instanceId === null) continue;
    id(instanceId);
    const instance = instances.get(instanceId);
    if (!instance || getItemDefinition(instance.definitionId, catalog).slot !== slot) throw new Error('Unowned/incompatible equipped item');
  }
  const quick = input.loadouts.pudge.quick;
  if (!Array.isArray(quick) || quick.length !== 2 || quick.some((entry) => entry !== null && !CONSUMABLE_IDS.includes(entry as ConsumableId))) throw new Error('Invalid quick slots');
  object(input.consumables, CONSUMABLE_IDS); for (const key of CONSUMABLE_IDS) integer(input.consumables[key]);
  object(input.stats, ['runs', 'totalKills', 'bestDistance']); integer(input.stats.runs, Number.MAX_SAFE_INTEGER); integer(input.stats.totalKills, Number.MAX_SAFE_INTEGER);
  finite(input.stats.bestDistance, 0, Number.MAX_SAFE_INTEGER);
  return structuredClone(input) as unknown as Profile;
}
/** Starts from base for every call. Owned but unequipped items have no effect. */
export function computeModifiers(profile: Profile, catalog: EquipmentCatalog = EQUIPMENT_CATALOG): Readonly<EquipmentModifiers> {
  validateProfile(profile, catalog);
  let rangeMultiplier = 1, outboundSpeedMultiplier = 1, returnSpeedMultiplier = 1, cooldown = BASE_MODIFIERS.cooldown;
  let lateralSpeedMultiplier = 1, pierceTargets = 1, returnHitTargets = 0, goldMultiplierMilli = 1000;
  for (const slot of EQUIPMENT_SLOTS) {
    const instanceId = profile.loadouts.pudge[slot];
    if (instanceId === null) continue;
    const instance = profile.items.find((candidate) => candidate.id === instanceId)!;
    const level = getItemDefinition(instance.definitionId, catalog).levels.find((candidate) => candidate.level === instance.level)!;
    const effect = level.modifiers;
    rangeMultiplier *= effect.rangeMultiplier ?? 1;
    outboundSpeedMultiplier *= effect.outboundSpeedMultiplier ?? 1;
    returnSpeedMultiplier *= effect.returnSpeedMultiplier ?? 1;
    cooldown = effect.cooldown ?? cooldown;
    lateralSpeedMultiplier *= effect.lateralSpeedMultiplier ?? 1;
    pierceTargets = effect.pierceTargets ?? pierceTargets;
    returnHitTargets = effect.returnHitTargets ?? returnHitTargets;
    goldMultiplierMilli = Number(BigInt(goldMultiplierMilli) * BigInt(effect.goldMultiplierMilli ?? 1000) / 1000n);
  }
  return Object.freeze({ rangeMultiplier, outboundSpeedMultiplier, returnSpeedMultiplier, cooldown, lateralSpeedMultiplier, pierceTargets, returnHitTargets, goldMultiplierMilli });
}
export const calculateEquipment = computeModifiers;

export function loadEquipmentCatalog(path: string | URL = new URL('../../content/equipment.json', import.meta.url)): EquipmentCatalog {
  return freezeCatalog(validateCatalog(JSON.parse(readFileSync(path, 'utf8'))));
}
export const EQUIPMENT_CATALOG: EquipmentCatalog = loadEquipmentCatalog();
