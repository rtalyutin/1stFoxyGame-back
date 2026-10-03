import { readFileSync } from 'node:fs';

export interface WeaponDefinition {
  code: string; telegraphSeconds: number; projectileSpeed: number; projectileRadius: number;
  projectileLifetimeSeconds: number; shotIntervalSeconds: number; anglesDegrees: number[];
}
export interface EnemyDefinition {
  code: 'normal' | 'strong' | 'boss'; requiredHits: number; radius: number; worldSpeed: number;
  weaponCode: string | null; modifiers: string[];
}
export interface CatalogRules {
  heroSpeed: number; lateralSpeed: number; heroRadius: number; lateralLimit: number;
  enemySpeed: number; enemyRadius: number; breachOffset: number; spawnDistance: number;
  spawnMinSeconds: number; spawnMaxSeconds: number; maxEnemies: number;
  hookRange: number; hookOutboundSpeed: number; hookReturnSpeed: number; hookCooldown: number; hookRadius: number;
  maxShooters: number; maxBosses: number; maxProjectiles: number;
  shooterUnlockSeconds: number; bossFirstSeconds: number; bossMinKills: number;
  bossMinInterval: number; bossMaxInterval: number; shopMinInterval: number; shopMaxInterval: number;
  spawnSafetySeconds: number; spawnRetrySeconds: number;
}
export interface ContentCatalog {
  catalogVersion: string; rulesVersion: string;
  enemies: EnemyDefinition[]; weapons: WeaponDefinition[]; rules: CatalogRules; modifiers: string[];
}

function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected catalog object');
  const own = Object.keys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) throw new Error('Unexpected or missing catalog field');
}
function number(value: unknown, minimum: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (integer && !Number.isSafeInteger(value))) {
    throw new Error('Invalid catalog number');
  }
}
function code(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(value)) throw new Error('Invalid catalog code');
}
const ruleKeys = ['heroSpeed','lateralSpeed','heroRadius','lateralLimit','enemySpeed','enemyRadius','breachOffset','spawnDistance',
  'spawnMinSeconds','spawnMaxSeconds','maxEnemies','hookRange','hookOutboundSpeed','hookReturnSpeed','hookCooldown','hookRadius',
  'maxShooters','maxBosses','maxProjectiles','shooterUnlockSeconds','bossFirstSeconds','bossMinKills',
  'bossMinInterval','bossMaxInterval','shopMinInterval','shopMaxInterval','spawnSafetySeconds','spawnRetrySeconds'] as const;

// Validation runs before serving, migration or simulation use. No unknown modifiers
// or extra trusted fields can slip in through a future content-file edit.
export function validateCatalog(input: unknown): ContentCatalog {
  object(input, ['catalogVersion','rulesVersion','enemies','weapons','rules','modifiers']);
  code(input.catalogVersion); code(input.rulesVersion);
  if (!Array.isArray(input.modifiers) || input.modifiers.length !== 0) throw new Error('R2 supports no modifiers');
  if (!Array.isArray(input.weapons) || input.weapons.length !== 2) throw new Error('R2 requires two weapon definitions');
  const weapons = new Set<string>();
  for (const w of input.weapons) {
    object(w, ['code','telegraphSeconds','projectileSpeed','projectileRadius','projectileLifetimeSeconds','shotIntervalSeconds','anglesDegrees']);
    code(w.code);
    if (weapons.has(w.code)) throw new Error('Duplicate weapon code');
    weapons.add(w.code);
    for (const key of ['telegraphSeconds','projectileSpeed','projectileRadius','projectileLifetimeSeconds','shotIntervalSeconds']) number(w[key], Number.MIN_VALUE);
    if ((w.telegraphSeconds as number) >= (w.shotIntervalSeconds as number)) throw new Error('Telegraph must fit shot interval');
    if (!Array.isArray(w.anglesDegrees) || w.anglesDegrees.length < 1 || w.anglesDegrees.length > 3) throw new Error('Invalid volley');
    for (const a of w.anglesDegrees) { number(a, -90); if (a > 90) throw new Error('Invalid volley angle'); }
    if (new Set(w.anglesDegrees).size !== w.anglesDegrees.length) throw new Error('Duplicate volley angle');
  }
  if (!Array.isArray(input.enemies) || input.enemies.length !== 3) throw new Error('R2 requires three enemy definitions');
  const enemyCodes = new Set<string>();
  for (const e of input.enemies) {
    object(e, ['code','requiredHits','radius','worldSpeed','weaponCode','modifiers']);
    if (!['normal','strong','boss'].includes(e.code as string) || enemyCodes.has(e.code as string)) throw new Error('Invalid enemy code');
    enemyCodes.add(e.code as string);
    number(e.requiredHits, 1, true); number(e.radius, Number.MIN_VALUE); number(e.worldSpeed, 0);
    if (!Array.isArray(e.modifiers) || e.modifiers.length !== 0) throw new Error('Unknown enemy modifier');
    if (e.code === 'boss' ? (e.requiredHits as number) < 3 : e.requiredHits !== 1) throw new Error('Invalid enemy hit requirement');
    if (e.code === 'normal') { if (e.weaponCode !== null) throw new Error('Normal creep cannot shoot in R2'); }
    else if (typeof e.weaponCode !== 'string' || !weapons.has(e.weaponCode)) throw new Error('Unknown weapon reference');
  }
  object(input.rules, ruleKeys);
  for (const key of ruleKeys) number(input.rules[key], 0, ['maxEnemies','maxShooters','maxBosses','maxProjectiles','bossMinKills'].includes(key));
  if (input.rules.maxBosses !== 1 || (input.rules.maxShooters as number) < 1 || (input.rules.maxProjectiles as number) < 3) throw new Error('Invalid encounter cap');
  if ((input.rules.bossMinInterval as number) > (input.rules.bossMaxInterval as number) || (input.rules.shopMinInterval as number) > (input.rules.shopMaxInterval as number)) throw new Error('Invalid spawn interval');
  if ((input.rules.spawnMinSeconds as number) <= 0 || (input.rules.spawnMinSeconds as number) > (input.rules.spawnMaxSeconds as number)) throw new Error('Invalid creep interval');
  if ((input.rules.spawnRetrySeconds as number) <= 0) throw new Error('Retry interval must be positive');
  return structuredClone(input) as unknown as ContentCatalog;
}

export function loadCatalog(path: string | URL = new URL('../../content/catalog.json', import.meta.url)): ContentCatalog {
  return validateCatalog(JSON.parse(readFileSync(path, 'utf8')));
}

export const catalog = loadCatalog();
