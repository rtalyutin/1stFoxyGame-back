import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitCommand, advanceTicks, createSnapshot, restoreSnapshot, validateSnapshot, getFinishResult, drainEvents, getCommandResult } from '../core/game-core-r2.ts';
import { defaultR2Content, contentRows, parseContentProjection, KNOWN_SPELL_BEHAVIORS } from '../core/content-r2.ts';
import { createGame as createR1, createSnapshot as snapshotR1, validateSnapshot as validateR1 } from '../core/game-core.ts';
import { defaultR1Content } from '../core/content-r1.ts';
const fresh = () => createGame(defaultR2Content, 0xdecafbad);
let seq = 0;
const command = (g, type, payload = {}, actorId) => submitCommand(g, { commandId: `test-${seq++}`, tick: g.phase === 'wave' ? g.simTick + 1 : g.simTick, sequence: seq, type, payload, ...(actorId ? { actorId } : {}) });
const hero = (g, id) => g.heroes.find(h => h.id === id);
const fixture = (g, patch = {}) => ({ id: 'enemy-fixture', kind: 'melee', lane: 1, x: -800, y: -580, hp: 10000, maxHp: 10000, pathIndex: 1, attackCooldown: 9999, lastSpell: null, stealable: false, spellCooldown: 0, spellIndex: 0, ...patch });
const isolated = () => { const g = fresh(); command(g, 'start_wave'); g.spawnGroups.forEach(s => s.spawned = s.count); g.enemies = [fixture(g)]; return g; };
const acquire = (spellIndex) => {
  const g = isolated(), r = hero(g, 'rubick'); g.enemies = [fixture(g, { kind: 'siege', x: r.x + 100, y: r.y, spellIndex })];
  advanceTicks(g, 1); const enemy = g.enemies[0]; assert.equal(enemy.lastSpell, KNOWN_SPELL_BEHAVIORS[spellIndex]); assert.equal(enemy.stealable, true);
  const accepted = command(g, 'cast', { targetId: enemy.id }, 'rubick'); advanceTicks(g, 16); assert.equal(getCommandResult(g, accepted.commandId).status, 'accepted'); assert.equal(r.stolenSpell, KNOWN_SPELL_BEHAVIORS[spellIndex]); return g;
};
test('R2 actual EAV roundtrip has5heroes3buildings10waves and3known scalar spells; unknown handler blocks compilation', () => {
  const projection = { contentVersion: 'r2-content-1', metadataSchemaVersion: 'r2-meta-1', coreCompatibility: ['r2-core-1'], entities: contentRows().map(r => ({ type: r.type, parameters: r.parameters })) };
  assert.deepEqual(parseContentProjection(projection), defaultR2Content);
  assert.equal(defaultR2Content.waves.length, 10); assert.equal(defaultR2Content.heroes.length, 5); assert.equal(defaultR2Content.buildings.length, 3);
  const invalid = structuredClone(projection); invalid.entities.find(e => e.type === 'spell_definition').parameters.behavior_id = 'execute_custom_js'; assert.throws(() => parseContentProjection(invalid), /CONTENT_SPELL/);
});
test('save3 roundtrip preserves Rubick slot and both cooldowns plus Sniper priority; old R1 remains5waves/save2 and rejects cross-version state', () => {
  const g = acquire(2), r = hero(g, 'rubick'); r.abilityCooldown = 55; command(g, 'set_priority', { priority: 'commander' }, 'sniper'); advanceTicks(g, 1);
  // End this isolated wave naturally through fatal projectile; boundary clears active shields.
  g.projectiles.push({ id: 'close', sourceId: 'fixture-shooter', targetId: g.enemies[0].id, source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, damage: 999999, remainingTicks: 1, effectId: 'ballista_shot' }); advanceTicks(g, 1);
  const s = createSnapshot(g); assert.equal(s.schemaVersion, 3); assert.equal(s.heroes.find(h => h.id === 'rubick').stolenSpell, 'temporary_shield'); assert.ok(s.heroes.find(h => h.id === 'rubick').stealCooldown > 0); assert.ok(s.heroes.find(h => h.id === 'rubick').abilityCooldown > 0); assert.equal(s.heroes.find(h => h.id === 'sniper').priority, 'commander');
  assert.equal(validateSnapshot(s, g.content).valid, true); const restored = restoreSnapshot(g.content, s, { newEpoch: false }); assert.deepEqual(createSnapshot(restored), s);
  const old = snapshotR1(createR1(defaultR1Content, 3)); assert.equal(old.schemaVersion, 2); assert.equal(defaultR1Content.waves.length, 5); assert.equal(validateSnapshot(old, g.content).valid, false); assert.equal(validateR1(s, defaultR1Content).valid, false);
  for (const mutate of [s => s.heroes.find(h => h.id === 'rubick').stolenSpell = 'unknown', s => s.heroes.find(h => h.id === 'rubick').stealCooldown = -1, s => s.heroes.find(h => h.id === 'pudge').stolenSpell = 'area_heal', s => s.heroes.find(h => h.id === 'sniper').priority = 'random', s => s.heroes.find(h => h.id === 'shaman').priority = 'strongest']) { const bad = structuredClone(s); mutate(bad); assert.equal(validateSnapshot(bad, g.content).valid, false); }
});
test('Rubick rejects ordinary/no-cast/unknown/non-stealable/out-of-range targets before cooldown; disappeared target after accepted steal misses', () => {
  for (const patch of [{ kind: 'melee', lastSpell: 'area_heal', stealable: true }, { kind: 'siege', lastSpell: null }, { kind: 'siege', lastSpell: 'unknown', stealable: true }, { kind: 'siege', lastSpell: 'area_heal', stealable: false }, { kind: 'siege', lastSpell: 'area_heal', stealable: true, x: -1000, y: -700 }]) {
    const g = isolated(), r = hero(g, 'rubick'); g.enemies = [fixture(g, { x: r.x + 100, y: r.y, spellCooldown: 1000, ...patch })]; const c = command(g, 'cast', { targetId: 'enemy-fixture' }, 'rubick'); advanceTicks(g, 1); assert.equal(getCommandResult(g, c.commandId).status, 'rejected'); assert.equal(r.stealCooldown, 0); assert.equal(r.stolenSpell, null);
  }
  const g = isolated(), r = hero(g, 'rubick'); g.enemies = [fixture(g, { kind: 'siege', x: r.x + 100, y: r.y, lastSpell: 'area_heal', stealable: true, spellCooldown: 1000 })]; command(g, 'cast', { targetId: 'enemy-fixture' }, 'rubick'); advanceTicks(g, 1); g.enemies[0].hp = 0; g.enemies.push(fixture(g, { id: 'keep-wave', x: -1000 })); advanceTicks(g, 16); assert.equal(r.stolenSpell, null); assert.ok(r.stealCooldown > 0); assert.ok(drainEvents(g).some(e => e.type === 'cast_missed' && e.effectId === 'rubick_miss'));
});
test('Rubick captures spell as it existed at accepted steal start even when commander changes last cast during animation', () => {
  const g = isolated(), r = hero(g, 'rubick'); g.enemies = [fixture(g, { kind: 'siege', x: r.x + 100, y: r.y, lastSpell: 'area_heal', stealable: true, spellCooldown: 1000 })]; command(g, 'cast', { targetId: 'enemy-fixture' }, 'rubick'); advanceTicks(g, 1); g.enemies[0].lastSpell = 'area_strike'; advanceTicks(g, 16); assert.equal(r.stolenSpell, 'area_heal');
});
for (const [index, spell] of KNOWN_SPELL_BEHAVIORS.entries()) test(`stolen ${spell} has real bounded gameplay effect and consumes slot exactly once`, () => {
  const g = acquire(index), r = hero(g, 'rubick'); g.enemies[0].spellCooldown = 9999; drainEvents(g);
  r.hp = 80; const beforeHp = r.hp, beforeEnemy = g.enemies[0].hp; const target = spell === 'area_strike' ? { x: g.enemies[0].x, y: g.enemies[0].y } : { x: r.x, y: r.y };
  const c = command(g, 'cast', target, 'rubick'); advanceTicks(g, 1); assert.equal(r.stolenSpell, null); assert.ok(r.abilityCooldown > 0); const cooldown = r.abilityCooldown; assert.deepEqual(submitCommand(g, { commandId: c.commandId, tick: c.tick, sequence: Number(c.commandId.split('-')[1]) + 1, type: 'cast', payload: target, actorId: 'rubick' }).status, 'accepted'); assert.equal(r.abilityCooldown, cooldown);
  advanceTicks(g, 16); assert.ok(drainEvents(g).some(e => e.type === 'spell_used' && e.spellId === spell));
  if (spell === 'area_heal') { assert.ok(r.hp > beforeHp); assert.ok(r.hp <= r.maxHp); }
  else if (spell === 'area_strike') assert.ok(g.enemies[0].hp < beforeEnemy);
  else { assert.ok(r.shield); assert.ok(r.shield.absorption <= defaultR2Content.spells.find(s => s.behaviorId === spell).magnitude); const absorption = r.shield.absorption; const hp = r.hp; g.projectiles.push({ id: 'shield-test', sourceId: 'external', targetId: r.id, source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, damage: absorption + 10, remainingTicks: 1, effectId: 'enemy_attack' }); advanceTicks(g, 1); assert.equal(r.hp, hp - 10); assert.equal(r.shield, undefined); }
});
test('Undying creates sequential moving zombies with hard active cap, finite parent TTL and cleanup', () => {
  const g = isolated(), u = hero(g, 'undying'); g.enemies[0].x = u.x - 500; g.enemies[0].y = u.y; command(g, 'cast', { x: u.x, y: u.y }, 'undying'); advanceTicks(g, 20); assert.equal(g.summons.filter(s => s.kind === 'tombstone').length, 1); assert.equal(g.summons.filter(s => s.kind === 'zombie').length, 0);
  let peak = 0, moved = false; for (let i = 0; i < 500 && g.phase === 'wave'; i++) { advanceTicks(g, 1); const zombies = g.summons.filter(s => s.kind === 'zombie'); peak = Math.max(peak, zombies.length); moved ||= zombies.some(z => z.x !== u.x || z.y !== u.y); assert.ok(zombies.length <= 6); assert.ok(zombies.every(z => g.summons.some(p => p.id === z.parentId && p.kind === 'tombstone'))); }
  assert.equal(peak, 6); assert.equal(moved, true); assert.equal(g.summons.length, 0); const events = drainEvents(g); assert.ok(events.some(e => e.effectId === 'tombstone_rise')); assert.ok(events.some(e => e.effectId === 'zombie_rise')); assert.ok(events.some(e => e.effectId === 'zombie_attack'));
});
test('slow totem caps refreshed movement slowing, never immobilizes, and expiry restores normal speed', () => {
  const g = fresh(); command(g, 'build', { padId: 'pad-n1', kind: 'slow_totem' }); const b = g.buildings[0]; command(g, 'upgrade', {}, b.id); command(g, 'upgrade', {}, b.id); command(g, 'start_wave'); g.spawnGroups.forEach(s => s.spawned = s.count); g.enemies = [fixture(g, { lane: 0, x: -600, y: -580, pathIndex: 1 })];
  advanceTicks(g, 1); const e = g.enemies[0]; assert.equal(e.slow.percent, 60); const prior = e.x; advanceTicks(g, 1); assert.ok(e.x > prior); assert.ok(e.x - prior < 4); b.attackCooldown = 1000; advanceTicks(g, 61); assert.equal(e.slow, undefined); const p = e.x; advanceTicks(g, 1); assert.equal(e.x - p, 4);
});
test('Sniper saved priority chooses strongest/commander; accepted aim cannot retarget vanished enemy or refund cooldown', () => {
  const g = isolated(), s = hero(g, 'sniper'); s.attackCooldown = 0; g.enemies = [fixture(g, { id: 'weak', x: s.x + 100, y: s.y, hp: 100 }), fixture(g, { id: 'strong', x: s.x + 200, y: s.y, hp: 500 }), fixture(g, { id: 'boss', kind: 'siege', x: s.x + 250, y: s.y, hp: 200, spellCooldown: 9999 })];
  command(g, 'set_priority', { priority: 'strongest' }, 'sniper'); advanceTicks(g, 1); assert.ok(drainEvents(g).some(e => e.type === 'projectile_fired' && e.sourceId === 'sniper' && e.targetId === 'strong'));
  s.attackCooldown = 0; command(g, 'set_priority', { priority: 'commander' }, 'sniper'); advanceTicks(g, 1); assert.ok(drainEvents(g).some(e => e.type === 'projectile_fired' && e.sourceId === 'sniper' && e.targetId === 'boss'));
  const cast = command(g, 'cast', { targetId: 'weak' }, 'sniper'); advanceTicks(g, 1); g.enemies.find(e => e.id === 'weak').hp = 0; advanceTicks(g, 25); assert.equal(getCommandResult(g, cast.commandId).status, 'accepted'); assert.ok(s.abilityCooldown > 0); assert.ok(drainEvents(g).some(e => e.type === 'cast_missed' && e.effectId === 'sniper_miss'));
});
test('all commander rotation handlers are actual timed casts; shields expire without snapshot leakage', () => {
  const g = isolated(), r = hero(g, 'rubick'); g.enemies = [fixture(g, { kind: 'siege', x: -700, y: 0 })]; advanceTicks(g, 305); const events = drainEvents(g).filter(e => e.type === 'commander_cast'); assert.deepEqual(events.slice(0, 3).map(e => e.spellId), KNOWN_SPELL_BEHAVIORS); assert.equal(g.enemies[0].lastSpell, 'temporary_shield'); assert.ok(g.enemies[0].shield);
  g.enemies[0].spellCooldown = 9999; advanceTicks(g, 151); assert.equal(g.enemies[0].shield, undefined);
});
