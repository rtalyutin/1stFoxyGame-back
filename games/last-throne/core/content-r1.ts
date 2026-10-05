/** Immutable R1 balance. Published PostgreSQL EAV rows are the runtime source. */
export type HeroKind = 'pudge' | 'shaman';
export type BuildingKind = 'ballista' | 'magic_tower';
export type PlaceKind = 'hero_anchor' | 'building_pad';
export interface Point { x: number; y: number }
export interface Place extends Point { id: string; kind: PlaceKind }
export interface HeroDefinition { kind: HeroKind; label: string; anchorId: string; hp: number; damage: number; range: number; attackTicks: number; abilityTicks: number; abilityCooldownTicks: number; abilityRange: number; abilityDamage: number; upgradeCosts: [number, number] }
export interface BuildingDefinition { kind: BuildingKind; label: string; cost: number; hp: number; damage: number; range: number; attackTicks: number; buildTicks: number; upgradeCosts: [number, number] }
export interface EnemyDefinition { kind: string; label: string; hp: number; damage: number; speed: number; range: number; attackTicks: number; throneDamage: number; reward: number; movable: boolean }
export interface WaveGroup { id: string; lane: number; enemyKind: string; count: number; intervalTicks: number; delayTicks: number }
export interface WaveDefinition { number: number; reward: number; groups: WaveGroup[] }
export interface GameContent {
  contentVersion: string; metadataSchemaVersion: string; coreCompatibility: string[];
  ticksPerSecond: 30; initialGold: number; throneHp: number; scrollCost: number; teleportTicks: number; respawnTicks: number; sellPercent: number;
  map: { scale: number; bounds: { minX: number; maxX: number; minY: number; maxY: number }; throne: Point; places: Place[]; paths: Point[][] };
  heroes: HeroDefinition[]; buildings: BuildingDefinition[]; enemies: EnemyDefinition[]; waves: WaveDefinition[];
}
export interface ContentRow { type: string; code: string; parameters: Record<string, string | number | boolean> }
export const CORE_VERSION = 'r1-core-1';
export const SNAPSHOT_VERSION = 2;
export const defaultR1Content: GameContent = {
  contentVersion: 'r1-content-1', metadataSchemaVersion: 'r1-meta-1', coreCompatibility: [CORE_VERSION], ticksPerSecond: 30,
  initialGold: 620, throneHp: 240, scrollCost: 50, teleportTicks: 75, respawnTicks: 900, sellPercent: 70,
  map: { scale: 0.01, bounds: { minX: -1100, maxX: 1100, minY: -800, maxY: 800 }, throne: { x: 950, y: 0 },
    paths: [
      [{ x: -1050, y: -580 }, { x: -420, y: -580 }, { x: 160, y: -460 }, { x: 580, y: -180 }, { x: 950, y: 0 }],
      [{ x: -1050, y: 0 }, { x: -420, y: 0 }, { x: 160, y: 0 }, { x: 580, y: 0 }, { x: 950, y: 0 }],
      [{ x: -1050, y: 580 }, { x: -420, y: 580 }, { x: 160, y: 460 }, { x: 580, y: 180 }, { x: 950, y: 0 }]
    ], places: [
      { id: 'pad-n1', kind: 'building_pad', x: -500, y: -400 }, { id: 'pad-n2', kind: 'building_pad', x: 0, y: -640 }, { id: 'pad-n3', kind: 'building_pad', x: 350, y: -500 },
      { id: 'pad-m1', kind: 'building_pad', x: -500, y: 180 }, { id: 'pad-m2', kind: 'building_pad', x: 0, y: -190 }, { id: 'pad-m3', kind: 'building_pad', x: 440, y: -130 },
      { id: 'pad-s1', kind: 'building_pad', x: -500, y: 400 }, { id: 'pad-s2', kind: 'building_pad', x: 0, y: 640 }, { id: 'pad-s3', kind: 'building_pad', x: 350, y: 500 },
      { id: 'anchor-n1', kind: 'hero_anchor', x: -260, y: -570 }, { id: 'anchor-n2', kind: 'hero_anchor', x: 300, y: -340 },
      { id: 'anchor-m1', kind: 'hero_anchor', x: -260, y: 0 }, { id: 'anchor-m2', kind: 'hero_anchor', x: 300, y: 100 },
      { id: 'anchor-s1', kind: 'hero_anchor', x: -260, y: 570 }, { id: 'anchor-s2', kind: 'hero_anchor', x: 300, y: 340 }
    ] },
  heroes: [
    { kind: 'pudge', label: 'Pudge', anchorId: 'anchor-m1', hp: 440, damage: 32, range: 140, attackTicks: 27, abilityTicks: 12, abilityCooldownTicks: 330, abilityRange: 700, abilityDamage: 100, upgradeCosts: [120, 200] },
    { kind: 'shaman', label: 'Shadow Shaman', anchorId: 'anchor-n2', hp: 230, damage: 23, range: 330, attackTicks: 33, abilityTicks: 18, abilityCooldownTicks: 510, abilityRange: 600, abilityDamage: 27, upgradeCosts: [140, 220] }
  ], buildings: [
    { kind: 'ballista', label: 'Баллиста', cost: 100, hp: 230, damage: 36, range: 390, attackTicks: 33, buildTicks: 90, upgradeCosts: [100, 160] },
    { kind: 'magic_tower', label: 'Магическая башня', cost: 140, hp: 180, damage: 32, range: 360, attackTicks: 36, buildTicks: 120, upgradeCosts: [130, 210] }
  ], enemies: [
    { kind: 'melee', label: 'Крип', hp: 95, damage: 10, speed: 4, range: 110, attackTicks: 36, throneDamage: 14, reward: 12, movable: true },
    { kind: 'ranged', label: 'Стрелок', hp: 72, damage: 9, speed: 4, range: 260, attackTicks: 42, throneDamage: 12, reward: 14, movable: true },
    { kind: 'siege', label: 'Осадный командир', hp: 720, damage: 32, speed: 3, range: 300, attackTicks: 75, throneDamage: 65, reward: 100, movable: false }
  ], waves: Array.from({ length: 5 }, (_, i) => ({ number: i + 1, reward: 55 + i * 15, groups: [0, 1, 2].map(lane => ({ id: `w${i + 1}-l${lane}`, lane, enemyKind: i === 4 && lane === 1 ? 'siege' : i > 1 && lane === 0 ? 'ranged' : 'melee', count: i === 4 && lane === 1 ? 1 : 4 + i, intervalTicks: 54 - i * 3, delayTicks: lane * 15 })) }))
};

