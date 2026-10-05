# R2 contract r2/1 — 04.10.2026

Source Last-Throne-TZ-v0.4 §8.1/§2.3; user «продолжи» following R1. Five heroes, three buildings, ten waves, commanders5/10, tombstone/zombies, Rubick steal + area_heal/area_strike/temporary_shield, Sniper aim, slow totem. No items/expeditions/accounts.

Pins: r2-core-1/r2-content-1/r2-meta-1/save3/API1. Preserve core/content-r1.ts and core/game-core.ts exactly; new core/content-r2.ts/core/game-core-r2.ts. Never rewrite published migrations001–004 or ready r0-002/r1-002. R2 server dispatches validation/storage by complete run pins and accepts retained R1 + R2. R2 client resumes R2 only; R1 resume navigates verified retained r1-002 without conversion. R1 remains5waves/save2. Additive typed scalar EAV metadata; no opaque snapshot JSON storage.

New core exports same public functions/signatures as R1. GameCommand type cast actorId/payload; additional set_priority command for Sniper. Deterministic30Hz/integers/idempotency. Tunable TTL/range/duration/magnitude/cooldowns in scalar EAV content; unknown stolen behavior rejects publication. Renderer consumes new effectIds without gameplay mutations.

- Undying {x,y}: in-bounds ability range, tombstone finite TTL, sequential zombie spawn explicit cap; deterministic moving/attacking zombies expire with parent/wave. Summons carry kind and parentId; ephemeral state clears at boundary.
- Rubick empty slot {targetId}: live commander, last actual cast marked stealable, known behavior and range. Invalid target no cooldown. Cast completion copies started spell, lost target yields miss. Saved slot stolenSpell:string|null and stealCooldown integer. Filled slot {x,y}: consumes slot once when accepted; existing abilityCooldown is use cooldown. Heal allies capped maxHp, strike enemies, shield allies bounded absorption/TTL. Filled slot and both cooldowns survive snapshot; active shields do not.
- Commanders5/10 rotate3known spells on configured cooldown: heal allies, strike defenders, shield allies. Enemy lastSpell+stealable reflect actual casts. Immovable.
- Sniper {targetId}: alive target in range at start (no invisible enemies R2), accepted aim consumes cooldown; lost target misses, no retarget. Automatic priority via set_priority {priority:'nearest'|'strongest'|'commander'}, saved priority default nearest.
- Slow totem periodic pulse with finite slow TTL/capped percentage; refresh without stacking into immobilization.

Five heroes initially use5distinct existing circular anchors; one free for relocation. Existing9squarepads,3build buttons price/preview/confirm. Cards1–5, Rubick slot+steal/use cooldown and commander last cast, Sniper priority; ten-wave HUD/commander preview. Old R1 navigation retains local/cloud identity.

Acceptance deterministic/save3 roundtrip/cross-version rejects; three stolen handlers+invalids; zombie cap/TTL, slow floor/TTL, Sniper lost target/priority; ten-wave actual party; EAV/API R1/R2 owner/revision/idempotency without R1 mutation; keyboard/focus, spells/events/visuals, retainedR1 resume, offline checkpoints; A/B gateway fixture/manifest hashes. Chromium153/SwiftShader local scope only, not VPS/PostgreSQL multisession/hardware FPS/customer opinion.
