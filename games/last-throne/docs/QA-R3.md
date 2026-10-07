# Independent QA R3 — local acceptance PASS

Verifier: `/root/spec_verifier`, independent of the implementation authors. Completed 2026-10-07. This decision covers the exact local artifact and properties below; it is not a production deployment, hardware performance or subjective balance approval. No open product defect remains from these checks. Author confidence and author browser receipts are not the oracle for this decision.

Raw receipts are included in the ready ZIP under evidence/qa-r3. This document is the coordinator’s linked copy of the independent report.

## Exact object

| Identity | Verified value |
|---|---|
| Release | `r3-001`, 2294 files |
| Source SHA256 | `2233389d406901529b55b5cf7c9ecfef7b1c5726c12cbf0b0495bae7349bfadb` |
| Manifest SHA256 | `defab06551d52e9cc71c0a6d56c769e9030e51649756cecfba659a70c5acfc63` |
| Frontend / backend | `r3-web-603aab8bfd082c86` / `r3-api-7b084f31d98e7e6f` |
| Core / content / metadata | `r3-core-1` / `r3-content-1` / `r3-meta-1`, save4/API1 |
| Projection SHA256 | `6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5` |

[identity-r3-001.json](../evidence/qa-r3/identity-r3-001.json) independently recomputes every inventory hash, safe path, complete directory contents, current runtime source hash and retained R0/R1/R2 archive identities. It was refreshed after the final harness edits: 43 test files are hashed separately from runtime. R1/R2 core and SQL001–006 remain byte exact. The receipt also hashes contract r3/1, canonical FEATURE_HANDOFF/1 and the 169046-byte v0.5 specification. [acceptance-report.json](../evidence/qa-r3/acceptance-report.json) binds the final decision to these identities and each raw receipt.

## Results

| Scope | Actual result and evidence |
|---|---|
| All Node tests / TypeScript | **213 tests: 212 PASS, 0 FAIL, 1 environment SKIP**; strict typecheck PASS. [npm-final.log](../evidence/qa-r3/npm-final.log), [typecheck-final.log](../evidence/qa-r3/typecheck-final.log). The skipped private Unix socket bind needs the target host. |
| Independent core + API | **15 PASS**, already included in the 213 total. [core-api-final.log](../evidence/qa-r3/core-api-final.log). Published-content own strategy wins 15 waves, seed6996017, tick37890, throne79, 72 public commands; complete journal/events/results equal for chunks31/7. Synthetic effect/boundary cases are named separately. |
| Final new-flow browser | **16 completed properties PASS** in [report](../evidence/qa-r3/browser-r3-001-1791350708845/report.json). Its overall wrapper ends in the preserved wave8 observation timeout discussed below; it is not relabeled a passing full run. |
| Actual full 15-wave browser | **6 PASS**, [report](../evidence/qa-r3/party-r3-001-1791352505111/report.json), [log](../evidence/qa-r3/party-final.log), [victory image](../evidence/qa-r3/party-r3-001-1791352505111/victory.png). All 15 natural boundaries, three commanders, active spells, cloud victory and reload without Continue. |
| Lifecycle | **5 PASS**, [report](../evidence/qa-r3/lifecycle-r3-001-1791351372664/report.json). Two real tabs conflict; controlled hidden/visible pause; natural offline defeat, reload, ordered retry, terminal closure. |
| Backward compatibility | **4 PASS**, [report](../evidence/qa-r3/compat-browser-r3-001-1791350689324/report.json). Real retained R1 and R2 create checkpoints through R3 API; fresh browser storage with the same guest opens their exact archived clients from R3 cloud Continue, preserving save2/5waves and save3/10waves. API separately checks R0 save1/bootstrap. |
| Local activation | **4 PASS**, [report](../evidence/qa-r3/activation/real-activation-latest.json). Actual immutable R3 API/migrations and original gateway handler; valid inventory/ETag accepted, changed content with a matching self-ETag and corrupt client bytes rejected before output. Default catalog and Runner Forge preserved. Explicit local HTTP transport adapter, not TLS/VPS verification. |

Counts describe different and sometimes overlapping scopes; they must not be added as one test total.

The independent SQL/API cases verify ownership, immutable published values, pinned old formats, exact operation retry before revision/status/terminal checks, changed-body collision, stale revision and malformed generation rejection without mutation. A19 actually publishes and compiles a new metadata revision with an optional integer parameter without DDL, preserving the old catalog. Even a future metadata revision with relaxed behavior constraints rejects an unknown handler both at SQL publication and compilation; the failed release and all entities remain draft.

R3 new-flow UI evidence covers distinct square/round/shop canvas picks; explicit focused purchases; camp absence/reservation, combat clock, preparation and pause; single-expedition exclusion; full-slot shop reward, blocked wave start, exact save4 reload and explicit free replacement; actual hero-bound Roshan token or its one-use revival; gesture-unlocked bounded WebAudio, mute and low settings; real WebGL context loss/restoration. A checkpoint endpoint outage spans two waves: immutable pending A and latest C survive reload, then reconnect acknowledges exact A followed by C with exactly two revisions.