/** All fields are scalar typed EAV parameters; no JSON blob is published as truth. */
export function contentRows(content: GameContent = defaultR1Content): ContentRow[] {
  const rows: ContentRow[] = [{ type: 'game_config', code: 'r1', parameters: {
    code: 'r1', ticks_per_second: content.ticksPerSecond, initial_gold: content.initialGold, throne_hp: content.throneHp, scroll_cost: content.scrollCost,
    teleport_ticks: content.teleportTicks, respawn_ticks: content.respawnTicks, sell_percent: content.sellPercent, map_scale: content.map.scale,
    min_x: content.map.bounds.minX, max_x: content.map.bounds.maxX, min_y: content.map.bounds.minY, max_y: content.map.bounds.maxY,
    throne_x: content.map.throne.x, throne_y: content.map.throne.y
  } }];
  for (const p of content.map.places) rows.push({ type: 'map_place', code: p.id, parameters: { code: p.id, kind: p.kind, x: p.x, y: p.y } });
  content.map.paths.forEach((path, lane) => path.forEach((p, ordinal) => rows.push({ type: 'path_point', code: `lane-${lane}-${ordinal}`, parameters: { code: `lane-${lane}-${ordinal}`, lane, ordinal, x: p.x, y: p.y } })));
  for (const h of content.heroes) rows.push({ type: 'hero_definition', code: h.kind, parameters: { code: h.kind, label: h.label, anchor_id: h.anchorId, hp: h.hp, damage: h.damage, range: h.range, attack_ticks: h.attackTicks, ability_ticks: h.abilityTicks, ability_cooldown_ticks: h.abilityCooldownTicks, ability_range: h.abilityRange, ability_damage: h.abilityDamage, upgrade_cost_2: h.upgradeCosts[0], upgrade_cost_3: h.upgradeCosts[1] } });
  for (const b of content.buildings) rows.push({ type: 'building_definition', code: b.kind, parameters: { code: b.kind, label: b.label, cost: b.cost, hp: b.hp, damage: b.damage, range: b.range, attack_ticks: b.attackTicks, build_ticks: b.buildTicks, upgrade_cost_2: b.upgradeCosts[0], upgrade_cost_3: b.upgradeCosts[1] } });
  for (const e of content.enemies) rows.push({ type: 'enemy_definition', code: e.kind, parameters: { code: e.kind, label: e.label, hp: e.hp, damage: e.damage, speed: e.speed, range: e.range, attack_ticks: e.attackTicks, throne_damage: e.throneDamage, reward: e.reward, movable: e.movable } });
  for (const w of content.waves) {
    rows.push({ type: 'wave_definition', code: `wave-${w.number}`, parameters: { code: `wave-${w.number}`, number: w.number, reward: w.reward } });
    for (const g of w.groups) rows.push({ type: 'wave_group', code: g.id, parameters: { code: g.id, wave: w.number, lane: g.lane, enemy_code: g.enemyKind, count: g.count, interval_ticks: g.intervalTicks, delay_ticks: g.delayTicks } });
  }
  return rows;
}

