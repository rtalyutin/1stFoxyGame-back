import type { PinnedBalance } from '../balance/model.js';
import type { Command, SimulationSnapshot } from '../combat/simulation.js';

export type GoldMilli = string;
export type Slot = 'weapon' | 'body' | 'legs' | 'talisman';
export type HeroId = 'pudge';
export type ComponentId = 'steel' | 'ember' | 'core';
export type ItemDefinitionId = 'fast_reel' | 'long_link' | 'piercing_tooth' | 'return_sickle' | 'conductor_cuffs' | 'side_step_boots' | 'trophy_counter';
export type ConsumableId = 'slow_dust' | 'collector_vial';
export type Components = Record<ComponentId, number>;
export interface Recipe { goldMilli: GoldMilli; components: Components; }
export interface EquipmentModifiers {
  readonly rangeMultiplier: number;
  readonly outboundSpeedMultiplier: number;
  readonly returnSpeedMultiplier: number;
  readonly cooldown: number;
  readonly lateralSpeedMultiplier: number;
  readonly pierceTargets: number;
  readonly returnHitTargets: number;
  readonly goldMultiplierMilli: number;
}
export interface ItemLevel { level: number; recipe: Recipe; modifiers: Partial<EquipmentModifiers>; }
export interface ItemDefinition { id: ItemDefinitionId; name: string; slot: Slot; hero: HeroId | 'all'; levels: ItemLevel[]; }
export type ConsumableEffect = { type: 'slow'; durationSeconds: number; speedMultiplier: number } | { type: 'collector'; kills: number; goldMultiplierMilli: number };
export interface ConsumableDefinition { id: ConsumableId; name: string; recipe: Recipe; effect: ConsumableEffect; }
export interface EquipmentCatalog { version: 'r34.1'; items: ItemDefinition[]; consumables: ConsumableDefinition[]; }
export interface ItemInstance { id: string; definitionId: ItemDefinitionId; level: number; }
export interface HeroLoadout { weapon: string | null; body: string | null; legs: string | null; talisman: string | null; quick: [ConsumableId | null, ConsumableId | null]; }
export interface Profile {
  accountId: string;
  revision: number;
  goldMilli: GoldMilli;
  components: Components;
  items: ItemInstance[];
  loadouts: { pudge: HeroLoadout };
  consumables: Record<ConsumableId, number>;
  stats: { runs: number; totalKills: number; bestDistance: number };
}
export interface RunView { balance?: PinnedBalance; runId: string; loot: {goldMilli: GoldMilli; components: Components}; snapshot: SimulationSnapshot; control: 'owner' | 'readOnly'; ownerEpoch: number; updatedAt: string; }
export type RunOwnership = { runId: string; ownerEpoch: number };
export type OperationAction =
  | { type: 'start_run'; payload: Record<string, never> }
  | { type: 'advance_run'; payload: RunOwnership & { frames: Command[][] } }
  | { type: 'pause_run' | 'resume_run' | 'leave_shop' | 'end_run'; payload: RunOwnership }
  | { type: 'takeover_run'; payload: { runId: string } }
  | { type: 'craft'; payload: { definitionId: ItemDefinitionId | ConsumableId } }
  | { type: 'upgrade'; payload: { itemId: string } }
  | { type: 'equip'; payload: { slot: Slot; itemId: string | null } }
  | { type: 'quick_slots'; payload: { slots: [ConsumableId | null, ConsumableId | null] } }
  | { type: 'consume'; payload: RunOwnership & { definitionId: ConsumableId } };
export type Operation = { operationId: string; expectedRevision: number; clientId: string } & OperationAction;
export interface OperationResult { operationId: string; status: 'committed'; profile: Profile; run: RunView | null; replayed: boolean; }
