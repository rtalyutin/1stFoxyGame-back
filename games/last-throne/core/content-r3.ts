/** Immutable R3 balance. Published PostgreSQL EAV rows are the runtime source. */
export type HeroKind = 'pudge' | 'shaman' | 'undying' | 'rubick' | 'sniper';
export type BuildingKind = 'ballista' | 'magic_tower' | 'slow_totem';
export type PlaceKind = 'hero_anchor' | 'building_pad';
export interface Point { x: number; y: number }
export interface Place extends Point { id: string; kind: PlaceKind }
export interface HeroDefinition { kind: HeroKind; label: string; anchorId: string; hp: number; damage: number; range: number; attackTicks: number; abilityTicks: number; abilityCooldownTicks: number; abilityRange: number; abilityDamage: number; upgradeCosts: [number, number]; stealCooldownTicks: number; summonTTLTicks: number; summonIntervalTicks: number; summonCap: number; summonHp: number; summonSpeed: number; summonAttackTicks: number; summonRange: number }
export interface BuildingDefinition { kind: BuildingKind; label: string; cost: number; hp: number; damage: number; range: number; attackTicks: number; buildTicks: number; upgradeCosts: [number, number]; slowPercent: number; slowTicks: number; slowCapPercent: number }
export interface EnemyDefinition { kind: string; label: string; hp: number; damage: number; speed: number; range: number; attackTicks: number; throneDamage: number; reward: number; movable: boolean; commander: boolean; spellCooldownTicks: number; spellRotation: [string, string, string]; role: 'melee' | 'ranged' | 'healer' | 'siege' | 'saboteur' | 'armored' | 'commander'; armorPercent: number; healMagnitude: number; healRadius: number; healTicks: number; hidden: boolean; sidePath: boolean }
export type SpellBehavior = 'area_heal' | 'area_strike' | 'temporary_shield';
export const KNOWN_SPELL_BEHAVIORS: readonly SpellBehavior[] = ['area_heal', 'area_strike', 'temporary_shield'];
export interface SpellDefinition { behaviorId: SpellBehavior; label: string; magnitude: number; radius: number; durationTicks: number }
export type ItemBehavior = 'additional_target' | 'cooldown_reduction' | 'detection' | 'healing_aura';
export const KNOWN_ITEM_BEHAVIORS: readonly ItemBehavior[] = ['additional_target', 'cooldown_reduction', 'detection', 'healing_aura'];
export type ExpeditionKind = 'camp' | 'shop' | 'roshan';
export interface ItemDefinition { id: string; behaviorId: ItemBehavior; label: string; cost: number; magnitude: number; radius: number; intervalTicks: number; maxTargets: number; compatibleHeroes: HeroKind[] }
export interface ExpeditionDefinition { kind: ExpeditionKind; label: string; durationTicks: number; goldReward: number; itemOptions: string[]; position: Point }
export interface WaveGroup { id: string; lane: number; enemyKind: string; count: number; intervalTicks: number; delayTicks: number }
export interface WaveDefinition { number: number; reward: number; groups: WaveGroup[] }
export interface GameContent {
  contentVersion: string; metadataSchemaVersion: string; coreCompatibility: string[];
  ticksPerSecond: 30; initialGold: number; throneHp: number; scrollCost: number; teleportTicks: number; respawnTicks: number; sellPercent: number;
  map: { scale: number; bounds: { minX: number; maxX: number; minY: number; maxY: number }; throne: Point; places: Place[]; paths: Point[][]; sidePath: Point[] };
  heroes: HeroDefinition[]; buildings: BuildingDefinition[]; enemies: EnemyDefinition[]; waves: WaveDefinition[]; spells: SpellDefinition[]; items: ItemDefinition[]; expeditions: ExpeditionDefinition[];
}
export interface ContentRow { type: string; code: string; parameters: Record<string, string | number | boolean> }
export const CORE_VERSION = 'r3-core-1';
export const SNAPSHOT_VERSION = 4;
export const defaultR3Content: GameContent = {
  contentVersion: 'r3-content-1', metadataSchemaVersion: 'r3-meta-1', coreCompatibility: [CORE_VERSION], ticksPerSecond: 30,
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
    ], sidePath: [{ x: -1050, y: 760 }, { x: -300, y: 760 }, { x: 350, y: 720 }, { x: 780, y: 360 }, { x: 950, y: 0 }] },
  heroes: [
    { kind: 'pudge', label: 'Pudge', anchorId: 'anchor-m1', hp: 440, damage: 32, range: 140, attackTicks: 27, abilityTicks: 12, abilityCooldownTicks: 330, abilityRange: 700, abilityDamage: 100, upgradeCosts: [120, 200], stealCooldownTicks: 0, summonTTLTicks: 0, summonIntervalTicks: 0, summonCap: 0, summonHp: 0, summonSpeed: 0, summonAttackTicks: 0, summonRange: 0 },
    { kind: 'shaman', label: 'Shadow Shaman', anchorId: 'anchor-n2', hp: 230, damage: 23, range: 330, attackTicks: 33, abilityTicks: 18, abilityCooldownTicks: 510, abilityRange: 600, abilityDamage: 27, upgradeCosts: [140, 220], stealCooldownTicks: 0, summonTTLTicks: 330, summonIntervalTicks: 6, summonCap: 4, summonHp: 1, summonSpeed: 0, summonAttackTicks: 36, summonRange: 290 },
    { kind: 'undying', label: 'Undying', anchorId: 'anchor-s1', hp: 420, damage: 27, range: 150, attackTicks: 30, abilityTicks: 18, abilityCooldownTicks: 540, abilityRange: 600, abilityDamage: 22, upgradeCosts: [120, 200], stealCooldownTicks: 0, summonTTLTicks: 450, summonIntervalTicks: 45, summonCap: 6, summonHp: 65, summonSpeed: 7, summonAttackTicks: 27, summonRange: 100 },
    { kind: 'rubick', label: 'Rubick', anchorId: 'anchor-m2', hp: 200, damage: 21, range: 320, attackTicks: 42, abilityTicks: 15, abilityCooldownTicks: 360, abilityRange: 750, abilityDamage: 1, upgradeCosts: [140, 220], stealCooldownTicks: 210, summonTTLTicks: 0, summonIntervalTicks: 0, summonCap: 0, summonHp: 0, summonSpeed: 0, summonAttackTicks: 0, summonRange: 0 },
    { kind: 'sniper', label: 'Sniper', anchorId: 'anchor-s2', hp: 180, damage: 38, range: 620, attackTicks: 51, abilityTicks: 24, abilityCooldownTicks: 300, abilityRange: 1000, abilityDamage: 180, upgradeCosts: [140, 220], stealCooldownTicks: 0, summonTTLTicks: 0, summonIntervalTicks: 0, summonCap: 0, summonHp: 0, summonSpeed: 0, summonAttackTicks: 0, summonRange: 0 }
  ], buildings: [
    { kind: 'ballista', label: 'Баллиста', cost: 100, hp: 230, damage: 36, range: 390, attackTicks: 33, buildTicks: 90, upgradeCosts: [100, 160], slowPercent: 0, slowTicks: 0, slowCapPercent: 0 },
    { kind: 'magic_tower', label: 'Магическая башня', cost: 140, hp: 180, damage: 32, range: 360, attackTicks: 36, buildTicks: 120, upgradeCosts: [130, 210], slowPercent: 0, slowTicks: 0, slowCapPercent: 0 },
    { kind: 'slow_totem', label: 'Тотем замедления', cost: 110, hp: 220, damage: 0, range: 360, attackTicks: 45, buildTicks: 90, upgradeCosts: [100, 160], slowPercent: 35, slowTicks: 60, slowCapPercent: 60 }
  ], enemies: [
    { kind: 'melee', label: 'Крип', hp: 95, damage: 10, speed: 4, range: 110, attackTicks: 36, throneDamage: 14, reward: 12, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'melee', armorPercent: 0, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false },
    { kind: 'ranged', label: 'Стрелок', hp: 72, damage: 9, speed: 4, range: 260, attackTicks: 42, throneDamage: 12, reward: 14, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'ranged', armorPercent: 0, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false },
    { kind: 'healer', label: 'Лекарь', hp: 100, damage: 7, speed: 4, range: 180, attackTicks: 60, throneDamage: 12, reward: 18, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'healer', armorPercent: 0, healMagnitude: 28, healRadius: 280, healTicks: 90, hidden: false, sidePath: false },
    { kind: 'siege_machine', label: 'Осадная машина', hp: 340, damage: 24, speed: 3, range: 290, attackTicks: 75, throneDamage: 32, reward: 32, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'siege', armorPercent: 15, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false },
    { kind: 'saboteur', label: 'Диверсант', hp: 115, damage: 14, speed: 5, range: 100, attackTicks: 36, throneDamage: 20, reward: 24, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'saboteur', armorPercent: 0, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: true, sidePath: true },
    { kind: 'armored', label: 'Бронированный элитный', hp: 230, damage: 18, speed: 3, range: 110, attackTicks: 42, throneDamage: 25, reward: 28, movable: true, commander: false, spellCooldownTicks: 0, spellRotation: ['', '', ''], role: 'armored', armorPercent: 35, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false },
    { kind: 'siege', label: 'Осадный командир', hp: 1400, damage: 32, speed: 3, range: 300, attackTicks: 75, throneDamage: 65, reward: 130, movable: false, commander: true, spellCooldownTicks: 150, spellRotation: ['area_heal', 'area_strike', 'temporary_shield'], role: 'commander', armorPercent: 15, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false },
    { kind: 'bypass_commander', label: 'Командир обхода', hp: 1600, damage: 28, speed: 3, range: 180, attackTicks: 60, throneDamage: 75, reward: 150, movable: false, commander: true, spellCooldownTicks: 150, spellRotation: ['temporary_shield', 'area_strike', 'area_heal'], role: 'commander', armorPercent: 10, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: true },
    { kind: 'arcane_commander', label: 'Чародейский командир', hp: 1900, damage: 24, speed: 3, range: 330, attackTicks: 60, throneDamage: 85, reward: 180, movable: false, commander: true, spellCooldownTicks: 120, spellRotation: ['area_strike', 'temporary_shield', 'area_heal'], role: 'commander', armorPercent: 10, healMagnitude: 0, healRadius: 0, healTicks: 0, hidden: false, sidePath: false }
  ],
  spells: [
    { behaviorId: 'area_heal', label: 'Волна исцеления', magnitude: 60, radius: 300, durationTicks: 1 },
    { behaviorId: 'area_strike', label: 'Магический удар', magnitude: 90, radius: 300, durationTicks: 1 },
    { behaviorId: 'temporary_shield', label: 'Магический щит', magnitude: 110, radius: 300, durationTicks: 150 }
  ],
  items: [
    { id: 'split_charm', behaviorId: 'additional_target', label: 'Талисман двойного удара', cost: 110, magnitude: 1, radius: 0, intervalTicks: 0, maxTargets: 2, compatibleHeroes: ['shaman', 'rubick', 'sniper'] },
    { id: 'swift_charm', behaviorId: 'cooldown_reduction', label: 'Талисман скорости', cost: 120, magnitude: 25, radius: 0, intervalTicks: 0, maxTargets: 0, compatibleHeroes: ['pudge', 'shaman', 'undying', 'rubick', 'sniper'] },
    { id: 'sight_gem', behaviorId: 'detection', label: 'Камень истинного зрения', cost: 100, magnitude: 1, radius: 700, intervalTicks: 0, maxTargets: 0, compatibleHeroes: ['pudge', 'shaman', 'undying', 'rubick', 'sniper'] },
    { id: 'healing_lantern', behaviorId: 'healing_aura', label: 'Фонарь исцеления', cost: 140, magnitude: 8, radius: 280, intervalTicks: 90, maxTargets: 0, compatibleHeroes: ['pudge', 'shaman', 'undying', 'rubick', 'sniper'] }
  ],
  expeditions: [
    { kind: 'camp', label: 'Нейтральный лагерь', durationTicks: 300, goldReward: 160, itemOptions: [], position: { x: -750, y: 720 } },
    { kind: 'shop', label: 'Тайная лавка', durationTicks: 600, goldReward: 0, itemOptions: ['split_charm', 'swift_charm', 'sight_gem', 'healing_lantern'], position: { x: 20, y: -770 } },
    { kind: 'roshan', label: 'Рошан', durationTicks: 900, goldReward: 0, itemOptions: [], position: { x: 750, y: -670 } }
  ],
  waves: Array.from({ length: 15 }, (_, i) => ({ number: i + 1, reward: 55 + i * 15, groups: [
    ...[0, 1, 2].map(lane => ({ id: `w${i + 1}-l${lane}`, lane, enemyKind: i > 1 && lane === i % 3 ? 'ranged' : 'melee', count: 8 + i * 2, intervalTicks: 90, delayTicks: lane * 15 })),
    ...(i >= 2 ? [{ id: `w${i + 1}-role`, lane: i % 3, enemyKind: ['healer', 'siege_machine', 'armored'][i % 3]!, count: 2 + Math.floor(i / 4), intervalTicks: 150, delayTicks: 100 }] : []),
    ...(i >= 3 ? [{ id: `w${i + 1}-saboteur`, lane: 2, enemyKind: 'saboteur', count: 1 + Math.floor(i / 5), intervalTicks: 180, delayTicks: 180 }] : []),
    ...([4, 9, 14].includes(i) ? [{ id: `w${i + 1}-commander`, lane: 1, enemyKind: i === 4 ? 'siege' : i === 9 ? 'bypass_commander' : 'arcane_commander', count: 1, intervalTicks: 60, delayTicks: 210 }] : [])
  ] }))
};

