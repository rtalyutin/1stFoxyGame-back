# Independent camera QA — PASS within local scope

Verifier: `/root/spec_verifier`. Final run: 2026-10-07 06:56:33–06:57:35 UTC. **10 checks PASS, zero page errors.** [Raw report](2026-10-07T06-56-33.416Z/report.json), [identity/evidence receipt](acceptance.json), [reusable harness](run.mjs).

| Object | Exact identity |
|---|---|
| Selected client | `r3-content-002`, frontend `r3-web-28b2f81030b0bd69` |
| Client source SHA256 | `0dfe1bcaef0f7d94e05d5f50495bcfb0f84227b8f93b113b38cf5bdf0c732c83` |
| Client manifest SHA256 | `7d65186b3f8522585dc4ef17aa91c84a46994e63f57f656720a970916b50852a` |
| Actual API | archived `r3-001`, backend `r3-api-7b084f31d98e7e6f` |
| API manifest SHA256 | `defab06551d52e9cc71c0a6d56c769e9030e51649756cecfba659a70c5acfc63` |
| Renderer SHA256 | `380708302beb5922d287d259459945d014ee4dcbb8e58455724305431d9f2c72` |

Independent verification hashed both complete inventories and compared all original runtime source paths: **only `web/src/renderer.ts` changed**. Core/content/API/DB/save code and versions remain unchanged. The source hash was rechecked after execution. The test imports the actual API001 app, migrations and gateway module from its immutable archive; current.json selects client002. Both initial and post-reload bootstrap confirm that split. This probe does not claim process supervision or API PID continuity; delivery has separate evidence.

## Observed camera and input

Normal HUD screenshots were captured for the old and new clients and the final new images were independently viewed:

- [After 2048×1025](2026-10-07T06-56-33.416Z/after-2048x1025.png) · [before](2026-10-07T06-56-33.416Z/before-2048x1025.png)
- [After 1440×900](2026-10-07T06-56-33.416Z/after-1440x900.png) · [before](2026-10-07T06-56-33.416Z/before-1440x900.png)

Camera pitch is 34.98° versus the old 50.69°. Heroes are visibly larger, the view lower and the field occupies more width. All three lanes, five heroes, nine squares and six actual round positions remain present. The Ancient is wholly inside the canvas; its tested projected bounding volume leaves 121.6 CSS px right margin at 2048×1025 and 34.0 CSS px at 1440×900. Scenery/ground borders may crop at the narrower canvas. A foreground tree overlaps part of the lower circle, but the circle remains visible and actual selection works. This is observation of the camera change, not user aesthetic approval or a promise that generated mockup art was implemented.

At **both sizes**, all 15 projected candidates were exercised with native canvas clicks. Each square must open its exact lane/ordinal foundation panel; each round position must open its exact position or its actual occupant. Candidates alone are not the oracle. Gold stays unchanged during selection. Resize 2048→1440→2048 and low quality completed; low smoke clicks retain context panels, and the subsequent construction/placement/aiming transactions below run on low quality.

## Actual gameplay interactions

- Clicking the free round position relocates Pudge to `anchor-n1` after explicit confirmation; gold unchanged.
- [Construction preview](2026-10-07T06-56-33.416Z/construction-preview.png), cancel and confirm preserve their semantics: preview/cancel spend nothing, confirmed `pad-n1` ballista charges 100 once. Two additional ordinary defensive buildings support a short natural wave.
- Ground-targeted Undying cast accepts exactly **(-420,580)** through the canvas at tick 5. The candidate uses the actual ground surface; core `cast_started` confirms the same coordinates.
- Canvas aimed Sniper cast at tick 252 selects exactly `enemy-1-w1-l1-001`; durable core event confirms that targetId. No direct game command or game-state injection is used.
- Wave 1 completes naturally. Actual checkpoint **save4**, revision 4, tick 828 is read from old API001. A real reload/Continue restores run `04544334-8176-40d6-ac86-7292cc61ac1d` with the same tick and client002/core1/content1/meta1 pins.

## Preserved observer failures

[First raw FAIL](2026-10-07T06-51-20.119Z/report.json): the correct occupied lower-circle panel appeared, while the observer required the hero heading. The revised oracle verifies the correct location or correct occupant.

[Second raw FAIL](2026-10-07T06-53-27.249Z/report.json): the harness selected published waypoint (-420,-580) for Shaman (300,-340), distance 759 with range 600. This invalid test precondition caused the cast wait to expire. The corrected scenario explicitly checks range and uses Undying's lower point 160 units away; final accepted core event verifies the camera pick. Raw reports remain unmodified; no product fix was made or requested by this verifier.

Environment: Chromium 153.0.8010.0, headless ANGLE/SwiftShader WebGL2, native unaccelerated clock, fresh serialized PGlite, normal HUD and safe browser flags. No VPS, physical hardware FPS, production database concurrency or user aesthetic acceptance is claimed. The previous full 15-wave proof remains tied to r3-001; this camera-only acceptance does not relabel it as a new full-party run. No unresolved product defect was found in this scoped check.
