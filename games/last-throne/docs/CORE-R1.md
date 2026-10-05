# R1 game core contract

Source of requirements: Last-Throne-TZ-v0.3.md §§2, 8.1, R1 requested on 2026-10-04. The core owns rules; the renderer only presents events. `core/content-r1.ts` is the publisher's seed template. Actual games compile **published, pinned EAV rows** through `parseContentProjection`; changing the published initial gold, damage, map, or wave values changes the simulation. It does not use the local template as an HTTP failure fallback.

## Public API

Import `GameContent`, `Point`, `HeroKind`, `BuildingKind` from `core/content-r1.ts`, and `GameState`, `GameCommand`, `GameSnapshot`, `GameEvent`, `VersionPins` from `core/game-core.ts`.

- `createGame(content, seed, pins?)` validates R1 content, copies it, creates two heroes and preparation for wave 1.
- `submitCommand(game, command)` returns `{commandId,status,code,tick}`. Preparation executes sequentially at `game.simTick`. Wave commands for `(simTick, simTick+300]` queue, then execute in `(sequence, commandId)` order. The input adapter assigns the next tick and monotonically increasing sequence. `getCommandResult(game,id)` reads the eventual result; `command_result` events carry the same ID/code and accepted/rejected status in `reason`.
- `advanceTicks(game,n=1)` advances only `wave`, up to 100,000 battle ticks per call. The browser uses 30 fixed ticks per second. `pause`/`resume` are between-tick controls and preparation does not advance timers. On hidden tab the browser explicitly pauses and discards elapsed wall time.
- `drainEvents(game)` transfers events once. Coordinates are integer `{x,y}`; Babylon maps them to `(X,Z)=(x,-y)*content.map.scale` with scale `0.01`; simulation north (negative y) appears above south on screen. Events include stable `eventId`, `tick`, `type`, effect ID, source/target IDs and points where relevant. Animation must never apply damage or spend gold.
- `createSnapshot(game)` throws `UNSAFE_CHECKPOINT` outside canonical preparation. `validateSnapshot(snapshot,content,pins?)` returns `{valid,errors,snapshot?}` with a normalized deep copy. `restoreSnapshot(content,snapshot,{newEpoch?:boolean,pins?:VersionPins})` rejects invalid state and normally increments the command epoch. Abandoned wave commands and effects are not replayed.
- `getFinishResult(game)` throws before terminal outcome; then returns outcome, `wave` (active wave on defeat), `lastCompletedWave`, `simTick`, `gold`, `throneHp`, `seed`, pinned versions and statistics. This is an unverified local client outcome, not a leaderboard assertion.

## Commands

All commands include `commandId` (1–96 safe characters), `tick`, `sequence`, `type`, `payload`, optional `actorId`. An exact repeated ID returns its prior result. A different body with that ID rejects `COMMAND_ID_REUSED` and cannot spend again.

| Type | Actor / payload | Rules |
| --- | --- | --- |
| `build` | `{padId,kind:'ballista'|'magic_tower'}` | Square building foundations only; atomically reserve and spend. Immediate preparation activation; delayed battle construction. |
| `upgrade` | `actorId`, `{}` | Hero or completed living building; levels 1–3. Cost from pinned content; heal only increased maximum HP. |
| `sell` | Building `actorId`, `{}` | Preparation only; floor(70% total invested gold), empty pad afterward. |
| `buy_scroll` | `{}` | One scroll for 50 gold, max 99. No cost if refused. |
| `teleport` | Hero `actorId`, `{anchorId}` | Circular hero places only; free immediate preparation move, paid scroll and 75-tick channel in battle. Origin and destination remain reserved; death cancels without refund. |
| `cast` Pudge | `actorId:'pudge'`, `{targetId}` | Visible living movable enemy within range. Cooldown starts at accepted cast; chain pulls after 12 ticks. Control expires after 45 ticks; survivor reconnects to its retained path point. Siege commander is immovable. |
| `cast` Shaman | `actorId:'shaman'`, `{x,y}` | Valid integer map point within ability range. Four timed snakes rise after cast, remain within bounds, attack independently, never occupy pads or block navigation. |
| `start_wave` | `{}` | Preparation only; starts `nextWave` from pinned 5-wave content. Save prepared snapshot locally before submission. |
| `pause` / `resume` | `{}` | Between-tick controls; no hidden clock advancement. |

R1 omits items, expeditions, Undying, Rubick and Sniper per its release scope.

## Deterministic order and saves

Each battle tick accepts commands and reservations; decrements timers; moves enemies and selects stable targets; forms/settles effects by `(sourceId,actionSequence,targetId)`; records deaths and one bounty; completes construction, teleport and resurrection; checks defeat before wave completion. Already fired projectiles outlive their source. A hero killed on teleport's completion tick dies on the origin anchor. Hero death reserves that anchor and returns after 900 battle ticks. Timers freeze in preparation and pause.

Integer simulation coordinates, HP, gold and timers are independent of renderer frequency. PRNG is Mulberry32 with 32-bit state, using the pinned `r1-core-1` arithmetic. Enemy starting cooldown draws from this PRNG; seed and state are saved. No ambient random or date APIs occur in rules.

A non-final wave transition grants its reward once, removes summons/projectiles/casts, finishes paid construction and surviving teleports, sets completed/next wave and preparation immediately. Victory occurs after wave 5 with throne HP above zero. Simultaneous destruction takes defeat priority and grants no wave reward.

Snapshot schema 2 contains exact core/content/metadata versions, seed/rngState, `simTick`, command epoch, `phase:'preparation'`, completed/next wave, gold, throne HP, scrolls, statistics, typed saved heroes and buildings. Positions derive from pinned place IDs. Validators reject wrong versions, unknown fields, unknown actors/places, overlaps, fractional values, unsafe HP/cooldowns, impossible resurrection, and inconsistent investment costs. The backend decomposes these values into typed EAV, atomically as a generation.

Statistics are cumulative: `kills` counts combat enemy deaths (escapes excluded); `builds` and `upgrades` count accepted purchases; `goldEarned` counts death bounties plus wave rewards, excluding initial gold and sale refunds. They persist in checkpoints and terminal results.

## Author verification

`node --test tests/core-r1.test.mjs`: 15 tests passed on Node 24.19.0. Coverage includes EAV projection round trip and changed published value, placement and idempotency, same-tick reservations, selling, frame-independent replay, pause, overlapping fatal damage, projectiles after source death, hook reconnection and target loss, snake lifetime, death at teleport completion, resurrection, canonical transition, malformed saves, terminal priority, five-wave victory and no-defense defeat. Strict TypeScript compilation of both core files passed. Browser graphics and cloud HTTP behavior are verified separately by their owners; these tests do not claim VPS deployment or subjective playtest acceptance.