Lifecycle evidence additionally proves a natural defeat while checkpoint/finish requests fail. Pending A and terminal result survive reload and no Continue appears. Reconnect acknowledges A before finish; cloud result equals the local terminal result. A later new checkpoint is rejected with `RUN_FINISHED`. Controlled visibility freezes tick2, returning visible remains paused, and explicit resume advances the first observed frame only to tick4 after98.1ms. This is an injected visibility event, not a physical OS freeze.

## Full browser party trace

Run `2c86db71-3676-43a2-be1f-0df141b94a7e`, seed1873322674: **victory**, tick32008 (1066.9 simulated seconds), throne131, kills1064, gold8052, 22 builds, 45 upgrades, cloud revision37. All fifteen recorded boundaries are linked in the machine receipt. Commander kinds were observed live on waves5/10/15. The final session records 71 actual spell casts after resume; diagnostics counters reset on restore, so that is not claimed as the whole-party command total.

The party began in [earlier receipt](../evidence/qa-r3/party-r3-001-1791352319514/report.json), completed waves1–3 naturally, then the observer awaited an ability button after the phase ended. Private guest/storage state and that same database were retained. The final run used the real **Continue R3** control, verified the same runId and save4, and resumed preparation4. The recovered wave3 boundary is explicitly marked; there was no injected checkpoint, guest identity fabrication or direct browser game command. Actual keyboard selection/Q/focus/Enter replaced fragile clicks on disappearing targets. The final cloud result is victory and a real reload offers no active continuation. The victory screenshot was visually inspected and agrees with the saved result.

Browser profile: Chromium153.0.8010.0, Playwright1.62.1, headless ANGLE/SwiftShader WebGL2; desktop1280×800 and1440×900, DPR1. UI commands use native controls, canvas picks or keyboard. Continuous virtual RAF/performance time runs up to8x during waits and1x for casting controls. Neither accelerated wall time nor software rendering proves physical-GPU FPS. The server runs current source independently matched byte-for-byte to the immutable package; raw new-flow report wording “preview server” is generic harness wording, not a claim that preview bytes were promoted.

## Preserved failures and disposition

- Initial archive copy excluded nested node_modules. The parent restored exact files from the untouched R2 distribution. All three complete archive inventories then passed independently. [Original failure](../evidence/qa-r3/identity-baseline-initial-failure.json), [resolution](../evidence/qa-r3/identity-baseline.json), final identity above.
- Preview Roshan observation wrongly required an unspent Aegis after the hero had actually revived and subsequently died again. Durable return/revive events explain the original FAIL. Final identity new-flow evidence verifies the corrected bound-token oracle; no preview PASS is promoted to R3.
- Final first canvas assertion was case-sensitive while displayed text used uppercase; the real pick was correct. Final same-identity spatial check passes with the corrected text oracle.
- First lifecycle observer read the winning revision before its asynchronous preparation checkpoint finished. Waiting for acknowledged generation closes this harness race; final lifecycle receipt passes.
- New-flow wrapper timed out observing wave8 at tick15651. [Differential replay](../evidence/qa-r3/timeout-differential-replay.json) restores the actual checkpoint through the public core, reproduces exactly the last ranged enemy/Pudge HP, then completes passively273ticks later or with a public Sniper cast24ticks later. This distinguishes a too-short observer bound and passive strategy from a softlock. Original FAIL and the 16 completed properties remain intact.
- Two full-party wrappers awaited volatile UI controls after a target/phase disappeared: [target-expiry receipt](../evidence/qa-r3/party-r3-001-1791351899860/report.json), [ability-expiry receipt](../evidence/qa-r3/party-r3-001-1791352319514/report.json). The latter is the same naturally continued winning party above. Keyboard actions with bounded stale-target cancellation close the observer issue; gameplay source did not change.

## Boundaries and evidence handling

Not verified here: target VPS or first-game coexistence under load; Docker/Nginx/TLS and production Unix socket; production PostgreSQL concurrent sessions, backup/restore and resource limits; physical hardware FPS, phones and other browsers; OS freeze; human A02/A21 readability and subjective difficulty/balance. Serialized PGlite proves the exercised SQL/API behavior, not production concurrency. The full Node suite exercises local archived-R2 supervisor transition/recovery cases, but does not discharge those target-host gates. Remote CI and Git publication remain the parent agent's separate evidence.

No implementation, remote system or catalog was modified by this verifier. Public evidence contains no cookies/auth tokens/storageState. Private `.preview/qa-party-storage.json` and recovery metadata are mode0600 and excluded from delivery. After the party passed, the harness recovery writes were hardened to explicit mode0600 for new and existing files; syntax check passed and the final test inventory was refreshed. This test-only storage correction did not change gameplay or require repeating the party. Raw failed reports remain available with their classifications. Local acceptance is complete; no additional local tests are required by an unresolved finding.
