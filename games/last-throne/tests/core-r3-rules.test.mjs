import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitCommand, advanceTicks, createSnapshot, restoreSnapshot, validateSnapshot, drainEvents, getCommandResult } from '../core/game-core-r3.ts';
import { defaultR3Content, contentRows, parseContentProjection } from '../core/content-r3.ts';
import { createGame as gameR2, createSnapshot as snapshotR2, validateSnapshot as validateR2 } from '../core/game-core-r2.ts';
import { defaultR2Content } from '../core/content-r2.ts';
const fresh = (content = defaultR3Content) => createGame(content, 555);
let seq = 0;
const send = (g, type, payload = {}, actorId) => { const c = { commandId: `r3-test-${seq}`, tick: g.phase === 'wave' ? g.simTick + 1 : g.simTick, sequence: seq++, type, payload, ...(actorId ? { actorId } : {}) }; return { command: c, result: submitCommand(g, c) }; };
const h = (g, id) => g.heroes.find(h => h.id === id);
const enemy = (patch = {}) => ({ id: 'fixture-enemy', kind: 'melee', lane: 1, x: -900, y: -700, hp: 10000, maxHp: 10000, pathIndex: 1, attackCooldown: 9999, lastSpell: null, stealable: false, spellCooldown: 9999, spellIndex: 0, healCooldown: 0, hidden: false, visible: true, ...patch });
const isolate = g => { send(g, 'start_wave'); g.spawnGroups.forEach(s => s.spawned = s.count); g.enemies = [enemy()]; };
const close = g => { g.enemies.forEach(e => e.hp = 0); advanceTicks(g, 1); assert.equal(g.phase, 'preparation'); };
test('scalar EAV roundtrip carries15waves, six ordinary roles, side path, item handlers and excursion catalog; unknown behavior/compatibility rejected', () => {
  const projection = { contentVersion: 'r3-content-1', metadataSchemaVersion: 'r3-meta-1', coreCompatibility: ['r3-core-1'], entities: contentRows().map(row => ({ type: row.type, parameters: row.parameters })) };
  assert.deepEqual(parseContentProjection(projection), defaultR3Content); assert.equal(defaultR3Content.enemies.filter(e => !e.commander).length, 6); assert.equal(defaultR3Content.map.sidePath.length, 5);
  for (const change of [p => p.entities.find(e => e.type === 'item_definition').parameters.behavior_id = 'arbitrary_code', p => p.entities.find(e => e.type === 'expedition_definition').parameters.item_1 = 'missing', p => p.entities.find(e => e.type === 'enemy_definition').parameters.armor_percent = 100]) { const p = structuredClone(projection); change(p); assert.throws(() => parseContentProjection(p), /CONTENT/); }
});
test('one expedition reserves original anchor and makes hero absent; prep/pause freeze timer, cast/teleport/upgrade/equip reject; automatic camp award once', () => {
  const g = fresh(), p = h(g, 'pudge'); const gold = g.gold; const r = send(g, 'send_expedition', { kind: 'camp' }, p.id); assert.equal(r.result.status, 'accepted'); assert.equal(p.expedition.remainingTicks, 300);
  assert.equal(send(g, 'send_expedition', { kind: 'shop' }, 'shaman').result.code, 'EXPEDITION_ACTIVE'); assert.equal(send(g, 'teleport', { anchorId: 'anchor-n1' }, 'pudge').result.code, 'ACTOR_ABSENT'); assert.equal(send(g, 'equip_item', { itemId: 'sight_gem', slot: 0 }, 'pudge').result.code, 'ACTOR_ABSENT'); assert.equal(send(g, 'upgrade', {}, 'pudge').result.code, 'ACTOR_ABSENT');
  advanceTicks(g, 10000); assert.equal(p.expedition.remainingTicks, 300); const saved = createSnapshot(g); assert.equal(validateSnapshot(saved, g.content).valid, true); assert.deepEqual(createSnapshot(restoreSnapshot(g.content, saved, { newEpoch: false })), saved);
  isolate(g); advanceTicks(g, 100); send(g, 'pause'); advanceTicks(g, 1000); assert.equal(p.expedition.remainingTicks, 200); send(g, 'resume'); const attempts = send(g, 'cast', { targetId: 'fixture-enemy' }, 'pudge'); advanceTicks(g, 1); assert.equal(getCommandResult(g, attempts.command.commandId).code, 'ACTOR_ABSENT'); advanceTicks(g, 199); assert.equal(p.expedition, null); assert.equal(g.gold, gold + 160);
  advanceTicks(g, 100); assert.equal(g.gold, gold + 160); assert.equal(drainEvents(g).filter(e => e.type === 'expedition_finished').length, 1);
});
test('shop returns bound retained choice with full slots, save4 retains it, blocks next wave and consumes only explicit valid replacement or discard', () => {
  const g = fresh(); send(g, 'equip_item', { itemId: 'swift_charm', slot: 0 }, 'sniper'); send(g, 'equip_item', { itemId: 'split_charm', slot: 1 }, 'sniper'); send(g, 'send_expedition', { kind: 'shop' }, 'sniper'); isolate(g); advanceTicks(g, 601); assert.equal(g.pendingRewards.length, 1); assert.deepEqual(h(g, 'sniper').items, ['swift_charm', 'split_charm']); close(g);
  const s = createSnapshot(g); assert.equal(validateSnapshot(s, g.content).valid, true); const loaded = restoreSnapshot(g.content, s); assert.equal(loaded.pendingRewards.length, 1); const reward = loaded.pendingRewards[0]; assert.equal(send(loaded, 'start_wave').result.code, 'REWARD_PENDING');
  const before = loaded.gold; assert.equal(send(loaded, 'choose_reward', { rewardId: reward.id, itemId: 'swift_charm', slot: 1 }).result.code, 'ITEM_DUPLICATE'); assert.equal(loaded.pendingRewards.length, 1); assert.equal(loaded.gold, before);
  assert.equal(send(loaded, 'choose_reward', { rewardId: reward.id, itemId: 'healing_lantern', slot: 1 }).result.status, 'accepted'); assert.deepEqual(h(loaded, 'sniper').items, ['swift_charm', 'healing_lantern']); assert.equal(loaded.pendingRewards.length, 0); assert.equal(loaded.gold, before);
  const other = restoreSnapshot(g.content, s); assert.equal(send(other, 'discard_reward', { rewardId: other.pendingRewards[0].id }).result.status, 'accepted'); assert.equal(other.pendingRewards.length, 0); assert.deepEqual(h(other, 'sniper').items, ['swift_charm', 'split_charm']); assert.equal(send(other, 'start_wave').result.status, 'accepted');
});
test('item unknown/incompatible/duplicate/bad slot/insufficient gold rejects before spend; replacement and exact-ID repeat spend once', () => {
  const g = fresh(); const base = g.gold;
  for (const [payload, hero, code] of [[{ itemId: 'unknown', slot: 0 }, 'sniper', 'UNKNOWN_ITEM'], [{ itemId: 'split_charm', slot: 0 }, 'pudge', 'ITEM_INCOMPATIBLE'], [{ itemId: 'sight_gem', slot: 3 }, 'sniper', 'INVALID_SLOT']]) { assert.equal(send(g, 'equip_item', payload, hero).result.code, code); assert.equal(g.gold, base); }
  const purchase = send(g, 'equip_item', { itemId: 'sight_gem', slot: 0 }, 'sniper'); const after = g.gold; assert.deepEqual(submitCommand(g, purchase.command), purchase.result); assert.equal(g.gold, after); assert.equal(send(g, 'equip_item', { itemId: 'sight_gem', slot: 1 }, 'sniper').result.code, 'ITEM_DUPLICATE'); assert.equal(g.gold, after);
  assert.equal(send(g, 'equip_item', { itemId: 'swift_charm', slot: 0 }, 'sniper').result.status, 'accepted'); assert.equal(h(g, 'sniper').items[0], 'swift_charm'); assert.equal(g.gold, after - 120); g.gold = 1; assert.equal(send(g, 'equip_item', { itemId: 'healing_lantern', slot: 1 }, 'sniper').result.code, 'INSUFFICIENT_GOLD'); assert.equal(g.gold, 1);
});
test('additional-target item fires at distinct enemies once, cooldown item reduces attack and manual cooldowns with bounded minimum', () => {
  const g = fresh(), sniper = h(g, 'sniper'); send(g, 'equip_item', { itemId: 'split_charm', slot: 0 }, 'sniper'); send(g, 'equip_item', { itemId: 'swift_charm', slot: 1 }, 'sniper'); isolate(g); g.enemies = [enemy({ id: 'a', x: sniper.x + 100, y: sniper.y }), enemy({ id: 'b', x: sniper.x + 150, y: sniper.y })]; advanceTicks(g, 1);
  const shots = drainEvents(g).filter(e => e.type === 'projectile_fired' && e.sourceId === 'sniper'); assert.equal(shots.length, 2); assert.equal(new Set(shots.map(s => s.targetId)).size, 2); assert.equal(sniper.attackCooldown, Math.floor(51 * 0.75));
  send(g, 'cast', { targetId: 'a' }, 'sniper'); advanceTicks(g, 1); assert.equal(sniper.abilityCooldown, Math.floor(300 * 0.75) - 1); assert.ok(sniper.abilityCooldown > 0);
});
test('hidden saboteur follows side path and cannot be targeted/autoshot until living present gem detector reveals it; detector absence hides it again', () => {
  const g = fresh(), sniper = h(g, 'sniper'); isolate(g); g.enemies = [enemy({ kind: 'saboteur', hidden: true, visible: false, x: sniper.x + 200, y: sniper.y, pathIndex: 2 })];
  const c = send(g, 'cast', { targetId: 'fixture-enemy' }, 'sniper'); advanceTicks(g, 1); assert.equal(getCommandResult(g, c.command.commandId).code, 'TARGET_HIDDEN'); assert.equal(sniper.abilityCooldown, 0); assert.equal(g.enemies[0].visible, false); assert.ok(!drainEvents(g).some(e => e.type === 'projectile_fired'));
  send(g, 'equip_item', { itemId: 'sight_gem', slot: 0 }, 'sniper'); advanceTicks(g, 1); assert.equal(g.enemies[0].visible, true); assert.ok(drainEvents(g).some(e => e.effectId === 'detection_reveal')); send(g, 'cast', { targetId: 'fixture-enemy' }, 'sniper'); advanceTicks(g, 1); assert.ok(sniper.abilityCooldown > 0);
  // Separate prep departure proves absence removes true sight, with no hidden target sent through UI.
  close(g); send(g, 'send_expedition', { kind: 'camp' }, 'sniper'); isolate(g); g.enemies = [enemy({ kind: 'saboteur', hidden: true, visible: false, x: sniper.x + 200, y: sniper.y, pathIndex: 2 })]; advanceTicks(g, 1); assert.equal(g.enemies[0].visible, false);
});
test('healing aura and enemy healer cap living ally HP; armored enemy actually absorbs configured fraction', () => {
  const g = fresh(), r = h(g, 'rubick'); send(g, 'equip_item', { itemId: 'healing_lantern', slot: 0 }, 'rubick'); isolate(g); r.hp = 100; g.enemies = [enemy({ id: 'healer', kind: 'healer', x: -900, y: -700 }), enemy({ id: 'wounded', x: -800, y: -700, hp: 10, maxHp: 100 })]; advanceTicks(g, 90); assert.equal(r.hp, 108); assert.ok(g.enemies.find(e => e.id === 'wounded').hp > 10); assert.ok(g.enemies.find(e => e.id === 'wounded').hp <= 100); assert.ok(drainEvents(g).some(e => e.effectId === 'healing_aura'));
  const a = fresh(); isolate(a); a.enemies = [enemy({ kind: 'armored', hp: 100, maxHp: 100 })]; a.projectiles.push({ id: 'armor', sourceId: 'external', targetId: 'fixture-enemy', source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, damage: 100, remainingTicks: 1, effectId: 'ballista_shot' }); advanceTicks(a, 1); assert.equal(a.enemies[0].hp, 35);
});
test('Roshan grants separate hero-bound token, next death revives same-stage full HP once; second death uses normal900tick return', () => {
  const g = fresh(); send(g, 'send_expedition', { kind: 'roshan' }, 'pudge'); isolate(g); advanceTicks(g, 900); const p = h(g, 'pudge'); assert.equal(p.expedition, null); assert.equal(p.aegisToken, true); assert.equal(h(g, 'sniper').aegisToken, false);
  p.hp = 1; const kill = () => g.projectiles.push({ id: `death-${g.simTick}`, sourceId: 'external', targetId: p.id, source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, damage: 1000, remainingTicks: 1, effectId: 'enemy_attack' }); kill(); advanceTicks(g, 1); assert.equal(p.hp, p.maxHp); assert.equal(p.aegisToken, false); assert.equal(p.respawnTicks, 0); assert.equal(drainEvents(g).filter(e => e.effectId === 'aegis_revive').length, 1);
  kill(); advanceTicks(g, 1); assert.equal(p.hp, 0); assert.equal(p.respawnTicks, 900); assert.equal(drainEvents(g).filter(e => e.effectId === 'aegis_revive').length, 0);
});
test('save4 validates expedition/items/token/pending IDs and pins; R1/R2 remain separate and invalid partial state rejects', () => {
  const g = fresh(); send(g, 'equip_item', { itemId: 'sight_gem', slot: 0 }, 'sniper'); send(g, 'send_expedition', { kind: 'roshan' }, 'pudge'); const s = createSnapshot(g); assert.equal(s.schemaVersion, 4); assert.equal(validateSnapshot(s, g.content).valid, true); assert.deepEqual(createSnapshot(restoreSnapshot(g.content, s, { newEpoch: false })), s);
  for (const change of [s => s.heroes[0].items = ['missing', null], s => s.heroes.find(h => h.id === 'sniper').items = ['sight_gem', 'sight_gem'], s => s.heroes.find(h => h.id === 'pudge').expedition.remainingTicks = 0, s => s.heroes.find(h => h.id === 'pudge').aegisToken = true, s => s.heroes.find(h => h.id === 'pudge').expedition.totalTicks = 123, s => s.heroes.find(h => h.id === 'shaman').expedition = structuredClone(s.heroes.find(h => h.id === 'pudge').expedition), s => s.pendingRewards = [{ id: 'p', heroId: 'unknown', kind: 'shop', options: [] }]]) { const invalid = structuredClone(s); change(invalid); assert.equal(validateSnapshot(invalid, g.content).valid, false); assert.throws(() => restoreSnapshot(g.content, invalid), /INVALID_SNAPSHOT/); }
  const old = snapshotR2(gameR2(defaultR2Content, 3)); assert.equal(old.schemaVersion, 3); assert.equal(defaultR2Content.waves.length, 10); assert.equal(validateSnapshot(old, g.content).valid, false); assert.equal(validateR2(s, defaultR2Content).valid, false);
});
