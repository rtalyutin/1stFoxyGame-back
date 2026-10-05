# R2 pure game core — r2/1

Requirements: `docs/R2-CONTRACT.md`, revision `r2/1`, SHA256 `02556ff217ded0abef235fce435e936e8ffce581c3411dfac06ab76008631168`. R2 adds five heroes, three building families and ten waves. New modules are `core/content-r2.ts` and `core/game-core-r2.ts`; R1 modules remain byte-for-byte unchanged. R2 pins are `r2-core-1 / r2-content-1 / r2-meta-1`, snapshot schema 3. Neither R1 checkpoints nor R1 wave count are converted.

The public API retains R1 function names and signatures: `createGame`, `submitCommand`, `getCommandResult`, `advanceTicks`, `drainEvents`, `createSnapshot`, `validateSnapshot`, `restoreSnapshot`, `getFinishResult`. R2 still uses integer state, fixed 30 Hz, Mulberry32 seed/state, sorted command IDs and sorted impacts. Healing, damage and shield grants settle together in stable source/action/target order. Renderer events never change rules.

## Published content

`contentRows(defaultR2Content)` produces 88 entities with typed scalar parameters. `parseContentProjection` builds a runtime configuration from the verified pinned EAV projection. It never falls back to the template on failed content loading. Hero/building/map/enemy/wave descriptors retain existing fields; additions are:

| Entity type | Scalar EAV additions |
| --- | --- |
| `hero_definition` | `steal_cooldown_ticks`, `summon_ttl_ticks`, `summon_interval_ticks`, `summon_cap`, `summon_hp`, `summon_speed`, `summon_attack_ticks`, `summon_range` |
| `building_definition` | `slow_percent`, `slow_ticks`, `slow_cap_percent` |
| `enemy_definition` | `commander` boolean, `spell_cooldown_ticks`, `spell_1`, `spell_2`, `spell_3` strings |
| `spell_definition` | `code`, `behavior_id`, `label`, `magnitude`, `radius`, `duration_ticks` |

`game_config` has code `r2`. `KNOWN_SPELL_BEHAVIORS` contains exactly `area_heal`, `area_strike`, `temporary_shield`. Publication/runtime validation rejects an unknown spell handler, unknown hero/building/enemy kind, malformed rotation, invalid map or unsafe scalar limits. There is no executable code in a content entity.

Initial hero IDs equal kinds: `pudge`, `shaman`, `undying`, `rubick`, `sniper`. Their five distinct circular anchors leave `anchor-n1` free for relocation. The nine square building foundations and three fixed routes remain unchanged. `slow_totem` is the third building family.

## New commands and saved values

Every saved hero includes `stolenSpell:string|null`, `stealCooldown:number`, and `priority:'nearest'|'strongest'|'commander'`. Defaults are null, 0 and nearest. Only Rubick may have a slot/steal cooldown; only Sniper may use a non-default priority. Unknown/missing/inappropriate values reject a checkpoint. Slot and both cooldowns survive safe saves; active shields, slow states and summons are transient and disappear at the canonical wave boundary.

- Undying `cast {x,y}` creates one finite tombstone after preparation. It creates zombies sequentially, capped at six active children per owner. Zombies move toward stable nearest living enemies, attack, and expire with their finite parent. Another active tombstone rejects before spending cooldown. Tunables come from the hero descriptor.
- Empty-slot Rubick `cast {targetId}` requires a live commander in range with a known last **actually cast** spell marked stealable. Invalid targets spend no cooldown. The accepted cast captures that spell ID; completion copies it if the target still exists. Target loss yields a miss without refund. `stealCooldown` is separate from use cooldown.
- Filled-slot Rubick `cast {x,y}` consumes its slot once at acceptance and starts `abilityCooldown`. Heal affects living allies, capped at max HP; strike damages enemies; shield grants bounded absorption and TTL to living allies. Effects use published magnitude/radius/duration and level scaling. Shield absorbs damage before HP, expires, and does not stack unboundedly.
- Sniper `cast {targetId}` accepts a living in-range target, consumes cooldown and prepares aim. If the target disappears, it misses without retargeting or refund. `set_priority {priority}` selects nearest, strongest current HP, or commander-first; stable ID resolves ties. It works in preparation and battle and persists in a save.
- Slow totem pulses in range, refreshes one slow state without stacking, and caps reduction at configured percentage (60% in default content). Movement remains at least one simulation unit per tick. Slow expires after its timer.

