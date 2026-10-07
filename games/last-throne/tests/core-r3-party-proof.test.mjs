import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitCommand, advanceTicks, createSnapshot, drainEvents, getFinishResult } from '../core/game-core-r3.ts';
import { defaultR3Content } from '../core/content-r3.ts';
export function playR3Party(chunk = 30) {
  const game = createGame(defaultR3Content, 0x12345678);
  const journal = [], events = [], boundaries = []; let sequence = 0;
  const send = (type, payload = {}, actorId) => {
    const command = { commandId: `proof-${sequence}`, tick: game.phase === 'wave' ? game.simTick + 1 : game.simTick, sequence: sequence++, type, payload, ...(actorId ? { actorId } : {}) };
    journal.push(command); return submitCommand(game, command);
  };
  const range = (a, b, radius) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius ** 2;
  const nearest = (hero, radius, filter = () => true) => game.enemies.filter(e => e.hp > 0 && e.visible && range(hero, e, radius) && filter(e)).sort((a, b) => (a.x - hero.x) ** 2 + (a.y - hero.y) ** 2 - ((b.x - hero.x) ** 2 + (b.y - hero.y) ** 2) || a.id.localeCompare(b.id))[0];
  for (const [padId, kind] of [['pad-n1', 'magic_tower'], ['pad-s1', 'magic_tower'], ['pad-m2', 'magic_tower'], ['pad-n2', 'slow_totem']]) assert.equal(send('build', { padId, kind }).status, 'accepted');
  assert.equal(send('set_priority', { priority: 'commander' }, 'sniper').status, 'accepted');
  while (game.phase !== 'victory' && game.phase !== 'defeat') {
    for (const reward of [...game.pendingRewards]) assert.equal(send('choose_reward', { rewardId: reward.id, itemId: 'healing_lantern', slot: 0 }).status, 'accepted');
    if (game.nextWave === 2) { assert.equal(send('equip_item', { itemId: 'sight_gem', slot: 0 }, 'sniper').status, 'accepted'); }
    if (game.nextWave === 1) assert.equal(send('send_expedition', { kind: 'camp' }, 'pudge').status, 'accepted');
    if (game.nextWave === 2) assert.equal(send('send_expedition', { kind: 'shop' }, 'shaman').status, 'accepted');
    if (game.nextWave === 3) assert.equal(send('send_expedition', { kind: 'roshan' }, 'pudge').status, 'accepted');
    // All state changes occur through accepted commands. No fixtures, test shortcuts or writes.
    for (const b of [...game.buildings]) if (b.level < 3) { const d = game.content.buildings.find(d => d.kind === b.kind); if (game.gold >= d.upgradeCosts[b.level - 1]) assert.equal(send('upgrade', {}, b.id).status, 'accepted'); }
    for (const padId of ['pad-m1', 'pad-s2', 'pad-m3', 'pad-s3', 'pad-n3']) if (!game.buildings.some(b => b.padId === padId) && game.gold >= 140) assert.equal(send('build', { padId, kind: 'magic_tower' }).status, 'accepted');
    boundaries.push(createSnapshot(game)); assert.equal(send('start_wave').status, 'accepted');
    while (game.phase === 'wave') {
      for (const h of game.heroes) {
        if (h.hp <= 0 || h.expedition || h.teleport || game.casts.some(c => c.heroId === h.id)) continue;
        const d = game.content.heroes.find(d => d.kind === h.kind);
        if (h.kind === 'rubick') {
          if (h.stolenSpell === null) { const enemy = nearest(h, d.abilityRange, e => game.content.enemies.find(d => d.kind === e.kind).commander && e.stealable && e.lastSpell); if (enemy && h.stealCooldown === 0) send('cast', { targetId: enemy.id }, h.id); }
          else if (h.abilityCooldown === 0) { const enemy = nearest(h, d.abilityRange); const target = h.stolenSpell === 'area_strike' && enemy ? enemy : h; send('cast', { x: target.x, y: target.y }, h.id); }
        } else if (h.abilityCooldown === 0) {
          const enemy = nearest(h, d.abilityRange, e => h.kind !== 'pudge' || game.content.enemies.find(d => d.kind === e.kind).movable);
          if (!enemy) continue;
          if (h.kind === 'pudge' || h.kind === 'sniper') send('cast', { targetId: enemy.id }, h.id);
          else if (h.kind !== 'undying' || !game.summons.some(s => s.kind === 'tombstone' && s.ownerId === h.id)) send('cast', { x: enemy.x, y: enemy.y }, h.id);
        }
      }
      let left = 30; while (left > 0 && game.phase === 'wave') { const n = Math.min(chunk, left); advanceTicks(game, n); left -= n; }
      events.push(...drainEvents(game)); assert.ok(game.simTick < 100000, 'party must terminate within bounded battle ticks');
    }
    events.push(...drainEvents(game));
  }
  return { result: getFinishResult(game), journal, boundaries, events };
}
test('full fifteen-wave R3 party through actual commands only reaches victory and renders every new hero/building/commander behavior', () => {
  const proof = playR3Party(30);
  assert.equal(proof.result.outcome, 'victory'); assert.equal(proof.result.lastCompletedWave, 15); assert.ok(proof.result.throneHp > 0); assert.equal(proof.boundaries.length, 15);
  for (const effectId of ['tombstone_rise', 'zombie_rise', 'zombie_attack', 'sniper_aim', 'sniper_shot', 'slow_pulse', 'rubick_steal', 'rubick_captured', 'expedition_depart', 'expedition_return', 'item_equipped', 'detection_reveal']) assert.ok(proof.events.some(e => e.effectId === effectId), effectId);
  assert.ok(proof.events.some(e => e.type === 'commander_cast' && e.kind === 'siege')); assert.ok(proof.events.some(e => e.type === 'commander_cast' && e.kind === 'arcane_commander')); assert.ok(proof.events.some(e => e.type === 'commander_cast' && e.kind === 'bypass_commander'));
  assert.ok(proof.events.some(e => e.type === 'spell_used')); assert.equal(proof.events.filter(e => e.type === 'run_finished').length, 1);
  const replay = playR3Party(7); assert.deepEqual(replay.result, proof.result); assert.deepEqual(replay.journal, proof.journal); assert.deepEqual(replay.boundaries, proof.boundaries); assert.deepEqual(replay.events, proof.events);
  const summary = { outcome: proof.result.outcome, waves: proof.result.lastCompletedWave, ticks: proof.result.simTick, throneHp: proof.result.throneHp, commands: proof.journal.length, statistics: proof.result.statistics, effects: [...new Set(proof.events.map(e => e.effectId).filter(Boolean))].sort() };
  console.log(JSON.stringify({ r3PureCorePartyEvidence: summary }));
});