/** All fields are scalar typed EAV parameters; no JSON blob is published as truth. */
export function contentRows(content: GameContent = defaultR3Content): ContentRow[] {
  const rows: ContentRow[] = [{ type: 'game_config', code: 'r3', parameters: {
    code: 'r3', ticks_per_second: content.ticksPerSecond, initial_gold: content.initialGold, throne_hp: content.throneHp, scroll_cost: content.scrollCost,
    teleport_ticks: content.teleportTicks, respawn_ticks: content.respawnTicks, sell_percent: content.sellPercent, map_scale: content.map.scale,
    min_x: content.map.bounds.minX, max_x: content.map.bounds.maxX, min_y: content.map.bounds.minY, max_y: content.map.bounds.maxY,
    throne_x: content.map.throne.x, throne_y: content.map.throne.y
  } }];
  for (const p of content.map.places) rows.push({ type: 'map_place', code: p.id, parameters: { code: p.id, kind: p.kind, x: p.x, y: p.y } });
  content.map.paths.forEach((path, lane) => path.forEach((p, ordinal) => rows.push({ type: 'path_point', code: `lane-${lane}-${ordinal}`, parameters: { code: `lane-${lane}-${ordinal}`, lane, ordinal, x: p.x, y: p.y } })));
  content.map.sidePath.forEach((p, ordinal) => rows.push({ type: 'path_point', code: `side-${ordinal}`, parameters: { code: `side-${ordinal}`, lane: 3, ordinal, x: p.x, y: p.y } }));
  for (const h of content.heroes) rows.push({ type: 'hero_definition', code: h.kind, parameters: { code: h.kind, label: h.label, anchor_id: h.anchorId, hp: h.hp, damage: h.damage, range: h.range, attack_ticks: h.attackTicks, ability_ticks: h.abilityTicks, ability_cooldown_ticks: h.abilityCooldownTicks, ability_range: h.abilityRange, ability_damage: h.abilityDamage, upgrade_cost_2: h.upgradeCosts[0], upgrade_cost_3: h.upgradeCosts[1], steal_cooldown_ticks: h.stealCooldownTicks, summon_ttl_ticks: h.summonTTLTicks, summon_interval_ticks: h.summonIntervalTicks, summon_cap: h.summonCap, summon_hp: h.summonHp, summon_speed: h.summonSpeed, summon_attack_ticks: h.summonAttackTicks, summon_range: h.summonRange } });
  for (const b of content.buildings) rows.push({ type: 'building_definition', code: b.kind, parameters: { code: b.kind, label: b.label, cost: b.cost, hp: b.hp, damage: b.damage, range: b.range, attack_ticks: b.attackTicks, build_ticks: b.buildTicks, upgrade_cost_2: b.upgradeCosts[0], upgrade_cost_3: b.upgradeCosts[1], slow_percent: b.slowPercent, slow_ticks: b.slowTicks, slow_cap_percent: b.slowCapPercent } });
  for (const e of content.enemies) rows.push({ type: 'enemy_definition', code: e.kind, parameters: { code: e.kind, label: e.label, hp: e.hp, damage: e.damage, speed: e.speed, range: e.range, attack_ticks: e.attackTicks, throne_damage: e.throneDamage, reward: e.reward, movable: e.movable, commander: e.commander, spell_cooldown_ticks: e.spellCooldownTicks, spell_1: e.spellRotation[0], spell_2: e.spellRotation[1], spell_3: e.spellRotation[2], role: e.role, armor_percent: e.armorPercent, heal_magnitude: e.healMagnitude, heal_radius: e.healRadius, heal_ticks: e.healTicks, hidden: e.hidden, side_path: e.sidePath } });
  for (const spell of content.spells) rows.push({ type: 'spell_definition', code: spell.behaviorId, parameters: { code: spell.behaviorId, behavior_id: spell.behaviorId, label: spell.label, magnitude: spell.magnitude, radius: spell.radius, duration_ticks: spell.durationTicks } });
  for (const item of content.items) rows.push({ type: 'item_definition', code: item.id, parameters: { code: item.id, behavior_id: item.behaviorId, label: item.label, cost: item.cost, magnitude: item.magnitude, radius: item.radius, interval_ticks: item.intervalTicks, max_targets: item.maxTargets, ...Object.fromEntries(content.heroes.map(h => [`compatible_${h.kind}`, item.compatibleHeroes.includes(h.kind)])) } });
  for (const expedition of content.expeditions) rows.push({ type: 'expedition_definition', code: expedition.kind, parameters: { code: expedition.kind, label: expedition.label, duration_ticks: expedition.durationTicks, gold_reward: expedition.goldReward, x: expedition.position.x, y: expedition.position.y, item_1: expedition.itemOptions[0] ?? '', item_2: expedition.itemOptions[1] ?? '', item_3: expedition.itemOptions[2] ?? '', item_4: expedition.itemOptions[3] ?? '' } });
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
  const sidePath = rows('path_point').filter(r => n(r, 'lane') === 3).sort((a, b) => n(a, 'ordinal') - n(b, 'ordinal')).map(r => ({ x: n(r, 'x'), y: n(r, 'y') }));
  const result: GameContent = {
    contentVersion: p.contentVersion, metadataSchemaVersion: p.metadataSchemaVersion, coreCompatibility: p.coreCompatibility as string[], ticksPerSecond: n(g, 'ticks_per_second') as 30,
    initialGold: n(g, 'initial_gold'), throneHp: n(g, 'throne_hp'), scrollCost: n(g, 'scroll_cost'), teleportTicks: n(g, 'teleport_ticks'), respawnTicks: n(g, 'respawn_ticks'), sellPercent: n(g, 'sell_percent'),
    map: { scale: n(g, 'map_scale', false), bounds: { minX: n(g, 'min_x'), maxX: n(g, 'max_x'), minY: n(g, 'min_y'), maxY: n(g, 'max_y') }, throne: { x: n(g, 'throne_x'), y: n(g, 'throne_y') }, paths, sidePath,
      places: rows('map_place').map(r => ({ id: s(r, 'code'), kind: s(r, 'kind') as PlaceKind, x: n(r, 'x'), y: n(r, 'y') })) },
    heroes: rows('hero_definition').map(r => ({ kind: s(r, 'code') as HeroKind, label: s(r, 'label'), anchorId: s(r, 'anchor_id'), hp: n(r, 'hp'), damage: n(r, 'damage'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), abilityTicks: n(r, 'ability_ticks'), abilityCooldownTicks: n(r, 'ability_cooldown_ticks'), abilityRange: n(r, 'ability_range'), abilityDamage: n(r, 'ability_damage'), upgradeCosts: [n(r, 'upgrade_cost_2'), n(r, 'upgrade_cost_3')], stealCooldownTicks: n(r, 'steal_cooldown_ticks'), summonTTLTicks: n(r, 'summon_ttl_ticks'), summonIntervalTicks: n(r, 'summon_interval_ticks'), summonCap: n(r, 'summon_cap'), summonHp: n(r, 'summon_hp'), summonSpeed: n(r, 'summon_speed'), summonAttackTicks: n(r, 'summon_attack_ticks'), summonRange: n(r, 'summon_range') })),
    buildings: rows('building_definition').map(r => ({ kind: s(r, 'code') as BuildingKind, label: s(r, 'label'), cost: n(r, 'cost'), hp: n(r, 'hp'), damage: n(r, 'damage'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), buildTicks: n(r, 'build_ticks'), upgradeCosts: [n(r, 'upgrade_cost_2'), n(r, 'upgrade_cost_3')], slowPercent: n(r, 'slow_percent'), slowTicks: n(r, 'slow_ticks'), slowCapPercent: n(r, 'slow_cap_percent') })),
    enemies: rows('enemy_definition').map(r => ({ kind: s(r, 'code'), label: s(r, 'label'), hp: n(r, 'hp'), damage: n(r, 'damage'), speed: n(r, 'speed'), range: n(r, 'range'), attackTicks: n(r, 'attack_ticks'), throneDamage: n(r, 'throne_damage'), reward: n(r, 'reward'), movable: r.movable === true, commander: r.commander === true, spellCooldownTicks: n(r, 'spell_cooldown_ticks'), spellRotation: [s(r, 'spell_1'), s(r, 'spell_2'), s(r, 'spell_3')], role: s(r, 'role') as EnemyDefinition['role'], armorPercent: n(r, 'armor_percent'), healMagnitude: n(r, 'heal_magnitude'), healRadius: n(r, 'heal_radius'), healTicks: n(r, 'heal_ticks'), hidden: r.hidden === true, sidePath: r.side_path === true })),
    spells: rows('spell_definition').map(r => ({ behaviorId: s(r, 'behavior_id') as SpellBehavior, label: s(r, 'label'), magnitude: n(r, 'magnitude'), radius: n(r, 'radius'), durationTicks: n(r, 'duration_ticks') })),
    items: rows('item_definition').map(r => ({ id: s(r, 'code'), behaviorId: s(r, 'behavior_id') as ItemBehavior, label: s(r, 'label'), cost: n(r, 'cost'), magnitude: n(r, 'magnitude'), radius: n(r, 'radius'), intervalTicks: n(r, 'interval_ticks'), maxTargets: n(r, 'max_targets'), compatibleHeroes: (['pudge', 'shaman', 'undying', 'rubick', 'sniper'] as HeroKind[]).filter(kind => r[`compatible_${kind}`] === true) })),
    expeditions: rows('expedition_definition').map(r => ({ kind: s(r, 'code') as ExpeditionKind, label: s(r, 'label'), durationTicks: n(r, 'duration_ticks'), goldReward: n(r, 'gold_reward'), itemOptions: ['item_1', 'item_2', 'item_3', 'item_4'].map(k => s(r, k)).filter(Boolean), position: { x: n(r, 'x'), y: n(r, 'y') } })),
    waves: rows('wave_definition').sort((a, b) => n(a, 'number') - n(b, 'number')).map(r => ({ number: n(r, 'number'), reward: n(r, 'reward'), groups: rows('wave_group').filter(z => n(z, 'wave') === n(r, 'number')).map(z => ({ id: s(z, 'code'), lane: n(z, 'lane'), enemyKind: s(z, 'enemy_code'), count: n(z, 'count'), intervalTicks: n(z, 'interval_ticks'), delayTicks: n(z, 'delay_ticks') })) }))
  };
  validateContent(result); return result;
}
export function validateContent(c: GameContent): void {
  const positive = (v: number) => Number.isSafeInteger(v) && v > 0 && v <= 1_000_000;
  if (c.ticksPerSecond !== 30 || !positive(c.initialGold) || !positive(c.throneHp) || !positive(c.scrollCost) || !positive(c.teleportTicks) || !positive(c.respawnTicks) || !Number.isSafeInteger(c.sellPercent) || c.sellPercent < 0 || c.sellPercent > 100 || !Number.isFinite(c.map.scale) || c.map.scale <= 0 || c.map.scale > 1 || c.map.paths.length !== 3 || c.map.paths.some(p => p.length < 2) || c.waves.length !== 15 || c.heroes.length !== 5 || c.buildings.length !== 3) throw new Error('CONTENT_LIMITS');
  const inside = (p: Point) => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= c.map.bounds.minX && p.x <= c.map.bounds.maxX && p.y >= c.map.bounds.minY && p.y <= c.map.bounds.maxY;
  if (![c.map.bounds.minX, c.map.bounds.maxX, c.map.bounds.minY, c.map.bounds.maxY].every(v => Number.isSafeInteger(v) && Math.abs(v) <= 100000) || c.map.bounds.minX >= c.map.bounds.maxX || c.map.bounds.minY >= c.map.bounds.maxY || c.map.paths.some(path => path.at(-1)?.x !== c.map.throne.x || path.at(-1)?.y !== c.map.throne.y) || !inside(c.map.throne) || c.map.paths.some(path => path.some(p => !inside(p))) || c.map.places.some(p => !inside(p) || !['hero_anchor', 'building_pad'].includes(p.kind)) || new Set(c.map.places.map(p => p.id)).size !== c.map.places.length) throw new Error('CONTENT_MAP');
  for (const h of c.heroes) if (!['pudge', 'shaman', 'undying', 'rubick', 'sniper'].includes(h.kind) || !c.map.places.some(p => p.id === h.anchorId && p.kind === 'hero_anchor') || ![h.hp, h.damage, h.range, h.attackTicks, h.abilityTicks, h.abilityCooldownTicks, h.abilityRange, h.abilityDamage, ...h.upgradeCosts].every(positive)) throw new Error('CONTENT_HERO');
  if (new Set(c.heroes.map(h => h.kind)).size !== 5 || new Set(c.heroes.map(h => h.anchorId)).size !== 5 || new Set(c.buildings.map(b => b.kind)).size !== 3) throw new Error('CONTENT_DUPLICATE');
  for (const b of c.buildings) if (!['ballista', 'magic_tower', 'slow_totem'].includes(b.kind) || !Number.isSafeInteger(b.damage) || b.damage < 0 || ![b.cost, b.hp, b.range, b.attackTicks, b.buildTicks, ...b.upgradeCosts].every(positive)) throw new Error('CONTENT_BUILDING');
  if (!c.enemies.length || new Set(c.enemies.map(e => e.kind)).size !== c.enemies.length || new Set(c.waves.flatMap(w => w.groups.map(g => g.id))).size !== c.waves.reduce((n, w) => n + w.groups.length, 0)) throw new Error('CONTENT_DUPLICATE');
  for (const e of c.enemies) if (!['melee', 'ranged', 'healer', 'siege_machine', 'saboteur', 'armored', 'siege', 'bypass_commander', 'arcane_commander'].includes(e.kind) || typeof e.movable !== 'boolean' || ![e.hp, e.damage, e.speed, e.range, e.attackTicks, e.throneDamage, e.reward].every(positive)) throw new Error('CONTENT_ENEMY');
  if (c.spells.length !== 3 || new Set(c.spells.map(spell => spell.behaviorId)).size !== 3 || c.spells.some(spell => !KNOWN_SPELL_BEHAVIORS.includes(spell.behaviorId) || ![spell.magnitude, spell.radius, spell.durationTicks].every(positive))) throw new Error('CONTENT_SPELL');
  for (const h of c.heroes) {
    if (![h.stealCooldownTicks, h.summonTTLTicks, h.summonIntervalTicks, h.summonCap, h.summonHp, h.summonSpeed, h.summonAttackTicks, h.summonRange].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000)) throw new Error('CONTENT_HERO_SUMMON');
    if (h.kind === 'rubick' ? !positive(h.stealCooldownTicks) : h.stealCooldownTicks !== 0) throw new Error('CONTENT_STEAL');
    if (['shaman', 'undying'].includes(h.kind) && (![h.summonTTLTicks, h.summonIntervalTicks, h.summonCap, h.summonHp, h.summonAttackTicks, h.summonRange].every(positive) || h.summonCap > 12 || (h.kind === 'undying' && !positive(h.summonSpeed)))) throw new Error('CONTENT_SUMMON');
  }
  for (const b of c.buildings) if (b.kind === 'slow_totem' ? !positive(b.slowTicks) || !Number.isSafeInteger(b.slowPercent) || !Number.isSafeInteger(b.slowCapPercent) || b.slowPercent < 1 || b.slowPercent > b.slowCapPercent || b.slowCapPercent > 80 : b.slowPercent !== 0 || b.slowTicks !== 0 || b.slowCapPercent !== 0) throw new Error('CONTENT_SLOW');
  for (const e of c.enemies) if (typeof e.commander !== 'boolean' || e.spellRotation.length !== 3 || (e.commander ? e.movable || !positive(e.spellCooldownTicks) || e.spellRotation.some(id => !KNOWN_SPELL_BEHAVIORS.includes(id as SpellBehavior)) : e.spellCooldownTicks !== 0 || e.spellRotation.some(id => id !== ''))) throw new Error('CONTENT_COMMANDER');
  if (c.map.sidePath.length < 2 || c.map.sidePath.some(p => !inside(p)) || c.map.sidePath.at(-1)?.x !== c.map.throne.x || c.map.sidePath.at(-1)?.y !== c.map.throne.y) throw new Error('CONTENT_SIDE_PATH');
  if (c.items.length !== 4 || new Set(c.items.map(item => item.id)).size !== c.items.length || new Set(c.items.map(item => item.behaviorId)).size !== 4) throw new Error('CONTENT_ITEMS');
  for (const item of c.items) {
    if (!KNOWN_ITEM_BEHAVIORS.includes(item.behaviorId) || !/^[a-z][a-z0-9_]{0,63}$/.test(item.id) || !positive(item.cost) || !positive(item.magnitude) || !item.compatibleHeroes.length || new Set(item.compatibleHeroes).size !== item.compatibleHeroes.length || item.compatibleHeroes.some(kind => !c.heroes.some(h => h.kind === kind)) || ![item.radius, item.intervalTicks, item.maxTargets].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000)) throw new Error('CONTENT_ITEM');
    if (item.behaviorId === 'additional_target' && (item.maxTargets < 2 || item.maxTargets > 3 || item.magnitude !== item.maxTargets - 1) || item.behaviorId === 'cooldown_reduction' && item.magnitude > 40 || item.behaviorId === 'detection' && !positive(item.radius) || item.behaviorId === 'healing_aura' && (!positive(item.radius) || !positive(item.intervalTicks))) throw new Error('CONTENT_ITEM_LIMIT');
  }
  if (c.expeditions.length !== 3 || new Set(c.expeditions.map(e => e.kind)).size !== 3) throw new Error('CONTENT_EXPEDITIONS');
  for (const e of c.expeditions) if (!['camp', 'shop', 'roshan'].includes(e.kind) || !positive(e.durationTicks) || !inside(e.position) || !Number.isSafeInteger(e.goldReward) || e.goldReward < 0 || e.itemOptions.length > 4 || new Set(e.itemOptions).size !== e.itemOptions.length || e.itemOptions.some(id => !c.items.some(item => item.id === id)) || (e.kind === 'shop' ? !e.itemOptions.length || e.goldReward !== 0 : e.itemOptions.length > 0) || (e.kind === 'camp' ? !positive(e.goldReward) : e.goldReward !== 0)) throw new Error('CONTENT_EXPEDITION');
  for (const e of c.enemies) if (!['melee', 'ranged', 'healer', 'siege', 'saboteur', 'armored', 'commander'].includes(e.role) || !Number.isSafeInteger(e.armorPercent) || e.armorPercent < 0 || e.armorPercent > 70 || typeof e.hidden !== 'boolean' || typeof e.sidePath !== 'boolean' || (e.role === 'healer' ? ![e.healMagnitude, e.healRadius, e.healTicks].every(positive) : e.healMagnitude !== 0 || e.healRadius !== 0 || e.healTicks !== 0)) throw new Error('CONTENT_ENEMY_ROLE');
  for (let i = 0; i < c.waves.length; i++) { const w = c.waves[i]!; if (w.number !== i + 1 || !positive(w.reward) || !w.groups.length) throw new Error('CONTENT_WAVE'); for (const g of w.groups) if (!Number.isSafeInteger(g.lane) || g.lane < 0 || g.lane > 2 || !c.enemies.some(e => e.kind === g.enemyKind) || !positive(g.count) || g.count > 200 || !positive(g.intervalTicks) || !Number.isSafeInteger(g.delayTicks) || g.delayTicks < 0) throw new Error('CONTENT_GROUP'); }
}
