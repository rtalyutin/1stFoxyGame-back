import { readFileSync } from 'node:fs';
import { parseGoldMilli, type ComponentId } from '../profile/equipment.js';

export type RewardKind = 'normal' | 'strong' | 'boss';
export interface ComponentDefinition { id: ComponentId; label: string; }
export interface RewardDefinition {
  kind: RewardKind;
  baseGoldMilli: string;
  commonDrops: number;
  coreDrops: number;
  steelProbability: number;
}
export interface RewardCatalog { version: string; components: ComponentDefinition[]; rewards: RewardDefinition[]; }

function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected reward object');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error('Unexpected or missing reward field');
}
function count(value: unknown, maximum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('Invalid drop count');
}
/** Server rewards are versioned content; client prices or kill payloads cannot override them. */
export function validateRewardCatalog(input: unknown): RewardCatalog {
  object(input, ['version', 'components', 'rewards']);
  if (typeof input.version !== 'string' || !/^r[0-9]+\.[0-9]+$/.test(input.version) || input.version.length > 32) throw new Error('Unsupported reward version');
  if (!Array.isArray(input.components) || input.components.length !== 3) throw new Error('Expected three components');
  const components = new Set<string>();
  for (const component of input.components) {
    object(component, ['id', 'label']);
    if (typeof component.id !== 'string' || !['steel', 'ember', 'core'].includes(component.id) || components.has(component.id)) throw new Error('Unknown/duplicate component');
    components.add(component.id);
    if (typeof component.label !== 'string' || component.label.trim().length < 1 || component.label.length > 128) throw new Error('Invalid component label');
  }
  if (!Array.isArray(input.rewards) || input.rewards.length !== 3) throw new Error('Expected three reward definitions');
  const rewards = new Set<string>();
  for (const reward of input.rewards) {
    object(reward, ['kind', 'baseGoldMilli', 'commonDrops', 'coreDrops', 'steelProbability']);
    if (typeof reward.kind !== 'string' || !['normal', 'strong', 'boss'].includes(reward.kind) || rewards.has(reward.kind)) throw new Error('Unknown/duplicate reward kind');
    rewards.add(reward.kind);
    parseGoldMilli(reward.baseGoldMilli);
    count(reward.commonDrops, 2); count(reward.coreDrops, 1);
    if (typeof reward.steelProbability !== 'number' || !Number.isFinite(reward.steelProbability) || reward.steelProbability < 0 || reward.steelProbability > 1) throw new Error('Invalid steel probability');
    if (reward.kind === 'normal' && (reward.commonDrops !== 0 || reward.coreDrops !== 0)) throw new Error('Ordinary enemy cannot drop components');
    if (reward.kind === 'strong' && reward.coreDrops !== 0) throw new Error('Core source must be boss');
  }
  return structuredClone(input) as unknown as RewardCatalog;
}
function freeze<T>(input: T): T {
  if (input && typeof input === 'object') { for (const child of Object.values(input)) freeze(child); Object.freeze(input); }
  return input;
}
export function loadRewardCatalog(path: string | URL = new URL('../../content/rewards.json', import.meta.url)): RewardCatalog {
  return freeze(validateRewardCatalog(JSON.parse(readFileSync(path, 'utf8'))));
}
export const REWARD_CATALOG = loadRewardCatalog();
export function rewardFor(kind: RewardKind, catalog: RewardCatalog = REWARD_CATALOG): RewardDefinition {
  const reward = catalog.rewards.find((candidate) => candidate.kind === kind);
  if (!reward) throw new Error('Unknown reward kind');
  return reward;
}