Wave 5 uses `siege`; wave 10 uses `arcane_commander`. Both are immovable and rotate their configured three known handlers. `Enemy.lastSpell`, `stealable`, `spellCooldown`, `spellIndex` describe real casts; an empty initial lastSpell cannot be stolen.

## Renderer contract

`GameEvent` retains R1 fields and adds `spellId?:string` and `radius?:number`. New effects include `tombstone_cast`, `tombstone_rise`, `zombie_rise`, `zombie_attack`, `rubick_steal`, `rubick_captured`, `area_heal`, `area_strike`, `temporary_shield`, `sniper_aim`, `sniper_shot`, `slow_pulse`, plus automatic `rubick_bolt`, `sniper_bolt`, `undying_attack`.

For theft, event `source` is commander position and `target` is Rubick position, making the visual travel toward the staff; `sourceId` is Rubick and `targetId` is commander. `spell_stolen.spellId` is the slot label lookup key. Area events include center `position`, `target`, radius and duration. `commander_cast.kind` is siege/arcane_commander. Summons have `kind:'snake'|'tombstone'|'zombie'`; zombies have `parentId`. Heroes/buildings/enemies may expose a transient shield; enemies may expose a transient slow. These observations are display data, not commands.

## Verification evidence and handoff

`handoff_schema=FEATURE_HANDOFF/1`, digest `aa1cfed01fce21493e11f57235c6efa1f4b4895bb2b1c9b571ae0683956f3750`. `feature_id=last-throne-r2`, `contract_revision=r2/1`, producer `/root/core_r1`, consumers root/database/renderer/independent QA. `evidence_status=VERIFIED`, `gate_verdict=PASS` only for the pure-core author checks; `action_decision=CONTINUE`, `hypothesis_assessment=NOT_ASSESSED`. No external operation was performed.

On Node 24.19.0, `node --test tests/core-r2*.test.mjs` passed 27 tests. Strict TypeScript compilation of both R2 modules passed. Tests cover R1 rule regressions, EAV roundtrip/unknown-handler rejection, cross-version rejection, save3 slot/cooldown/priority roundtrip, invalid theft and disappearing targets, all three stolen handlers, bounded shields/healing, finite zombie cap/TTL/movement/attacks, slow floor/expiry, Sniper selection/miss, commander rotation and deterministic full-party replay.

`tests/core-r2-party-proof.test.mjs` constructs the default game with seed `0x12345678`. It changes state exclusively through actual `submitCommand`/`advanceTicks`; no fixture writes or shortcuts. Preparation builds/upgrades defense and sets Sniper priority, battle input uses living in-range targets and published cooldowns. All ten waves finish in victory in **4592 battle ticks**, throne HP **240**, with **71 commands**, **182 kills**, **10 accepted builds**, **14 accepted upgrades**, **3739 earned gold**. It observes real tombstone/zombie attacks, Sniper aim/hit, slow pulses, Rubick theft/use and both commanders. Replay with chunks of 30 versus 7 ticks yields identical journal, boundary snapshots, result and event stream. Individual spell tests use explicitly controlled fixtures for boundary failures; this full-party proof does not.

Next action: independent QA of integrated browser/API build, then final artifact verification. Pure-core tests do not establish visual quality, hardware FPS, live PostgreSQL multi-session behavior, VPS deployment, user acceptance or game balance across players. Those limits remain with their owners.
