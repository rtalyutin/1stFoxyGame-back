/** Pure fixed-step R3 simulation. No renderer, clock, network, or ambient randomness. */
import { CORE_VERSION, SNAPSHOT_VERSION, validateContent } from './content-r3.ts';
import type { GameContent, Point, HeroKind, BuildingKind, HeroDefinition, BuildingDefinition, EnemyDefinition, SpellBehavior, ItemDefinition, ExpeditionKind } from './content-r3.ts';
export type Phase = 'preparation' | 'wave' | 'paused' | 'victory' | 'defeat';
export interface Statistics { kills: number; builds: number; upgrades: number; goldEarned: number }
export interface VersionPins { core: string; content: string; metadataSchema: string }
export interface Expedition { kind: ExpeditionKind; remainingTicks: number; totalTicks: number; rewardId: string }
export interface PendingReward { id: string; heroId: string; kind: 'shop'; options: string[] }
export interface SavedHero { id: string; kind: HeroKind; anchorId: string; level: number; hp: number; attackCooldown: number; abilityCooldown: number; respawnTicks: number; spentGold: number; stolenSpell: string | null; stealCooldown: number; priority: 'nearest' | 'strongest' | 'commander'; items: [string | null, string | null]; expedition: Expedition | null; aegisToken: boolean }
export interface SavedBuilding { id: string; kind: BuildingKind; padId: string; level: number; hp: number; attackCooldown: number; spentGold: number }
export interface GameSnapshot {
  schemaVersion: 4; versions: VersionPins; phase: 'preparation'; seed: number; rngState: number; simTick: number; commandEpoch: number;
  lastCompletedWave: number; nextWave: number; gold: number; throneHp: number; scrolls: number; statistics: Statistics; pendingRewards: PendingReward[]; heroes: SavedHero[]; buildings: SavedBuilding[];
}
export interface Teleport { targetAnchorId: string; remainingTicks: number; from: Point; to: Point }
export interface Shield { remainingTicks: number; absorption: number }
export interface Slow { remainingTicks: number; percent: number }
export interface Hero extends SavedHero, Point { maxHp: number; teleport?: Teleport; shield?: Shield }
export interface Building extends SavedBuilding, Point { maxHp: number; constructionTicks: number; shield?: Shield }
export interface Enemy extends Point { id: string; kind: string; lane: number; hp: number; maxHp: number; pathIndex: number; attackCooldown: number; lastSpell: string | null; stealable: boolean; spellCooldown: number; spellIndex: number; healCooldown: number; hidden: boolean; visible: boolean; shield?: Shield; slow?: Slow; detour?: { returnPoint: Point; controlTicks: number; returning: boolean } }
export interface Summon extends Point { id: string; kind: 'snake' | 'tombstone' | 'zombie'; parentId?: string; spawnCooldown?: number; spawnSequence?: number; hp: number; maxHp: number; ttlTicks: number; readyTicks: number; attackCooldown: number; ownerId: string; damage: number }
export interface GameEvent { eventId: string; tick: number; type: string; effectId?: string; sourceId?: string; targetId?: string; source?: Point; target?: Point; position?: Point; durationTicks?: number; amount?: number; kind?: string; code?: string; commandId?: string; wave?: number; reason?: string; spellId?: string; radius?: number }
export type CommandType = 'build' | 'upgrade' | 'sell' | 'cast' | 'teleport' | 'buy_scroll' | 'start_wave' | 'pause' | 'resume' | 'set_priority' | 'send_expedition' | 'equip_item' | 'choose_reward' | 'discard_reward';
export interface GameCommand { commandId: string; tick: number; sequence: number; type: CommandType; actorId?: string; payload: Record<string, unknown> }
export interface CommandResult { commandId: string; status: 'accepted' | 'rejected' | 'queued'; code: string; tick: number }
interface Cast { id: string; heroId: string; kind: HeroKind; targetId?: string; target: Point; remainingTicks: number; damage: number; mode?: 'steal' | 'use'; spellId?: SpellBehavior }
interface Projectile { id: string; sourceId: string; targetId: string; source: Point; target: Point; damage: number; remainingTicks: number; effectId: string }
interface SpawnGroup { id: string; lane: number; enemyKind: string; count: number; spawned: number; intervalTicks: number; delayTicks: number }
export interface GameState {
  content: GameContent; versions: VersionPins; phase: Phase; pausedFrom?: 'preparation' | 'wave'; seed: number; rngState: number; simTick: number; commandEpoch: number;
  lastCompletedWave: number; nextWave: number | null; activeWave?: number; waveTick: number; gold: number; throneHp: number; scrolls: number; statistics: Statistics;
  pendingRewards: PendingReward[]; heroes: Hero[]; buildings: Building[]; enemies: Enemy[]; summons: Summon[];
  casts: Cast[]; projectiles: Projectile[]; spawnGroups: SpawnGroup[]; events: GameEvent[]; eventCounter: number;
  queuedCommands: GameCommand[]; commandHistory: Record<string, { canonical: string; result: CommandResult }>;
}
export interface ValidationResult { valid: boolean; errors: string[]; snapshot?: GameSnapshot }
export interface FinishResult { outcome: 'victory' | 'defeat'; lastCompletedWave: number; wave: number; simTick: number; gold: number; throneHp: number; seed: number; versions: VersionPins; statistics: Statistics }
const byId = <T extends { id: string }>(a: T, b: T) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const point = (p: Point): Point => ({ x: p.x, y: p.y });
const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const inRange = (a: Point, b: Point, range: number) => dist2(a, b) <= range ** 2;
const hdef = (g: GameState, kind: HeroKind): HeroDefinition => g.content.heroes.find(h => h.kind === kind)!;
const bdef = (g: GameState, kind: BuildingKind): BuildingDefinition => g.content.buildings.find(b => b.kind === kind)!;
const edef = (g: GameState, kind: string): EnemyDefinition => g.content.enemies.find(e => e.kind === kind)!;
const scale = (base: number, level: number) => Math.floor(base * (100 + (level - 1) * 45) / 100);
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const int = (v: unknown, min = 0, max = 2_147_483_647): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
function canonical(v: unknown): string { if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`; return JSON.stringify(v) ?? 'null'; }
function emit(g: GameState, type: string, data: Omit<GameEvent, 'eventId' | 'tick' | 'type'> = {}): void { g.events.push({ eventId: `${g.commandEpoch}:${g.simTick}:${g.eventCounter++}`, tick: g.simTick, type, ...data }); }
/** Mulberry32 integer generator, fixed by r3-core-1. Returned unsigned state is saved. */
export function randomUint32(g: GameState): number { g.rngState = (g.rngState + 0x6D2B79F5) >>> 0; let t = g.rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; }
export function createGame(content: GameContent, seed: number, pins: VersionPins = { core: CORE_VERSION, content: content.contentVersion, metadataSchema: content.metadataSchemaVersion }): GameState {
  validateContent(content);
  if (!int(seed, 0, 0xFFFFFFFF) || pins.core !== CORE_VERSION || pins.content !== content.contentVersion || pins.metadataSchema !== content.metadataSchemaVersion || !content.coreCompatibility.includes(pins.core)) throw new Error('GAME_VERSION_MISMATCH');
  return { content: structuredClone(content), versions: { ...pins }, phase: 'preparation', seed, rngState: seed >>> 0, simTick: 0, commandEpoch: 0,
    lastCompletedWave: 0, nextWave: 1, waveTick: 0, gold: content.initialGold, throneHp: content.throneHp, scrolls: 0, statistics: { kills: 0, builds: 0, upgrades: 0, goldEarned: 0 },
    heroes: content.heroes.map(h => { const p = content.map.places.find(p => p.id === h.anchorId)!; return { id: h.kind, kind: h.kind, anchorId: p.id, x: p.x, y: p.y, level: 1, hp: h.hp, maxHp: h.hp, attackCooldown: 0, abilityCooldown: 0, respawnTicks: 0, spentGold: 0, stolenSpell: null, stealCooldown: 0, priority: 'nearest' as const, items: [null, null] as [null, null], expedition: null, aegisToken: false }; }).sort(byId),
    pendingRewards: [], buildings: [], enemies: [], summons: [], casts: [], projectiles: [], spawnGroups: [], events: [], eventCounter: 0, queuedCommands: [], commandHistory: Object.create(null)
  };
}
export function drainEvents(g: GameState): GameEvent[] { const result = g.events; g.events = []; return result; }
export function getCommandResult(g: GameState, commandId: string): CommandResult | undefined { const r = g.commandHistory[commandId]?.result; return r && { ...r }; }
function result(g: GameState, c: GameCommand, accepted: boolean, code = accepted ? 'OK' : 'INVALID_COMMAND'): CommandResult { const r: CommandResult = { commandId: c.commandId, status: accepted ? 'accepted' : 'rejected', code, tick: g.simTick }; g.commandHistory[c.commandId] = { canonical: canonical(c), result: r }; emit(g, 'command_result', { commandId: c.commandId, code, reason: r.status }); return { ...r }; }
/** Preparation controls execute immediately; battle commands queue for their assigned future tick. */
export function submitCommand(g: GameState, command: GameCommand): CommandResult {
  const c = structuredClone(command);
  if (!safeId(c.commandId) || c.commandId.length > 96 || !int(c.tick) || !int(c.sequence) || !c.payload || typeof c.payload !== 'object' || Array.isArray(c.payload) || !['build', 'upgrade', 'sell', 'cast', 'teleport', 'buy_scroll', 'start_wave', 'pause', 'resume', 'set_priority', 'send_expedition', 'equip_item', 'choose_reward', 'discard_reward'].includes(c.type)) return { commandId: typeof c.commandId === 'string' ? c.commandId : '', status: 'rejected', code: 'INVALID_COMMAND', tick: g.simTick };
  const prior = g.commandHistory[c.commandId];
  if (prior) return prior.canonical === canonical(c) ? { ...prior.result } : { commandId: c.commandId, status: 'rejected', code: 'COMMAND_ID_REUSED', tick: g.simTick };
  if (c.type === 'pause' || c.type === 'resume') return applyCommand(g, c);
  if (g.phase === 'paused') return result(g, c, false, 'PAUSED');
  if (g.phase === 'victory' || g.phase === 'defeat') return result(g, c, false, 'RUN_FINISHED');
  if (g.phase === 'preparation') { if (c.tick !== g.simTick) return result(g, c, false, 'INVALID_TICK'); return applyCommand(g, c); }
  if (c.tick <= g.simTick || c.tick > g.simTick + 300) return result(g, c, false, 'INVALID_TICK');
  if (g.queuedCommands.length >= 256) return result(g, c, false, 'COMMAND_QUEUE_FULL');
  const r: CommandResult = { commandId: c.commandId, status: 'queued', code: 'QUEUED', tick: c.tick }; g.commandHistory[c.commandId] = { canonical: canonical(c), result: r }; g.queuedCommands.push(c); return { ...r };
}
function spend(g: GameState, amount: number): boolean { if (g.gold < amount) return false; g.gold -= amount; emit(g, 'gold_changed', { amount: -amount }); return true; }
function applyCommand(g: GameState, c: GameCommand): CommandResult {
  if (c.type === 'pause') { if (g.phase !== 'wave' && g.phase !== 'preparation') return result(g, c, false, 'INVALID_PHASE'); g.pausedFrom = g.phase; g.phase = 'paused'; emit(g, 'paused'); return result(g, c, true); }
  if (c.type === 'resume') { if (g.phase !== 'paused' || !g.pausedFrom) return result(g, c, false, 'INVALID_PHASE'); g.phase = g.pausedFrom; delete g.pausedFrom; emit(g, 'resumed'); return result(g, c, true); }
  if (g.phase !== 'wave' && g.phase !== 'preparation') return result(g, c, false, 'INVALID_PHASE');
  if (c.type === 'build') {
    const pad = g.content.map.places.find(p => p.id === c.payload.padId); if (!pad || pad.kind !== 'building_pad') return result(g, c, false, 'WRONG_PLACE_TYPE');
    if (g.buildings.some(b => b.padId === pad.id)) return result(g, c, false, 'PLACE_OCCUPIED');
    const d = g.content.buildings.find(b => b.kind === c.payload.kind); if (!d) return result(g, c, false, 'UNKNOWN_BUILDING');
    if (!spend(g, d.cost)) return result(g, c, false, 'INSUFFICIENT_GOLD');
    const b: Building = { id: `building-${g.commandEpoch}-${c.commandId}`, kind: d.kind, padId: pad.id, x: pad.x, y: pad.y, level: 1, hp: d.hp, maxHp: d.hp, attackCooldown: 0, constructionTicks: g.phase === 'wave' ? d.buildTicks : 0, spentGold: d.cost };
    g.statistics.builds++; g.buildings.push(b); g.buildings.sort(byId); emit(g, 'construction_started', { effectId: 'construction', sourceId: b.id, position: point(b), durationTicks: d.buildTicks, kind: b.kind });
    if (!b.constructionTicks) emit(g, 'building_ready', { effectId: 'building_ready', sourceId: b.id, position: point(b), kind: b.kind }); return result(g, c, true);
  }
  if (c.type === 'upgrade') {
    const actor = g.heroes.find(h => h.id === c.actorId) ?? g.buildings.find(b => b.id === c.actorId); if (!actor) return result(g, c, false, 'UNKNOWN_ACTOR');
    if ('expedition' in actor && actor.expedition) return result(g, c, false, 'ACTOR_ABSENT'); if (actor.hp <= 0) return result(g, c, false, 'ACTOR_DEAD'); if ('constructionTicks' in actor && actor.constructionTicks > 0 || 'teleport' in actor && actor.teleport || g.casts.some(cast => cast.heroId === actor.id)) return result(g, c, false, 'ACTOR_BUSY');
    if (actor.level >= 3) return result(g, c, false, 'MAX_LEVEL');
    const d = 'anchorId' in actor ? hdef(g, actor.kind) : bdef(g, actor.kind); const cost = d.upgradeCosts[actor.level - 1]!;
    if (!spend(g, cost)) return result(g, c, false, 'INSUFFICIENT_GOLD'); actor.level++; g.statistics.upgrades++; actor.spentGold += cost; const oldMax = actor.maxHp; actor.maxHp = scale(d.hp, actor.level); actor.hp += actor.maxHp - oldMax; emit(g, 'upgraded', { effectId: 'upgrade', sourceId: actor.id, position: point(actor), amount: actor.level }); return result(g, c, true);
  }
  if (c.type === 'sell') {
    if (g.phase !== 'preparation') return result(g, c, false, 'PREPARATION_ONLY'); const b = g.buildings.find(b => b.id === c.actorId); if (!b) return result(g, c, false, 'UNKNOWN_ACTOR');
    const amount = Math.floor(b.spentGold * g.content.sellPercent / 100); g.gold += amount; g.buildings = g.buildings.filter(x => x.id !== b.id); emit(g, 'gold_changed', { amount }); emit(g, 'building_sold', { sourceId: b.id, position: point(b) }); return result(g, c, true);
  }
  if (c.type === 'buy_scroll') { if (g.scrolls >= 99) return result(g, c, false, 'SCROLL_LIMIT'); if (!spend(g, g.content.scrollCost)) return result(g, c, false, 'INSUFFICIENT_GOLD'); g.scrolls++; return result(g, c, true); }
  if (c.type === 'teleport') {
    const h = g.heroes.find(h => h.id === c.actorId); if (!h) return result(g, c, false, 'UNKNOWN_ACTOR'); if (h.expedition) return result(g, c, false, 'ACTOR_ABSENT'); if (h.hp <= 0) return result(g, c, false, 'ACTOR_DEAD'); if (h.teleport || g.casts.some(x => x.heroId === h.id)) return result(g, c, false, 'ACTOR_BUSY');
    const p = g.content.map.places.find(p => p.id === c.payload.anchorId); if (!p || p.kind !== 'hero_anchor') return result(g, c, false, 'WRONG_PLACE_TYPE');
    if (g.heroes.some(x => x.anchorId === p.id || x.teleport?.targetAnchorId === p.id)) return result(g, c, false, 'PLACE_OCCUPIED');
    if (g.phase === 'preparation') { const from = point(h); h.anchorId = p.id; h.x = p.x; h.y = p.y; emit(g, 'hero_relocated', { effectId: 'teleport_complete', sourceId: h.id, source: from, target: point(h), durationTicks: 18 }); return result(g, c, true); }
    if (!g.scrolls) return result(g, c, false, 'NO_SCROLL'); g.scrolls--; h.teleport = { targetAnchorId: p.id, remainingTicks: g.content.teleportTicks, from: point(h), to: point(p) }; emit(g, 'teleport_started', { effectId: 'teleport_start', sourceId: h.id, source: point(h), target: point(p), durationTicks: g.content.teleportTicks }); return result(g, c, true);
  }
  if (c.type === 'send_expedition') {
    if (g.phase !== 'preparation') return result(g, c, false, 'PREPARATION_ONLY'); const h = g.heroes.find(h => h.id === c.actorId); if (!h) return result(g, c, false, 'UNKNOWN_ACTOR'); if (h.hp <= 0) return result(g, c, false, 'ACTOR_DEAD');
    if (h.expedition || h.teleport || g.casts.some(cast => cast.heroId === h.id)) return result(g, c, false, 'ACTOR_BUSY'); if (g.heroes.some(h => h.expedition)) return result(g, c, false, 'EXPEDITION_ACTIVE'); if (g.pendingRewards.length) return result(g, c, false, 'REWARD_PENDING');
    const d = g.content.expeditions.find(e => e.kind === c.payload.kind); if (!d) return result(g, c, false, 'UNKNOWN_EXPEDITION'); if (d.kind === 'roshan' && h.aegisToken) return result(g, c, false, 'TOKEN_HELD');
    h.expedition = { kind: d.kind, remainingTicks: d.durationTicks, totalTicks: d.durationTicks, rewardId: `reward-${g.commandEpoch}-${c.commandId}` }; emit(g, 'expedition_started', { effectId: 'expedition_depart', sourceId: h.id, source: point(h), target: point(d.position), durationTicks: d.durationTicks, kind: d.kind }); refreshVisibility(g); return result(g, c, true);
  }
  if (c.type === 'equip_item') {
    const h = g.heroes.find(h => h.id === c.actorId); if (!h) return result(g, c, false, 'UNKNOWN_ACTOR'); if (h.expedition) return result(g, c, false, 'ACTOR_ABSENT'); if (h.hp <= 0) return result(g, c, false, 'ACTOR_DEAD');
    const code = itemCheck(g.content, h.kind, h.items, c.payload.itemId, c.payload.slot); if (code) return result(g, c, false, code); const item = g.content.items.find(i => i.id === c.payload.itemId)!;
    if (!spend(g, item.cost)) return result(g, c, false, 'INSUFFICIENT_GOLD'); h.items[c.payload.slot as 0 | 1] = item.id; emit(g, 'item_equipped', { effectId: 'item_equipped', sourceId: h.id, position: point(h), kind: item.id, durationTicks: 18 }); refreshVisibility(g); return result(g, c, true);
  }
  if (c.type === 'choose_reward' || c.type === 'discard_reward') {
    if (g.phase !== 'preparation') return result(g, c, false, 'PREPARATION_ONLY'); const reward = g.pendingRewards.find(r => r.id === c.payload.rewardId); if (!reward) return result(g, c, false, 'REWARD_NOT_FOUND'); const h = g.heroes.find(h => h.id === reward.heroId)!;
    if (c.type === 'choose_reward') { if (!reward.options.includes(c.payload.itemId as string)) return result(g, c, false, 'REWARD_ITEM_INVALID'); const code = itemCheck(g.content, h.kind, h.items, c.payload.itemId, c.payload.slot); if (code) return result(g, c, false, code); h.items[c.payload.slot as 0 | 1] = c.payload.itemId as string; emit(g, 'item_equipped', { effectId: 'item_equipped', sourceId: h.id, position: point(h), kind: c.payload.itemId as string, durationTicks: 18 }); }
    g.pendingRewards = g.pendingRewards.filter(r => r.id !== reward.id); emit(g, c.type === 'choose_reward' ? 'reward_chosen' : 'reward_discarded', { sourceId: h.id, kind: reward.kind }); refreshVisibility(g); return result(g, c, true);
  }
  if (c.type === 'set_priority') {
    const h = g.heroes.find(h => h.id === c.actorId); if (!h || h.kind !== 'sniper') return result(g, c, false, 'INVALID_ACTOR'); if (h.expedition) return result(g, c, false, 'ACTOR_ABSENT');
    if (!['nearest', 'strongest', 'commander'].includes(c.payload.priority as string)) return result(g, c, false, 'INVALID_PRIORITY');
    h.priority = c.payload.priority as Hero['priority']; emit(g, 'priority_changed', { sourceId: h.id, reason: h.priority }); return result(g, c, true);
  }
  if (c.type === 'cast') {
    if (g.phase !== 'wave') return result(g, c, false, 'WAVE_ONLY'); const h = g.heroes.find(h => h.id === c.actorId); if (!h) return result(g, c, false, 'UNKNOWN_ACTOR'); if (h.expedition) return result(g, c, false, 'ACTOR_ABSENT'); if (h.hp <= 0) return result(g, c, false, 'ACTOR_DEAD'); if (h.teleport || g.casts.some(x => x.heroId === h.id)) return result(g, c, false, 'ACTOR_BUSY');
    const d = hdef(g, h.kind); const stealing = h.kind === 'rubick' && h.stolenSpell === null;
    if ((stealing ? h.stealCooldown : h.abilityCooldown) > 0) return result(g, c, false, 'COOLDOWN');
    let target: Point; let targetId: string | undefined; let spellId: SpellBehavior | undefined;
    if (h.kind === 'pudge' || h.kind === 'sniper' || stealing) {
      const e = g.enemies.find(e => e.id === c.payload.targetId && e.hp > 0); if (!e) return result(g, c, false, 'INVALID_TARGET'); if (!e.visible) return result(g, c, false, 'TARGET_HIDDEN'); if (!inRange(h, e, d.abilityRange)) return result(g, c, false, 'OUT_OF_RANGE');
      if (h.kind === 'pudge' && !edef(g, e.kind).movable) return result(g, c, false, 'TARGET_IMMOVABLE');
      if (stealing) { if (!edef(g, e.kind).commander || !e.stealable || !e.lastSpell || !g.content.spells.some(s => s.behaviorId === e.lastSpell)) return result(g, c, false, 'SPELL_NOT_STEALABLE'); spellId = e.lastSpell as SpellBehavior; }
      target = point(e); targetId = e.id;
    } else {
      if (!int(c.payload.x, g.content.map.bounds.minX, g.content.map.bounds.maxX) || !int(c.payload.y, g.content.map.bounds.minY, g.content.map.bounds.maxY)) return result(g, c, false, 'INVALID_TARGET'); target = { x: c.payload.x, y: c.payload.y }; if (!inRange(h, target, d.abilityRange)) return result(g, c, false, 'OUT_OF_RANGE');
      if (h.kind === 'undying' && g.summons.some(s => s.kind === 'tombstone' && s.ownerId === h.id)) return result(g, c, false, 'SUMMON_ACTIVE');
      if (h.kind === 'rubick') { if (!g.content.spells.some(s => s.behaviorId === h.stolenSpell)) return result(g, c, false, 'UNKNOWN_SPELL'); spellId = h.stolenSpell as SpellBehavior; }
    }
    if (stealing) h.stealCooldown = cooldown(g, h, d.stealCooldownTicks); else { h.abilityCooldown = cooldown(g, h, d.abilityCooldownTicks); if (h.kind === 'rubick') h.stolenSpell = null; }
    g.casts.push({ id: `cast-${g.commandEpoch}-${c.commandId}`, heroId: h.id, kind: h.kind, targetId, target, remainingTicks: d.abilityTicks, damage: scale(d.abilityDamage, h.level), ...(h.kind === 'rubick' ? { mode: stealing ? 'steal' : 'use', spellId } : {}) });
    const effectId = h.kind === 'pudge' ? 'hook_cast' : h.kind === 'shaman' ? 'snakes_cast' : h.kind === 'undying' ? 'tombstone_cast' : h.kind === 'sniper' ? 'sniper_aim' : stealing ? 'rubick_steal' : spellId;
    emit(g, 'cast_started', { effectId, sourceId: h.id, targetId, source: stealing ? target : point(h), target: stealing ? point(h) : target, durationTicks: d.abilityTicks, spellId }); return result(g, c, true);
  }
  if (c.type === 'start_wave') {
    if (g.phase !== 'preparation' || g.nextWave === null) return result(g, c, false, 'PREPARATION_ONLY'); if (g.pendingRewards.length) return result(g, c, false, 'REWARD_PENDING'); const w = g.content.waves.find(w => w.number === g.nextWave); if (!w) return result(g, c, false, 'UNKNOWN_WAVE');
    g.phase = 'wave'; g.activeWave = w.number; g.waveTick = 0; g.spawnGroups = w.groups.map(x => ({ ...x, spawned: 0 })); emit(g, 'wave_started', { wave: w.number }); return result(g, c, true);
  }
  return result(g, c, false, 'INVALID_COMMAND');
}
interface Impact { sourceId: string; actionSequence: number; targetId: string; damage: number; source: Point; target: Point; effectId: string; mode?: 'heal' | 'shield'; durationTicks?: number }
function moveToward(p: Point, target: Point, speed: number): boolean { const dx = target.x - p.x, dy = target.y - p.y; const d = Math.sqrt(dx * dx + dy * dy); if (d <= speed) { p.x = target.x; p.y = target.y; return true; } let sx = Math.round(dx * speed / d), sy = Math.round(dy * speed / d); if (sx === 0 && sy === 0) { if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx); else sy = Math.sign(dy); } p.x += sx; p.y += sy; return false; }
function targetEnemy(g: GameState, source: Point, range: number): Enemy | undefined { return g.enemies.filter(e => e.hp > 0 && e.visible && inRange(source, e, range)).sort((a, b) => dist2(a, g.content.map.throne) - dist2(b, g.content.map.throne) || byId(a, b))[0]; }
function addProjectile(g: GameState, source: { id: string } & Point, target: Enemy, damage: number, effectId: string, ticks: number, impacts: Impact[]): void {
  emit(g, 'projectile_fired', { effectId, sourceId: source.id, targetId: target.id, source: point(source), target: point(target), durationTicks: ticks });
  if (ticks === 0) impacts.push({ sourceId: source.id, targetId: target.id, actionSequence: 0, damage, source: point(source), target: point(target), effectId });
  else g.projectiles.push({ id: `p-${g.commandEpoch}-${g.simTick}-${g.eventCounter}`, sourceId: source.id, targetId: target.id, source: point(source), target: point(target), damage, effectId, remainingTicks: ticks });
}
function heroItems(g: GameState, h: Hero): ItemDefinition[] { return h.items.filter((id): id is string => id !== null).map(id => g.content.items.find(item => item.id === id)!); }
function cooldown(g: GameState, h: Hero, base: number): number { const item = heroItems(g, h).find(item => item.behaviorId === 'cooldown_reduction'); return Math.max(1, Math.floor(base * (100 - (item?.magnitude ?? 0)) / 100)); }
function itemCheck(content: GameContent, kind: HeroKind, items: [string | null, string | null], id: unknown, slot: unknown): string | null { if (slot !== 0 && slot !== 1) return 'INVALID_SLOT'; const item = content.items.find(i => i.id === id); if (!item) return 'UNKNOWN_ITEM'; if (!item.compatibleHeroes.includes(kind)) return 'ITEM_INCOMPATIBLE'; if (items.some((other, index) => index !== slot && other !== null && content.items.find(i => i.id === other)?.behaviorId === item.behaviorId) || items[slot] === id) return 'ITEM_DUPLICATE'; return null; }
function refreshVisibility(g: GameState): void {
  for (const e of g.enemies) { const was = e.visible; e.visible = !e.hidden || g.heroes.some(h => h.hp > 0 && !h.expedition && heroItems(g, h).some(item => item.behaviorId === 'detection' && inRange(h, e, item.radius))); if (!was && e.visible) emit(g, 'enemy_revealed', { effectId: 'detection_reveal', targetId: e.id, position: point(e), kind: e.kind, durationTicks: 18 }); }
}
function completeExpedition(g: GameState, h: Hero): void {
  const expedition = h.expedition!; const def = g.content.expeditions.find(e => e.kind === expedition.kind)!; h.expedition = null;
  if (def.kind === 'camp') { g.gold += def.goldReward; g.statistics.goldEarned += def.goldReward; emit(g, 'gold_changed', { amount: def.goldReward }); }
  else if (def.kind === 'shop') { g.pendingRewards.push({ id: expedition.rewardId, heroId: h.id, kind: 'shop', options: [...def.itemOptions] }); emit(g, 'reward_pending', { sourceId: h.id, position: point(h), kind: 'shop' }); }
  else h.aegisToken = true;
  emit(g, 'expedition_finished', { effectId: 'expedition_return', sourceId: h.id, source: point(def.position), target: point(h), kind: def.kind, durationTicks: 24 }); refreshVisibility(g);
}
function insideMap(g: GameState, p: Point): boolean { return p.x >= g.content.map.bounds.minX && p.x <= g.content.map.bounds.maxX && p.y >= g.content.map.bounds.minY && p.y <= g.content.map.bounds.maxY; }
function tickShield(actor: { shield?: Shield }): void { if (actor.shield && --actor.shield.remainingTicks <= 0) delete actor.shield; }
function sniperTarget(g: GameState, h: Hero, range: number): Enemy | undefined {
  return g.enemies.filter(e => e.hp > 0 && e.visible && inRange(h, e, range)).sort((a, b) => (h.priority === 'strongest' ? b.hp - a.hp : h.priority === 'commander' ? Number(edef(g, b.kind).commander) - Number(edef(g, a.kind).commander) : 0) || dist2(h, a) - dist2(h, b) || byId(a, b))[0];
}
function applySpell(g: GameState, spellId: SpellBehavior, caster: { id: string } & Point, center: Point, faction: 'ally' | 'enemy', impacts: Impact[], power: number): void {
  const spell = g.content.spells.find(s => s.behaviorId === spellId); if (!spell) throw new Error('UNKNOWN_SPELL');
  const magnitude = Math.floor(spell.magnitude * power / 100); const allies = faction === 'ally' ? [...g.heroes.filter(h => !h.expedition), ...g.buildings] : g.enemies; const foes = faction === 'ally' ? g.enemies : [...g.heroes.filter(h => !h.expedition), ...g.buildings];
  if (spellId === 'area_heal' || spellId === 'temporary_shield') {
    for (const a of [...allies].filter(a => a.hp > 0 && inRange(a, center, spell.radius)).sort(byId)) impacts.push({ sourceId: caster.id, actionSequence: 2, targetId: a.id, damage: magnitude, source: point(caster), target: point(a), effectId: spellId, mode: spellId === 'area_heal' ? 'heal' : 'shield', durationTicks: spell.durationTicks });
  } else for (const a of [...foes].filter(a => a.hp > 0 && inRange(a, center, spell.radius)).sort(byId)) impacts.push({ sourceId: caster.id, actionSequence: 2, targetId: a.id, damage: magnitude, source: point(caster), target: point(a), effectId: spellId });
  emit(g, faction === 'enemy' ? 'commander_cast' : 'spell_used', { effectId: spellId, spellId, sourceId: caster.id, source: point(caster), target: point(center), position: point(center), radius: spell.radius, durationTicks: spell.durationTicks, amount: magnitude, ...(faction === 'enemy' ? { kind: (caster as Enemy).kind } : {}) });
}
/** Advances only battle ticks. A hidden-tab adapter must pause explicitly, then discard wall-time backlog. */
export function advanceTicks(g: GameState, count = 1): void { if (!int(count, 0, 100_000)) throw new Error('INVALID_TICK_COUNT'); for (let i = 0; i < count && g.phase === 'wave'; i++) tick(g); }
function tick(g: GameState): void {
  g.simTick++; g.waveTick++;
  const commands = g.queuedCommands.filter(c => c.tick <= g.simTick).sort((a, b) => a.sequence - b.sequence || (a.commandId < b.commandId ? -1 : a.commandId > b.commandId ? 1 : 0)); g.queuedCommands = g.queuedCommands.filter(c => c.tick > g.simTick);
  for (const c of commands) applyCommand(g, c);
  const impacts: Impact[] = []; const finishedCasts: Cast[] = []; const readyBuildings = new Set<string>(); const readyTeleports = new Set<string>(); const readyResurrection = new Set<string>(); const readyExpeditions = new Set<string>(); const aegisRevive = new Set<string>();
  for (const h of g.heroes) { if (h.expedition && --h.expedition.remainingTicks <= 0) readyExpeditions.add(h.id); h.attackCooldown = Math.max(0, h.attackCooldown - 1); h.abilityCooldown = Math.max(0, h.abilityCooldown - 1); h.stealCooldown = Math.max(0, h.stealCooldown - 1); tickShield(h); if (h.respawnTicks > 0 && --h.respawnTicks === 0) readyResurrection.add(h.id); if (h.teleport && --h.teleport.remainingTicks <= 0) readyTeleports.add(h.id); }
  for (const b of g.buildings) { b.attackCooldown = Math.max(0, b.attackCooldown - 1); tickShield(b); if (b.constructionTicks > 0 && --b.constructionTicks === 0) readyBuildings.add(b.id); }
  for (const e of g.enemies) { e.attackCooldown = Math.max(0, e.attackCooldown - 1); e.spellCooldown = Math.max(0, e.spellCooldown - 1); e.healCooldown = Math.max(0, e.healCooldown - 1); tickShield(e); if (e.slow && --e.slow.remainingTicks <= 0) delete e.slow; if (e.detour?.controlTicks && --e.detour.controlTicks === 0) e.detour.returning = true; }
  for (const s of g.summons) { s.ttlTicks--; s.readyTicks = Math.max(0, s.readyTicks - 1); s.attackCooldown = Math.max(0, s.attackCooldown - 1); }
  g.summons = g.summons.filter(s => s.ttlTicks > 0 && s.hp > 0);
  for (const c of g.casts) if (--c.remainingTicks <= 0) finishedCasts.push(c); g.casts = g.casts.filter(c => c.remainingTicks > 0);
  for (const p of g.projectiles) if (--p.remainingTicks <= 0) impacts.push({ sourceId: p.sourceId, targetId: p.targetId, actionSequence: 0, damage: p.damage, source: p.source, target: p.target, effectId: p.effectId }); g.projectiles = g.projectiles.filter(p => p.remainingTicks > 0);
  for (const group of [...g.spawnGroups].sort(byId)) if (group.spawned < group.count && g.waveTick >= group.delayTicks + group.spawned * group.intervalTicks + 1) {
    const d = edef(g, group.enemyKind); const start = (d.sidePath ? g.content.map.sidePath : g.content.map.paths[group.lane]!)[0]!; const e: Enemy = { id: `enemy-${g.activeWave}-${group.id}-${String(group.spawned).padStart(3, '0')}`, kind: d.kind, lane: group.lane, x: start.x, y: start.y, hp: d.hp, maxHp: d.hp, pathIndex: 1, attackCooldown: randomUint32(g) % 6, lastSpell: null, stealable: false, spellCooldown: 0, spellIndex: 0, healCooldown: 0, hidden: d.hidden, visible: !d.hidden }; group.spawned++; g.enemies.push(e); emit(g, 'enemy_spawned', { sourceId: e.id, position: point(e), kind: e.kind });
  }
  g.enemies.sort(byId); refreshVisibility(g);
  // Stage 3: movement and stable-ID target decisions. Escapes deal throne damage without bounty.
  const escaped = new Set<string>();
  const enemySpeed = (e: Enemy) => Math.max(1, Math.floor(edef(g, e.kind).speed * (100 - (e.slow?.percent ?? 0)) / 100));
  for (const e of g.enemies) {
    if (e.hp <= 0) continue; const d = edef(g, e.kind);
    if (e.detour && !e.detour.returning) continue;
    if (e.detour?.returning) { if (moveToward(e, e.detour.returnPoint, enemySpeed(e))) delete e.detour; continue; }
    const candidates = [...g.heroes.filter(h => h.hp > 0 && !h.expedition), ...g.buildings.filter(b => b.hp > 0)].filter(x => inRange(e, x, d.range)).sort((a, b) => { const siegePriority = d.role === 'siege' || e.kind === 'siege' ? Number('anchorId' in a) - Number('anchorId' in b) : 0; return siegePriority || dist2(e, a) - dist2(e, b) || byId(a, b); });
    const defender = candidates[0];
    if (defender) { if (e.attackCooldown === 0) { e.attackCooldown = d.attackTicks; impacts.push({ sourceId: e.id, actionSequence: 0, targetId: defender.id, damage: d.damage, source: point(e), target: point(defender), effectId: e.kind === 'ranged' ? 'enemy_bolt' : 'enemy_attack' }); } continue; }
    const path = d.sidePath ? g.content.map.sidePath : g.content.map.paths[e.lane]!; const target = path[e.pathIndex]!;
    if (moveToward(e, target, enemySpeed(e))) { e.pathIndex++; if (e.pathIndex >= path.length) { escaped.add(e.id); impacts.push({ sourceId: e.id, actionSequence: 0, targetId: 'throne', damage: d.throneDamage, source: point(e), target: point(g.content.map.throne), effectId: 'throne_hit' }); } }
  }
  refreshVisibility(g);
  for (const e of g.enemies) if (e.hp > 0 && !escaped.has(e.id) && edef(g, e.kind).role === 'healer' && e.healCooldown === 0) { const d = edef(g, e.kind); const ally = g.enemies.filter(a => a.hp > 0 && a.hp < a.maxHp && inRange(e, a, d.healRadius)).sort((a, b) => a.hp * b.maxHp - b.hp * a.maxHp || byId(a, b))[0]; if (ally) { e.healCooldown = d.healTicks; impacts.push({ sourceId: e.id, actionSequence: 1, targetId: ally.id, damage: d.healMagnitude, source: point(e), target: point(ally), effectId: 'enemy_heal', mode: 'heal' }); emit(g, 'enemy_heal_started', { effectId: 'enemy_heal', sourceId: e.id, targetId: ally.id, source: point(e), target: point(ally), amount: d.healMagnitude, durationTicks: 12 }); } }
  // Commanders rotate only the three known handlers; lastSpell is from an actual cast.
  for (const e of g.enemies) if (e.hp > 0 && !escaped.has(e.id) && edef(g, e.kind).commander && e.spellCooldown === 0) {
    const d = edef(g, e.kind); const spellId = d.spellRotation[e.spellIndex % 3] as SpellBehavior; e.spellIndex++; e.spellCooldown = d.spellCooldownTicks; e.lastSpell = spellId; e.stealable = true;
    const allies = [...g.heroes.filter(h => h.hp > 0 && !h.expedition), ...g.buildings.filter(b => b.hp > 0)].sort((a, b) => dist2(e, a) - dist2(e, b) || byId(a, b));
    const center = spellId === 'area_strike' && allies[0] && inRange(e, allies[0], d.range) ? point(allies[0]) : point(e);
    applySpell(g, spellId, e, center, 'enemy', impacts, 100);
  }
  // Finished casts spend their cooldown even when their original target disappeared.
  for (const c of finishedCasts.sort(byId)) {
    const h = g.heroes.find(h => h.id === c.heroId && h.hp > 0 && !h.expedition); if (!h) continue; const d = hdef(g, h.kind);
    if (c.kind === 'pudge') { const e = g.enemies.find(e => e.id === c.targetId && e.hp > 0 && !escaped.has(e.id)); if (!e) { emit(g, 'cast_missed', { sourceId: h.id, targetId: c.targetId, effectId: 'hook_miss' }); continue; }
      e.detour = { returnPoint: e.detour?.returnPoint ?? point(e), controlTicks: 45, returning: false }; const from = point(e); e.x = Math.min(g.content.map.bounds.maxX, h.x + 60); e.y = h.y; impacts.push({ sourceId: h.id, actionSequence: 1, targetId: e.id, damage: c.damage, source: point(h), target: point(e), effectId: 'hook_pull' }); emit(g, 'hook_pulled', { effectId: 'hook_pull', sourceId: h.id, targetId: e.id, source: from, target: point(e), durationTicks: 15 });
    } else if (c.kind === 'shaman') {
      for (let i = 0; i < d.summonCap; i++) { const angle = i * Math.PI * 2 / d.summonCap; const x = Math.round(c.target.x + Math.cos(angle) * 65), y = Math.round(c.target.y + Math.sin(angle) * 65); if (!insideMap(g, { x, y })) continue;
        const s: Summon = { id: `${c.id}-snake-${i}`, kind: 'snake', ownerId: h.id, x, y, hp: d.summonHp, maxHp: d.summonHp, ttlTicks: d.summonTTLTicks, readyTicks: i * d.summonIntervalTicks + d.summonIntervalTicks, attackCooldown: 0, damage: c.damage }; g.summons.push(s); emit(g, 'summon_created', { effectId: 'snake_rise', sourceId: s.id, position: point(s), durationTicks: s.readyTicks, kind: s.kind }); }
    } else if (c.kind === 'undying') {
      const s: Summon = { id: `${c.id}-tombstone`, kind: 'tombstone', ownerId: h.id, x: c.target.x, y: c.target.y, hp: d.summonHp, maxHp: d.summonHp, ttlTicks: d.summonTTLTicks, readyTicks: d.summonIntervalTicks, spawnCooldown: d.summonIntervalTicks, spawnSequence: 0, attackCooldown: 0, damage: c.damage }; g.summons.push(s); emit(g, 'summon_created', { effectId: 'tombstone_rise', sourceId: s.id, position: point(s), durationTicks: d.abilityTicks, kind: s.kind });
    } else if (c.kind === 'rubick') {
      if (c.mode === 'steal') { const e = g.enemies.find(e => e.id === c.targetId && e.hp > 0 && !escaped.has(e.id)); if (!e) { emit(g, 'cast_missed', { effectId: 'rubick_miss', sourceId: h.id, targetId: c.targetId }); continue; }
        h.stolenSpell = c.spellId!; emit(g, 'spell_stolen', { effectId: 'rubick_captured', spellId: c.spellId, sourceId: h.id, targetId: e.id, source: point(e), target: point(h), durationTicks: 18 });
      } else applySpell(g, c.spellId!, h, c.target, 'ally', impacts, 100 + (h.level - 1) * 45);
    } else if (c.kind === 'sniper') { const e = g.enemies.find(e => e.id === c.targetId && e.hp > 0 && !escaped.has(e.id)); if (!e) { emit(g, 'cast_missed', { effectId: 'sniper_miss', sourceId: h.id, targetId: c.targetId, source: point(h), target: c.target }); continue; }
      addProjectile(g, h, e, c.damage, 'sniper_shot', 0, impacts);
    }
  }
  // Tombstones produce bounded, sequential zombies. Children expire with their parent.
  for (const parent of [...g.summons].filter(s => s.kind === 'tombstone').sort(byId)) {
    if ((parent.spawnCooldown ?? 0) > 0) parent.spawnCooldown!--;
    const d = hdef(g, 'undying'); if ((parent.spawnCooldown ?? 0) > 0 || g.summons.filter(s => s.kind === 'zombie' && s.ownerId === parent.ownerId).length >= d.summonCap) continue;
    parent.spawnCooldown = d.summonIntervalTicks; const index = parent.spawnSequence ?? 0; parent.spawnSequence = index + 1;
    const z: Summon = { id: `${parent.id}-zombie-${index}`, kind: 'zombie', ownerId: parent.ownerId, parentId: parent.id, x: parent.x, y: parent.y, hp: d.summonHp, maxHp: d.summonHp, ttlTicks: parent.ttlTicks, readyTicks: 6, attackCooldown: 0, damage: parent.damage };
    g.summons.push(z); emit(g, 'summon_created', { effectId: 'zombie_rise', sourceId: z.id, position: point(z), durationTicks: 6, kind: z.kind });
  }
  g.summons = g.summons.filter(s => s.kind !== 'zombie' || g.summons.some(parent => parent.id === s.parentId && parent.kind === 'tombstone'));
  for (const h of [...g.heroes].sort(byId)) if (h.hp > 0 && !h.expedition && !h.teleport && !g.casts.some(c => c.heroId === h.id) && h.attackCooldown === 0) {
    const d = hdef(g, h.kind), range = d.range + (h.level - 1) * 25; const e = h.kind === 'sniper' ? sniperTarget(g, h, range) : targetEnemy(g, h, range);
    if (e && !escaped.has(e.id)) { h.attackCooldown = cooldown(g, h, d.attackTicks); const effectId = h.kind === 'pudge' ? 'pudge_attack' : h.kind === 'undying' ? 'undying_attack' : h.kind === 'sniper' ? 'sniper_bolt' : h.kind === 'rubick' ? 'rubick_bolt' : 'shaman_bolt';
      const extra = heroItems(g, h).find(item => item.behaviorId === 'additional_target'); const targets = [e, ...g.enemies.filter(t => t.id !== e.id && t.hp > 0 && t.visible && !escaped.has(t.id) && inRange(h, t, range)).sort((a, b) => dist2(h, a) - dist2(h, b) || byId(a, b)).slice(0, extra ? extra.maxTargets - 1 : 0)];
      for (const target of targets) addProjectile(g, h, target, scale(d.damage, h.level), effectId, ['pudge', 'undying'].includes(h.kind) ? 0 : 6, impacts);
    }
  }
  for (const h of [...g.heroes].sort(byId)) if (h.hp > 0 && !h.expedition) for (const item of heroItems(g, h)) if (item.behaviorId === 'healing_aura' && g.simTick % item.intervalTicks === 0) {
    for (const ally of [...g.heroes.filter(a => !a.expedition), ...g.buildings].filter(a => a.hp > 0 && a.hp < a.maxHp && inRange(h, a, item.radius)).sort(byId)) { impacts.push({ sourceId: h.id, actionSequence: 3, targetId: ally.id, damage: item.magnitude, source: point(h), target: point(ally), effectId: 'healing_aura', mode: 'heal' }); emit(g, 'aura_pulse', { effectId: 'healing_aura', sourceId: h.id, targetId: ally.id, source: point(h), target: point(ally), position: point(h), radius: item.radius, amount: item.magnitude, durationTicks: 12 }); }
  }
  for (const b of [...g.buildings].sort(byId)) if (b.hp > 0 && b.constructionTicks === 0 && !readyBuildings.has(b.id) && b.attackCooldown === 0) { const d = bdef(g, b.kind); const e = targetEnemy(g, b, d.range + (b.level - 1) * 20); if (e && !escaped.has(e.id)) { b.attackCooldown = d.attackTicks;
      if (b.kind === 'slow_totem') { for (const t of g.enemies.filter(t => t.hp > 0 && inRange(b, t, d.range + (b.level - 1) * 20))) t.slow = { remainingTicks: d.slowTicks, percent: Math.min(d.slowCapPercent, Math.floor(d.slowPercent * (100 + (b.level - 1) * 45) / 100)) }; emit(g, 'slow_applied', { effectId: 'slow_pulse', sourceId: b.id, source: point(b), target: point(b), position: point(b), radius: d.range + (b.level - 1) * 20, durationTicks: d.slowTicks }); }
      else if (b.kind === 'ballista') addProjectile(g, b, e, scale(d.damage, b.level), 'ballista_shot', 8, impacts);
      else { const chain = [e, ...g.enemies.filter(x => x.id !== e.id && x.hp > 0 && x.visible && !escaped.has(x.id) && inRange(e, x, 180)).sort((a, z) => dist2(e, a) - dist2(e, z) || byId(a, z)).slice(0, 2)]; let from: { id: string } & Point = b; chain.forEach((t, i) => { const damage = Math.floor(scale(d.damage, b.level) * (100 - i * 20) / 100); impacts.push({ sourceId: b.id, actionSequence: i, targetId: t.id, damage, source: point(from), target: point(t), effectId: 'chain_lightning' }); emit(g, 'projectile_fired', { effectId: 'chain_lightning', sourceId: b.id, targetId: t.id, source: point(from), target: point(t), durationTicks: 10 }); from = t; }); } } }
  for (const s of [...g.summons].sort(byId)) if (s.hp > 0 && !s.readyTicks && s.kind !== 'tombstone') {
    const d = hdef(g, s.kind === 'zombie' ? 'undying' : 'shaman');
    const e = s.kind === 'zombie' ? g.enemies.filter(e => e.hp > 0 && e.visible && !escaped.has(e.id)).sort((a, b) => dist2(s, a) - dist2(s, b) || byId(a, b))[0] : targetEnemy(g, s, d.summonRange);
    if (e && !escaped.has(e.id)) { if (s.kind === 'zombie' && !inRange(s, e, d.summonRange)) moveToward(s, e, d.summonSpeed);
      else if (!s.attackCooldown) { s.attackCooldown = d.summonAttackTicks; addProjectile(g, s, e, s.damage, s.kind === 'zombie' ? 'zombie_attack' : 'snake_bolt', s.kind === 'zombie' ? 0 : 6, impacts); } }
  }
  // Stage 4: ordered impacts; a dead target cannot receive a second fatal reward.
  impacts.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0) || a.actionSequence - b.actionSequence || (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));
  for (const a of impacts) {
    if (a.targetId === 'throne') { g.throneHp = Math.max(0, g.throneHp - a.damage); emit(g, 'throne_damaged', { effectId: 'throne_hit', sourceId: a.sourceId, targetId: 'throne', source: a.source, target: a.target, amount: a.damage }); continue; }
    const target = g.enemies.find(e => e.id === a.targetId) ?? g.heroes.find(h => h.id === a.targetId) ?? g.buildings.find(b => b.id === a.targetId);
    if (!target || target.hp <= 0 || escaped.has(target.id)) continue;
    if (a.mode === 'heal') { const amount = Math.min(a.damage, target.maxHp - target.hp); target.hp += amount; emit(g, 'unit_healed', { sourceId: a.sourceId, targetId: target.id, amount, position: point(target), spellId: 'area_heal' }); continue; }
    if (a.mode === 'shield') { target.shield = { absorption: a.damage, remainingTicks: a.durationTicks! }; continue; }
    const armor = 'lane' in target ? edef(g, target.kind).armorPercent : 0; const damage = Math.max(1, Math.floor(a.damage * (100 - armor) / 100)); const absorbed = target.shield ? Math.min(target.shield.absorption, damage) : 0; if (target.shield) { target.shield.absorption -= absorbed; if (target.shield.absorption <= 0) delete target.shield; } target.hp = Math.max(0, target.hp - (damage - absorbed)); emit(g, 'projectile_hit', { effectId: a.effectId, sourceId: a.sourceId, targetId: target.id, source: a.source, target: point(target), amount: a.damage });
  }
  // Stage 5: deaths and bounty exactly once by stable ID.
  for (const e of [...g.enemies].sort(byId)) if (escaped.has(e.id)) emit(g, 'enemy_escaped', { sourceId: e.id, position: point(e), kind: e.kind }); else if (e.hp <= 0) { const amount = edef(g, e.kind).reward; g.gold += amount; g.statistics.kills++; g.statistics.goldEarned += amount; emit(g, 'unit_died', { effectId: 'unit_died', sourceId: e.id, position: point(e), kind: e.kind, amount }); emit(g, 'gold_changed', { amount }); }
  g.enemies = g.enemies.filter(e => e.hp > 0 && !escaped.has(e.id));
  for (const h of [...g.heroes].sort(byId)) if (h.hp <= 0 && h.respawnTicks === 0 && !readyResurrection.has(h.id)) { if (h.aegisToken) { h.aegisToken = false; aegisRevive.add(h.id); } else h.respawnTicks = g.content.respawnTicks; g.casts = g.casts.filter(c => c.heroId !== h.id); if (h.teleport) { emit(g, 'teleport_cancelled', { effectId: 'teleport_cancel', sourceId: h.id, source: h.teleport.from, target: h.teleport.to }); delete h.teleport; } emit(g, 'unit_died', { effectId: 'unit_died', sourceId: h.id, position: point(h), kind: h.kind }); }
  for (const b of [...g.buildings].sort(byId)) if (b.hp <= 0) emit(g, 'unit_died', { effectId: 'unit_died', sourceId: b.id, position: point(b), kind: b.kind }); g.buildings = g.buildings.filter(b => b.hp > 0);
  // Stage 6: paid operations complete only for survivors. Dead-at-completion teleport cancels.
  for (const b of g.buildings) if (readyBuildings.has(b.id)) emit(g, 'building_ready', { effectId: 'building_ready', sourceId: b.id, position: point(b), kind: b.kind });
  for (const h of g.heroes) { if (readyExpeditions.has(h.id) && h.hp > 0 && h.expedition) completeExpedition(g, h); if (aegisRevive.has(h.id)) { h.hp = h.maxHp; h.respawnTicks = 0; delete h.shield; emit(g, 'hero_returned', { effectId: 'aegis_revive', sourceId: h.id, position: point(h), kind: h.kind, durationTicks: 24 }); } if (readyTeleports.has(h.id) && h.hp > 0 && h.teleport) completeTeleport(g, h); if (readyResurrection.has(h.id)) { h.hp = h.maxHp; emit(g, 'hero_returned', { effectId: 'hero_returned', sourceId: h.id, position: point(h), kind: h.kind }); } }
  // Stage 7: defeat has priority over last-enemy / last-wave victory.
  if (g.throneHp <= 0) { finish(g, 'defeat'); return; }
  if (g.spawnGroups.every(x => x.spawned >= x.count) && g.enemies.length === 0) resolveWave(g);
}
function completeTeleport(g: GameState, h: Hero): void { const t = h.teleport!; h.anchorId = t.targetAnchorId; h.x = t.to.x; h.y = t.to.y; delete h.teleport; emit(g, 'teleport_completed', { effectId: 'teleport_complete', sourceId: h.id, source: t.from, target: point(h), durationTicks: 18 }); }
function discardPending(g: GameState): void { for (const c of g.queuedCommands) result(g, c, false, 'WAVE_ENDED'); g.queuedCommands = []; }
function resolveWave(g: GameState): void {
  const wave = g.activeWave!; const w = g.content.waves.find(w => w.number === wave)!; g.gold += w.reward; g.statistics.goldEarned += w.reward; emit(g, 'gold_changed', { amount: w.reward }); emit(g, 'wave_finished', { wave, amount: w.reward });
  g.projectiles = []; g.summons = []; g.casts = []; g.spawnGroups = []; for (const actor of [...g.heroes, ...g.buildings]) delete actor.shield;
  for (const b of g.buildings) if (b.constructionTicks > 0) { b.constructionTicks = 0; emit(g, 'building_ready', { effectId: 'building_ready', sourceId: b.id, position: point(b), kind: b.kind }); }
  for (const h of g.heroes) if (h.hp > 0 && h.teleport) completeTeleport(g, h);
  g.lastCompletedWave = wave; g.nextWave = wave === g.content.waves.length ? null : wave + 1; delete g.activeWave; discardPending(g);
  if (g.nextWave === null) finish(g, 'victory'); else { g.phase = 'preparation'; emit(g, 'checkpoint_ready', { wave }); }
}
function finish(g: GameState, outcome: 'victory' | 'defeat'): void { if (g.phase === 'victory' || g.phase === 'defeat') return; g.phase = outcome; g.projectiles = []; g.casts = []; g.summons = []; discardPending(g); emit(g, 'run_finished', { reason: outcome, wave: g.lastCompletedWave }); }
export function getFinishResult(g: GameState): FinishResult { if (g.phase !== 'victory' && g.phase !== 'defeat') throw new Error('RUN_NOT_FINISHED'); return { outcome: g.phase, lastCompletedWave: g.lastCompletedWave, wave: g.activeWave ?? g.lastCompletedWave, simTick: g.simTick, gold: g.gold, throneHp: g.throneHp, seed: g.seed, versions: { ...g.versions }, statistics: { ...g.statistics } }; }
export function createSnapshot(g: GameState): GameSnapshot {
  if (g.phase !== 'preparation' || g.nextWave === null || g.activeWave !== undefined || g.enemies.length || g.projectiles.length || g.summons.length || g.casts.length || g.buildings.some(b => b.constructionTicks > 0) || g.heroes.some(h => h.teleport || h.shield) || g.buildings.some(b => b.shield)) throw new Error('UNSAFE_CHECKPOINT');
  return { schemaVersion: SNAPSHOT_VERSION, versions: { ...g.versions }, phase: 'preparation', seed: g.seed, rngState: g.rngState, simTick: g.simTick, commandEpoch: g.commandEpoch,
    lastCompletedWave: g.lastCompletedWave, nextWave: g.nextWave, gold: g.gold, throneHp: g.throneHp, scrolls: g.scrolls, statistics: { ...g.statistics }, pendingRewards: structuredClone(g.pendingRewards),
    heroes: [...g.heroes].sort(byId).map(h => ({ id: h.id, kind: h.kind, anchorId: h.anchorId, level: h.level, hp: h.hp, attackCooldown: h.attackCooldown, abilityCooldown: h.abilityCooldown, respawnTicks: h.respawnTicks, spentGold: h.spentGold, stolenSpell: h.stolenSpell, stealCooldown: h.stealCooldown, priority: h.priority, items: [...h.items] as [string | null, string | null], expedition: h.expedition && { ...h.expedition }, aegisToken: h.aegisToken })),
    buildings: [...g.buildings].sort(byId).map(b => ({ id: b.id, kind: b.kind, padId: b.padId, level: b.level, hp: b.hp, attackCooldown: b.attackCooldown, spentGold: b.spentGold })) };
}
export function validateSnapshot(input: unknown, content: GameContent, pins?: VersionPins): ValidationResult {
  const errors: string[] = []; const fail = (code: string) => { if (!errors.includes(code)) errors.push(code); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['SNAPSHOT_OBJECT'] };
  const s = input as Record<string, unknown>;
  const top = new Set(['schemaVersion', 'versions', 'phase', 'seed', 'rngState', 'simTick', 'commandEpoch', 'lastCompletedWave', 'nextWave', 'gold', 'throneHp', 'scrolls', 'statistics', 'pendingRewards', 'heroes', 'buildings']); if (Object.keys(s).some(k => !top.has(k))) fail('SNAPSHOT_UNKNOWN_FIELD');
  if (s.schemaVersion !== 4 || s.phase !== 'preparation') fail('SNAPSHOT_FORMAT');
  const v = s.versions as Record<string, unknown> | undefined; const expected = pins ?? { core: CORE_VERSION, content: content.contentVersion, metadataSchema: content.metadataSchemaVersion };
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['core', 'content', 'metadataSchema'].includes(k)) || v.core !== expected.core || v.content !== expected.content || v.metadataSchema !== expected.metadataSchema || expected.core !== CORE_VERSION || expected.content !== content.contentVersion || expected.metadataSchema !== content.metadataSchemaVersion) fail('SNAPSHOT_VERSION');
  for (const k of ['seed', 'rngState']) if (!int(s[k], 0, 0xFFFFFFFF)) fail(`SNAPSHOT_${k}`);
  for (const k of ['simTick', 'commandEpoch', 'gold']) if (!int(s[k])) fail(`SNAPSHOT_${k}`);
  if (!int(s.throneHp, 1, content.throneHp) || !int(s.scrolls, 0, 99)) fail('SNAPSHOT_RESOURCES');
  if (!int(s.lastCompletedWave, 0, content.waves.length - 1) || !int(s.nextWave, 1, content.waves.length) || s.nextWave !== (s.lastCompletedWave as number) + 1) fail('SNAPSHOT_WAVE');
  const stats = s.statistics as Record<string, unknown> | undefined;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats) || Object.keys(stats).some(k => !['kills', 'builds', 'upgrades', 'goldEarned'].includes(k)) || !['kills', 'builds', 'upgrades', 'goldEarned'].every(k => int(stats[k]))) fail('SNAPSHOT_STATISTICS');
  let activeExpeditions = 0; const expeditionRewardIds = new Set<string>();
  const anchors = new Set<string>(); const actorIds = new Set<string>();
  if (!Array.isArray(s.heroes) || s.heroes.length !== content.heroes.length) fail('SNAPSHOT_HEROES');
  else for (const inputHero of s.heroes) {
    if (!inputHero || typeof inputHero !== 'object' || Array.isArray(inputHero)) { fail('SNAPSHOT_HERO'); continue; } const h = inputHero as Record<string, unknown>;
    if (Object.keys(h).some(k => !['id', 'kind', 'anchorId', 'level', 'hp', 'attackCooldown', 'abilityCooldown', 'respawnTicks', 'spentGold', 'stolenSpell', 'stealCooldown', 'priority', 'items', 'expedition', 'aegisToken'].includes(k))) fail('SNAPSHOT_HERO_FIELD');
    const d = content.heroes.find(d => d.kind === h.kind); if (!d || h.id !== d.kind || actorIds.has(h.id as string)) { fail('SNAPSHOT_HERO_ID'); continue; } actorIds.add(h.id as string);
    if (!content.map.places.some(p => p.id === h.anchorId && p.kind === 'hero_anchor') || anchors.has(h.anchorId as string)) fail('SNAPSHOT_ANCHOR'); anchors.add(h.anchorId as string);
    if (!int(h.level, 1, 3) || !int(h.hp, 0, scale(d.hp, h.level as number)) || !int(h.attackCooldown, 0, d.attackTicks) || !int(h.abilityCooldown, 0, d.abilityCooldownTicks) || !int(h.respawnTicks, 0, content.respawnTicks)) fail('SNAPSHOT_HERO_STATS');
    if ((h.hp === 0) !== ((h.respawnTicks as number) > 0)) fail('SNAPSHOT_RESURRECTION');
    if (h.kind === 'rubick' ? h.stolenSpell !== null && !content.spells.some(spell => spell.behaviorId === h.stolenSpell) || !int(h.stealCooldown, 0, d.stealCooldownTicks) : h.stolenSpell !== null || h.stealCooldown !== 0) fail('SNAPSHOT_STOLEN_SPELL');
    if (h.kind === 'sniper' ? !['nearest', 'strongest', 'commander'].includes(h.priority as string) : h.priority !== 'nearest') fail('SNAPSHOT_PRIORITY');
    if (typeof h.aegisToken !== 'boolean') fail('SNAPSHOT_AEGIS');
    if (!Array.isArray(h.items) || h.items.length !== 2) fail('SNAPSHOT_ITEMS');
    else { const behaviors = new Set<string>(); for (const id of h.items) if (id !== null) { const item = content.items.find(i => i.id === id); if (!item || !item.compatibleHeroes.includes(d.kind) || behaviors.has(item.behaviorId)) fail('SNAPSHOT_ITEM'); else behaviors.add(item.behaviorId); } }
    if (h.expedition !== null) { activeExpeditions++; const e = h.expedition as Record<string, unknown>;
      if (!e || typeof e !== 'object' || Array.isArray(e)) fail('SNAPSHOT_EXPEDITION'); else { const def = content.expeditions.find(def => def.kind === e.kind); if (!def || Object.keys(e).some(key => !['kind', 'remainingTicks', 'totalTicks', 'rewardId'].includes(key)) || e.totalTicks !== def.durationTicks || !int(e.remainingTicks, 1, def.durationTicks) || !safeId(e.rewardId) || expeditionRewardIds.has(e.rewardId) || h.hp === 0 || (e.kind === 'roshan' && h.aegisToken)) fail('SNAPSHOT_EXPEDITION'); if (safeId(e.rewardId)) expeditionRewardIds.add(e.rewardId); }
    }
    const spent = h.level === 1 ? 0 : h.level === 2 ? d.upgradeCosts[0] : d.upgradeCosts[0] + d.upgradeCosts[1]; if (h.spentGold !== spent) fail('SNAPSHOT_HERO_SPENT');
  }
  if (activeExpeditions > 1) fail('SNAPSHOT_EXPEDITION_LIMIT');
  if (activeExpeditions > 0 && Array.isArray(s.pendingRewards) && s.pendingRewards.length > 0) fail('SNAPSHOT_REWARD_EXPEDITION_CONFLICT');
  if (!Array.isArray(s.pendingRewards) || s.pendingRewards.length > 1) fail('SNAPSHOT_PENDING_REWARDS');
  else { const rewardIds = new Set<string>(); for (const inputReward of s.pendingRewards) {
    if (!inputReward || typeof inputReward !== 'object' || Array.isArray(inputReward)) { fail('SNAPSHOT_REWARD'); continue; } const r = inputReward as Record<string, unknown>; const shop = content.expeditions.find(e => e.kind === 'shop')!;
    if (Object.keys(r).some(k => !['id', 'heroId', 'kind', 'options'].includes(k)) || !safeId(r.id) || rewardIds.has(r.id) || expeditionRewardIds.has(r.id) || r.kind !== 'shop' || !content.heroes.some(h => h.kind === r.heroId) || !Array.isArray(r.options) || canonical(r.options) !== canonical(shop.itemOptions)) fail('SNAPSHOT_REWARD'); if (safeId(r.id)) rewardIds.add(r.id);
    if (Array.isArray(s.heroes) && s.heroes.some(h => (h as SavedHero)?.id === r.heroId && (h as SavedHero).expedition !== null)) fail('SNAPSHOT_REWARD_HERO_ABSENT');
  } }
  const pads = new Set<string>();
  if (!Array.isArray(s.buildings) || s.buildings.length > content.map.places.filter(p => p.kind === 'building_pad').length) fail('SNAPSHOT_BUILDINGS');
  else for (const inputBuilding of s.buildings) {
    if (!inputBuilding || typeof inputBuilding !== 'object' || Array.isArray(inputBuilding)) { fail('SNAPSHOT_BUILDING'); continue; } const b = inputBuilding as Record<string, unknown>;
    if (Object.keys(b).some(k => !['id', 'kind', 'padId', 'level', 'hp', 'attackCooldown', 'spentGold'].includes(k))) fail('SNAPSHOT_BUILDING_FIELD');
    const d = content.buildings.find(d => d.kind === b.kind); if (!d || !safeId(b.id) || actorIds.has(b.id as string)) { fail('SNAPSHOT_BUILDING_ID'); continue; } actorIds.add(b.id as string);
    if (!content.map.places.some(p => p.id === b.padId && p.kind === 'building_pad') || pads.has(b.padId as string)) fail('SNAPSHOT_PAD'); pads.add(b.padId as string);
    if (!int(b.level, 1, 3) || !int(b.hp, 1, scale(d.hp, b.level as number)) || !int(b.attackCooldown, 0, d.attackTicks)) fail('SNAPSHOT_BUILDING_STATS');
    const spent = d.cost + (b.level === 1 ? 0 : b.level === 2 ? d.upgradeCosts[0] : d.upgradeCosts[0] + d.upgradeCosts[1]); if (b.spentGold !== spent) fail('SNAPSHOT_BUILDING_SPENT');
  }
  if (errors.length) return { valid: false, errors };
  const snapshot = structuredClone(input) as GameSnapshot; snapshot.heroes.sort(byId); snapshot.buildings.sort(byId); return { valid: true, errors: [], snapshot };
}
export function restoreSnapshot(content: GameContent, input: unknown, options: { newEpoch?: boolean; pins?: VersionPins } = {}): GameState {
  const checked = validateSnapshot(input, content, options.pins); if (!checked.valid || !checked.snapshot) throw new Error(`INVALID_SNAPSHOT:${checked.errors.join(',')}`); const s = checked.snapshot;
  const g = createGame(content, s.seed, s.versions); g.rngState = s.rngState; g.simTick = s.simTick; g.commandEpoch = s.commandEpoch + (options.newEpoch === false ? 0 : 1); g.lastCompletedWave = s.lastCompletedWave; g.nextWave = s.nextWave; g.gold = s.gold; g.throneHp = s.throneHp; g.scrolls = s.scrolls; g.statistics = { ...s.statistics }; g.pendingRewards = structuredClone(s.pendingRewards);
  g.heroes = s.heroes.map(h => { const p = content.map.places.find(p => p.id === h.anchorId)!; return { ...h, x: p.x, y: p.y, maxHp: scale(content.heroes.find(d => d.kind === h.kind)!.hp, h.level) }; });
  g.buildings = s.buildings.map(b => { const p = content.map.places.find(p => p.id === b.padId)!; return { ...b, x: p.x, y: p.y, maxHp: scale(content.buildings.find(d => d.kind === b.kind)!.hp, b.level), constructionTicks: 0 }; }); return g;
}
