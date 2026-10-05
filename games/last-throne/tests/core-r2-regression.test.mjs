import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitCommand, advanceTicks, createSnapshot, restoreSnapshot, validateSnapshot, getFinishResult, drainEvents, getCommandResult } from '../core/game-core-r2.ts';
import { defaultR2Content, contentRows, parseContentProjection, validateContent } from '../core/content-r2.ts';
const newGame = (seed = 123) => createGame(defaultR2Content, seed);
const command = (g, id, type, payload = {}, actorId, sequence = 0, tick = g.phase === 'wave' ? g.simTick + 1 : g.simTick) => submitCommand(g, { commandId: id, tick, sequence, type, payload, ...(actorId ? { actorId } : {}) });
const start = g => command(g, `start-${g.nextWave}`, 'start_wave');
const runWave = g => { advanceTicks(g, 100_000); assert.notEqual(g.phase, 'wave'); };
const enemyFixture = (g, patch = {}) => { const d = g.content.enemies[0]; return { id: 'fixture-enemy', kind: d.kind, lane: 1, x: 100, y: 0, hp: 1000, maxHp: 1000, pathIndex: 2, attackCooldown: 0, ...patch }; };
const isolateWave = g => { start(g); g.spawnGroups.forEach(x => { x.spawned = x.count; }); };
test('published typed EAV projection round-trips every balance/map/wave value; changing actual EAV changes simulation', () => {
  const rows = contentRows(); const projection = { contentVersion: 'r2-content-1', metadataSchemaVersion: 'r2-meta-1', coreCompatibility: ['r2-core-1'], entities: rows.map(r => ({ type: r.type, parameters: r.parameters })) };
  assert.deepEqual(parseContentProjection(projection), defaultR2Content);
  const copied = structuredClone(projection); copied.entities.find(e => e.type === 'game_config').parameters.initial_gold = '700';
  assert.equal(createGame(parseContentProjection(copied), 3).gold, 700);
  copied.entities.find(e => e.type === 'hero_definition').parameters.code = 'unknown'; assert.throws(() => parseContentProjection(copied), /CONTENT_HERO/);
});
test('wrong place, occupied pad and insufficient gold reject without spending; commandId exact repeat accepted once and changed body rejected', () => {
  const g = newGame(); const wrong = command(g, 'wrong', 'build', { padId: 'anchor-n1', kind: 'ballista' }); assert.equal(wrong.code, 'WRONG_PLACE_TYPE'); assert.equal(g.gold, 620);
  const c = { commandId: 'one', tick: 0, sequence: 1, type: 'build', payload: { padId: 'pad-n1', kind: 'ballista' } };
  assert.equal(submitCommand(g, c).status, 'accepted'); const after = g.gold; assert.deepEqual(submitCommand(g, c), getCommandResult(g, 'one')); assert.equal(g.gold, after); assert.equal(g.buildings.length, 1);
  assert.equal(submitCommand(g, { ...c, payload: { padId: 'pad-n2', kind: 'ballista' } }).code, 'COMMAND_ID_REUSED');
  assert.equal(command(g, 'occupied', 'build', { padId: 'pad-n1', kind: 'ballista' }).code, 'PLACE_OCCUPIED');
  g.gold = 1; assert.equal(command(g, 'poor', 'build', { padId: 'pad-n2', kind: 'ballista' }).code, 'INSUFFICIENT_GOLD'); assert.equal(g.gold, 1);
});
test('same-tick battle commands use sequence then ID; reserve one pad and one teleport anchor atomically', () => {
  const g = newGame(); command(g, 'scroll1', 'buy_scroll'); command(g, 'scroll2', 'buy_scroll'); start(g);
  command(g, 'late', 'build', { padId: 'pad-n1', kind: 'ballista' }, undefined, 20);
  command(g, 'early', 'build', { padId: 'pad-n1', kind: 'magic_tower' }, undefined, 10);
  command(g, 'tel-shaman', 'teleport', { anchorId: 'anchor-n1' }, 'shaman', 3);
  command(g, 'tel-pudge', 'teleport', { anchorId: 'anchor-n1' }, 'pudge', 2); advanceTicks(g, 1);
  assert.equal(g.buildings.length, 1); assert.equal(g.buildings[0].kind, 'magic_tower'); assert.equal(getCommandResult(g, 'late').code, 'PLACE_OCCUPIED');
  assert.equal(g.heroes.find(h => h.id === 'pudge').teleport.targetAnchorId, 'anchor-n1'); assert.equal(getCommandResult(g, 'tel-shaman').code, 'PLACE_OCCUPIED'); assert.equal(g.scrolls, 1);
});
test('upgrades count total invested gold; sell refunds floor70 percent only in preparation', () => {
  const g = newGame(); command(g, 'build', 'build', { padId: 'pad-m1', kind: 'ballista' }); const b = g.buildings[0]; command(g, 'upgrade', 'upgrade', {}, b.id);
  assert.equal(b.level, 2); assert.equal(b.spentGold, 200); const before = g.gold; command(g, 'sell', 'sell', {}, b.id); assert.equal(g.gold, before + 140); assert.equal(g.buildings.length, 0);
  command(g, 'rebuild', 'build', { padId: 'pad-m1', kind: 'ballista' }); start(g); command(g, 'illegal', 'sell', {}, g.buildings[0].id); advanceTicks(g, 1); assert.equal(getCommandResult(g, 'illegal').code, 'PREPARATION_ONLY');
});
test('fixed-step replay with different rendering frame batches and identical command journal produces identical snapshots', () => {
  const prepare = () => { const g = newGame(789); command(g, 'b1', 'build', { padId: 'pad-n1', kind: 'magic_tower' }); command(g, 'b2', 'build', { padId: 'pad-s1', kind: 'magic_tower' }); command(g, 'b3', 'build', { padId: 'pad-m2', kind: 'ballista' }); start(g); return g; };
  const a = prepare(), b = prepare(); while (a.phase === 'wave') advanceTicks(a, 1); while (b.phase === 'wave') advanceTicks(b, 7);
  assert.deepEqual(createSnapshot(a), createSnapshot(b)); assert.deepEqual(drainEvents(a), drainEvents(b)); assert.notEqual(a.rngState, a.seed);
});
test('pause and preparation stop battle clocks; resume advances exactly the next tick', () => {
  const g = newGame(); advanceTicks(g, 20); assert.equal(g.simTick, 0); start(g); advanceTicks(g, 20); const tick = g.simTick; const enemies = structuredClone(g.enemies);
  command(g, 'pause', 'pause'); advanceTicks(g, 1000); assert.equal(g.simTick, tick); assert.deepEqual(g.enemies, enemies);
  command(g, 'resume', 'resume'); advanceTicks(g, 1); assert.equal(g.simTick, tick + 1);
});
test('fatal overlap awards one death bounty; independent already fired projectile lands after source death', () => {
  const g = newGame(); isolateWave(g); g.enemies = [enemyFixture(g, { hp: 15, x: 0 })]; g.heroes.forEach(h => { h.x = 1000; h.y = 700; });
  g.projectiles = ['dead-a', 'dead-b'].map(sourceId => ({ id: sourceId, sourceId, targetId: 'fixture-enemy', source: { x: 50, y: 0 }, target: { x: 0, y: 0 }, damage: 20, remainingTicks: 1, effectId: 'ballista_shot' }));
  const gold = g.gold; advanceTicks(g, 1); const events = drainEvents(g); assert.equal(events.filter(e => e.type === 'unit_died' && e.sourceId === 'fixture-enemy').length, 1); assert.equal(g.gold, gold + 12 + 55); assert.equal(g.phase, 'preparation');
});
test('Pudge hook spends cooldown, pulls one living enemy and returns it to allowed route after control', () => {
  const g = newGame(); isolateWave(g); const p = g.heroes.find(h => h.id === 'pudge'); g.enemies = [enemyFixture(g, { x: -50, hp: 1000 })];
  assert.equal(command(g, 'hook', 'cast', { targetId: 'fixture-enemy' }, 'pudge').status, 'queued'); advanceTicks(g, 13); const e = g.enemies[0]; assert.ok(e.detour); assert.equal(e.y, p.y); assert.ok(drainEvents(g).some(e => e.effectId === 'hook_pull')); const tick = g.simTick;
  advanceTicks(g, 120); assert.ok(g.simTick > tick); assert.equal(g.enemies[0]?.detour, undefined); assert.ok(!g.enemies.length || g.enemies[0].x > -50);
});
test('dead-before-hook impact consumes begun cooldown without repeated damage; immovable siege rejects before cooldown', () => {
  const g = newGame(); isolateWave(g); g.enemies = [enemyFixture(g)]; command(g, 'cast', 'cast', { targetId: 'fixture-enemy' }, 'pudge'); advanceTicks(g, 1); g.enemies[0].hp = 0;
  // Keep a second hostile alive so no end-of-wave cleanup masks the cast timer.
  g.enemies.push(enemyFixture(g, { id: 'alive', x: -1000 })); advanceTicks(g, 15); assert.ok(g.heroes.find(h => h.id === 'pudge').abilityCooldown > 0); assert.ok(drainEvents(g).some(e => e.type === 'cast_missed'));
  const g2 = newGame(); isolateWave(g2); g2.enemies = [enemyFixture(g2, { kind: 'siege' })]; command(g2, 'immovable', 'cast', { targetId: 'fixture-enemy' }, 'pudge'); advanceTicks(g2, 1); assert.equal(getCommandResult(g2, 'immovable').code, 'TARGET_IMMOVABLE'); assert.equal(g2.heroes.find(h => h.id === 'pudge').abilityCooldown, 0);
});
test('Shaman snakes are bounded timed summons and never occupy a building foundation or block navigation', () => {
  const g = newGame(); isolateWave(g); g.enemies = [enemyFixture(g, { x: -1000, hp: 2000 })]; const h = g.heroes.find(h => h.id === 'shaman');
  command(g, 'snakes', 'cast', { x: h.x, y: h.y }, 'shaman'); advanceTicks(g, 20); assert.equal(g.summons.length, 4); assert.equal(g.buildings.length, 0); assert.ok(g.summons.every(s => s.ttlTicks <= 330));
  advanceTicks(g, 400); assert.equal(g.summons.length, 0);
});
test('death at teleport completion stays on source anchor, releases target reserve, retains spent scroll and respawns only battle-time', () => {
  const g = newGame(); command(g, 'buy', 'buy_scroll'); isolateWave(g); const h = g.heroes.find(h => h.id === 'pudge'); const oldAnchor = h.anchorId; g.enemies = [enemyFixture(g, { x: -1000, hp: 10000 })];
  command(g, 'teleport', 'teleport', { anchorId: 'anchor-n1' }, 'pudge'); advanceTicks(g, 1); h.teleport.remainingTicks = 1; h.hp = 1; g.projectiles.push({ id: 'fatal', sourceId: 'fixture-enemy', targetId: h.id, source: { x: h.x, y: h.y }, target: { x: h.x, y: h.y }, damage: 10, remainingTicks: 1, effectId: 'enemy_attack' });
  advanceTicks(g, 1); assert.equal(h.anchorId, oldAnchor); assert.equal(h.teleport, undefined); assert.equal(g.scrolls, 0); assert.equal(h.respawnTicks, 900); assert.equal(h.hp, 0); assert.ok(drainEvents(g).some(e => e.effectId === 'teleport_cancel'));
  command(g, 'pause-dead', 'pause'); advanceTicks(g, 900); assert.equal(h.respawnTicks, 900); command(g, 'resume-dead', 'resume');
  // Extend current wave without letting a fixture reach the throne.
  g.spawnGroups.push({ id: 'hold', lane: 0, enemyKind: 'melee', count: 1, spawned: 0, intervalTicks: 30, delayTicks: 100000 }); g.enemies = []; advanceTicks(g, 900); assert.equal(h.hp, h.maxHp); assert.equal(h.respawnTicks, 0);
});
test('end-of-wave transition finalizes construction/teleport and removes casts/projectiles/summons without extra damage; checkpoint restore adds fresh epoch only', () => {
  const g = newGame(); command(g, 'buy', 'buy_scroll'); isolateWave(g); command(g, 'build', 'build', { padId: 'pad-s1', kind: 'magic_tower' }); command(g, 'teleport', 'teleport', { anchorId: 'anchor-n1' }, 'pudge'); advanceTicks(g, 1);
  assert.equal(g.phase, 'preparation'); assert.equal(g.buildings[0].constructionTicks, 0); assert.equal(g.heroes.find(h => h.id === 'pudge').anchorId, 'anchor-n1'); assert.equal(g.lastCompletedWave, 1); assert.equal(g.nextWave, 2);
  const s = createSnapshot(g); assert.equal(validateSnapshot(s, g.content).valid, true); const restored = restoreSnapshot(g.content, s); const s2 = createSnapshot(restored); assert.equal(s2.commandEpoch, s.commandEpoch + 1); s2.commandEpoch = s.commandEpoch; assert.deepEqual(s2, s); assert.equal(restored.commandHistory.build, undefined);
});
test('malformed checkpoints reject mixed versions, live battle objects, overlapping places, unknown kinds, forged spent gold, fractional HP and impossible resurrection', () => {
  const g = newGame(); command(g, 'b', 'build', { padId: 'pad-n1', kind: 'ballista' }); const s = createSnapshot(g);
  for (const mutate of [x => x.versions.content = 'new-unpinned', x => x.enemies = [], x => x.heroes[1].anchorId = x.heroes[0].anchorId, x => x.buildings[0].kind = 'generic', x => x.heroes[0].spentGold = 500, x => x.heroes[0].hp = 1.5, x => x.heroes[0].hp = 0, x => x.nextWave = 5, x => x.rngState = -1]) { const bad = structuredClone(s); mutate(bad); assert.equal(validateSnapshot(bad, g.content).valid, false); assert.throws(() => restoreSnapshot(g.content, bad), /INVALID_SNAPSHOT/); }
  start(g); assert.throws(() => createSnapshot(g), /UNSAFE_CHECKPOINT/);
});
test('throne destruction on same tick as last enemy takes defeat priority; one terminal event and no wave reward', () => {
  const g = newGame(); isolateWave(g); g.activeWave = 10; g.lastCompletedWave = 9; g.nextWave = 10; g.throneHp = 1; const throne = g.content.map.throne; g.enemies = [enemyFixture(g, { x: throne.x - 1, y: throne.y, pathIndex: 4 })]; g.heroes.forEach(h => { h.x = -1000; h.y = -700; }); const gold = g.gold;
  advanceTicks(g, 1); assert.equal(g.phase, 'defeat'); assert.equal(g.gold, gold); assert.equal(getFinishResult(g).outcome, 'defeat'); advanceTicks(g, 100); assert.equal(drainEvents(g).filter(e => e.type === 'run_finished').length, 1);
});
test('all ten waves terminate in victory with functioning balanced defense; no-defense run terminates defeat', () => {
  const g = newGame(); for (const [i, pad] of ['pad-n1', 'pad-s1', 'pad-m2', 'pad-n2'].entries()) command(g, `build-${i}`, 'build', { padId: pad, kind: 'magic_tower' });
  while (g.phase !== 'victory' && g.phase !== 'defeat') {
    for (const b of [...g.buildings]) if (b.level < 3) command(g, `up-${g.nextWave}-${b.id}`, 'upgrade', {}, b.id);
    start(g); runWave(g);
  }
  assert.equal(g.phase, 'victory'); assert.equal(g.lastCompletedWave, 10); assert.equal(g.nextWave, null); assert.ok(g.throneHp > 0);
  const bare = newGame(); bare.heroes.forEach(h => { h.x = -1000; h.y = -750; }); while (bare.phase !== 'defeat' && bare.phase !== 'victory') { start(bare); runWave(bare); } assert.equal(bare.phase, 'defeat');
});