/** Convert verified, pinned content projection returned by the API. */
export function parseContentProjection(projection: unknown): GameContent {
  if (!projection || typeof projection !== 'object') throw new Error('CONTENT_INVALID');
  const p = projection as Record<string, unknown>;
  if (!Array.isArray(p.entities) || typeof p.contentVersion !== 'string' || typeof p.metadataSchemaVersion !== 'string' || !Array.isArray(p.coreCompatibility) || !p.coreCompatibility.includes(CORE_VERSION)) throw new Error('CONTENT_INCOMPATIBLE');
  const entities = p.entities as Array<{ type: string; parameters: Record<string, unknown> }>;
  const rows = (type: string) => entities.filter(e => e.type === type).map(e => e.parameters);
  const n = (r: Record<string, unknown>, key: string, integer = true): number => { const v = typeof r[key] === 'string' ? Number(r[key]) : r[key]; if (typeof v !== 'number' || !Number.isFinite(v) || (integer && !Number.isSafeInteger(v))) throw new Error(`CONTENT_PARAMETER_${key}`); return v; };
  const s = (r: Record<string, unknown>, key: string): string => { if (typeof r[key] !== 'string') throw new Error(`CONTENT_PARAMETER_${key}`); return r[key]; };
  const gs = rows('game_config'); if (gs.length !== 1) throw new Error('CONTENT_CONFIG'); const g = gs[0]!;
  const paths: Point[][] = [0, 1, 2].map(lane => rows('path_point').filter(r => n(r, 'lane') === lane).sort((a, b) => n(a, 'ordinal') - n(b, 'ordinal')).map(r => ({ x: n(r, 'x'), y: n(r, 'y') })));
  const result: GameContent = {
    contentVersion: p.contentVersion, metadataSchemaVersion: p.metadataSchemaVersion, coreCompatibility: p.coreCompatibility as string[], ticksPerSecond: n(g, 'ticks_per_second') as 30,
    initialGold: n(g, 'initial_gold'), throneHp: n(g, 'throne_hp'), scrollCost: n(g, 'scroll_cost'), teleportTicks: n(g, 'teleport_ticks'), respawnTicks: n(g, 'respawn_ticks'), sellPercent: n(g, 'sell_percent'),
    map: { scale: n(g, 'map_scale', false), bounds: { minX: n(g, 'min_x'), maxX: n(g, 'max_x'), minY: n(g, 'min_y'), maxY: n(g, 'max_y') }, throne: { x: n(g, 'throne_x'), y: n(g, 'throne_y') }, paths,
      places: rows('map_place').map(r => ({ id: s(r, 'code'), kind: s(r, 'kind') as PlaceKind, x: n(r, 'x'), y: n(r, 'y') })) },
    heroes: rows('hero_definition').map(r => ({ kind: s(r, 'code') as HeroKind, label: s(r, 'label'), anchorId: s(r, 'anchor_id'), hp: n(r, 'hp'), damage: n(r, 'damage'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), abilityTicks: n(r, 'ability_ticks'), abilityCooldownTicks: n(r, 'ability_cooldown_ticks'), abilityRange: n(r, 'ability_range'), abilityDamage: n(r, 'ability_damage'), upgradeCosts: [n(r, 'upgrade_cost_2'), n(r, 'upgrade_cost_3')] })),
    buildings: rows('building_definition').map(r => ({ kind: s(r, 'code') as BuildingKind, label: s(r, 'label'), cost: n(r, 'cost'), hp: n(r, 'hp'), damage: n(r, 'damage'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), buildTicks: n(r, 'build_ticks'), upgradeCosts: [n(r, 'upgrade_cost_2'), n(r, 'upgrade_cost_3')] })),
    enemies: rows('enemy_definition').map(r => ({ kind: s(r, 'code'), label: s(r, 'label'), hp: n(r, 'hp'), damage: n(r, 'damage'), speed: n(r, 'speed'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), throneDamage: n(r, 'throne_damage'), reward: n(r, 'reward'), movable: r.movable === true })),
    waves: rows('wave_definition').sort((a, b) => n(a, 'number') - n(b, 'number')).map(r => ({ number: n(r, 'number'), reward: n(r, 'reward'), groups: rows('wave_group').filter(z => n(z, 'wave') === n(r, 'number')).map(z => ({ id: s(z, 'code'), lane: n(z, 'lane'), enemyKind: s(z, 'enemy_code'), count: n(z, 'count'), intervalTicks: n(z, 'interval_ticks'), delayTicks: n(z, 'delay_ticks') })) }))
  };
  validateContent(result); return result;
}
export function validateContent(c: GameContent): void {
  const positive = (v: number) => Number.isSafeInteger(v) && v > 0 && v <= 1_000_000;
  if (c.ticksPerSecond !== 30 || !positive(c.initialGold) || !positive(c.throneHp) || !positive(c.scrollCost) || !positive(c.teleportTicks) || !positive(c.respawnTicks) || !Number.isSafeInteger(c.sellPercent) || c.sellPercent < 0 || c.sellPercent > 100 || !Number.isFinite(c.map.scale) || c.map.scale <= 0 || c.map.scale > 1 || c.map.paths.length !== 3 || c.map.paths.some(p => p.length < 2) || c.waves.length !== 5 || c.heroes.length !== 2 || c.buildings.length !== 2) throw new Error('CONTENT_LIMITS');
  const inside = (p: Point) => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= c.map.bounds.minX && p.x <= c.map.bounds.maxX && p.y >= c.map.bounds.minY && p.y <= c.map.bounds.maxY;
  if (![c.map.bounds.minX, c.map.bounds.maxX, c.map.bounds.minY, c.map.bounds.maxY].every(v => Number.isSafeInteger(v) && Math.abs(v) <= 100000) || c.map.bounds.minX >= c.map.bounds.maxX || c.map.bounds.minY >= c.map.bounds.maxY || c.map.paths.some(path => path.at(-1)?.x !== c.map.throne.x || path.at(-1)?.y !== c.map.throne.y) || !inside(c.map.throne) || c.map.paths.some(path => path.some(p => !inside(p))) || c.map.places.some(p => !inside(p) || !['hero_anchor', 'building_pad'].includes(p.kind)) || new Set(c.map.places.map(p => p.id)).size !== c.map.places.length) throw new Error('CONTENT_MAP');
  for (const h of c.heroes) if (!['pudge', 'shaman'].includes(h.kind) || !c.map.places.some(p => p.id === h.anchorId && p.kind === 'hero_anchor') || ![h.hp, h.damage, h.range, h.attackTicks, h.abilityTicks, h.abilityCooldownTicks, h.abilityRange, h.abilityDamage, ...h.upgradeCosts].every(positive)) throw new Error('CONTENT_HERO');
  if (new Set(c.heroes.map(h => h.kind)).size !== 2 || new Set(c.heroes.map(h => h.anchorId)).size !== 2 || new Set(c.buildings.map(b => b.kind)).size !== 2) throw new Error('CONTENT_DUPLICATE');
  for (const b of c.buildings) if (!['ballista', 'magic_tower'].includes(b.kind) || ![b.cost, b.hp, b.damage, b.range, b.attackTicks, b.buildTicks, ...b.upgradeCosts].every(positive)) throw new Error('CONTENT_BUILDING');
  if (!c.enemies.length || new Set(c.enemies.map(e => e.kind)).size !== c.enemies.length || new Set(c.waves.flatMap(w => w.groups.map(g => g.id))).size !== c.waves.reduce((n, w) => n + w.groups.length, 0)) throw new Error('CONTENT_DUPLICATE');
  for (const e of c.enemies) if (!['melee', 'ranged', 'siege'].includes(e.kind) || typeof e.movable !== 'boolean' || ![e.hp, e.damage, e.speed, e.range, e.attackTicks, e.throneDamage, e.reward].every(positive)) throw new Error('CONTENT_ENEMY');
  for (let i = 0; i < c.waves.length; i++) { const w = c.waves[i]!; if (w.number !== i + 1 || !positive(w.reward) || !w.groups.length) throw new Error('CONTENT_WAVE'); for (const g of w.groups) if (!Number.isSafeInteger(g.lane) || g.lane < 0 || g.lane > 2 || !c.enemies.some(e => e.kind === g.enemyKind) || !positive(g.count) || g.count > 200 || !positive(g.intervalTicks) || !Number.isSafeInteger(g.delayTicks) || g.delayTicks < 0) throw new Error('CONTENT_GROUP'); }
}
