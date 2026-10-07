# R3 delivery: stable runtime, pinned clients

This runbook prepares a local artifact and an operator sequence. It does not report a VPS installation. Inspect the existing first game, routes, PostgreSQL ownership, backups, free disk and measured CPU/RAM before choosing private env values. Keep the first game's containers, API, configuration and data outside every TD operation. Node 24 and PostgreSQL 17 are the supported runtime; use the exact approved image digests and existing TD Compose project name.

## Compatibility and build

R3 pins `r3-core-1 / r3-content-1 / r3-meta-1 / save4 / API1`. The new API retains published R0/R1/R2 clients and their save formats. The exact ready `r0-002`, `r1-002`, `r2-001` archives and migrations 001–006 are preserved. SQL007–008 add R3 without a destructive contract step. R3 rollback is `frontend_only`: an old launcher can be selected, while the R3 API, save4 records and support for open R3 tabs remain active. Returning to the R2 API after R3 writes is not a supported rollback.

The **archived R2 supervisor** already accepts exact release IDs and save/metadata declarations. R3 manifests therefore declare their own exact ID, every verified retained R3 ID, and optional explicitly predeclared future IDs, alongside the existing R0/R1/R2 rules. They contain no `r3-*` family wildcard. The R3 API additionally checks the complete R3 core/content/metadata/save/API tuple and the actual published EAV projection. SHA256 file/source inventories gate integrity; they are not signatures or proof of a trusted source.

```sh
npm ci
npm run typecheck
npm test
BUILD_RELEASES_DIR=releases npm run build -- r3-001
npm run dev
```

Node 24 is required. Default build ID is `r3-001`, default output `dist/releases`; development uses a new `r3-dev-<timestamp>`, loopback HTTP and persistent PGlite in `.local/database`. PGlite holds its single session through a whole write transaction. Production uses PostgreSQL and Secure cookies. A changed source requires an unused release ID; existing artifacts are never overwritten. `DEV_RELEASES_DIR`, `DEV_DATABASE_DIR`, `DEV_PORT` and `RELEASE_ID` can select a local profile. Compiled clients use immutable `/td/releases/ID/web/` URLs.

To reserve a future content-only launch before building the active API:

```sh
COMPATIBLE_R3_CLIENT_RELEASES=r3-content-002 BUILD_RELEASES_DIR=releases npm run build -- r3-001
```

The declaration is an exact ID, not a regex or unlimited family. An unreserved future R3 ID needs an ordinary A/B API release which declares it before a subsequent `content` promotion. Do not edit the active manifest to add an ID.

## First TD installation

Choose actual resource limits, unused loopback port, private database credentials, exact HTTPS `TD_PUBLIC_ORIGIN` and independent volumes from the server survey. Store env mode0600 and state owned by runtime uid10001 mode0700. The runtime directory contains `ops/` and `launcher/`; DB grants belong to the separately verified staging artifact. Do not print rendered Compose/env secrets into evidence.

```sh
sudo install -d -m 0755 /opt/last-throne/releases
sudo install -d -o 10001 -g 10001 -m 0700 /opt/last-throne/state
cd /opt/last-throne/runtime
install -m 0600 ops/env.example ops/.env
node ops/install-release.mjs /absolute/staging/releases/r0-002 /opt/last-throne/releases
node ops/install-release.mjs /absolute/staging/releases/r1-002 /opt/last-throne/releases
node ops/install-release.mjs /absolute/staging/releases/r2-001 /opt/last-throne/releases
node ops/install-release.mjs /absolute/staging/releases/r3-001 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml config --quiet
docker compose --env-file ops/.env -f ops/compose.yml build runtime
docker compose --env-file ops/.env -f ops/compose.yml up -d postgres
```

Wait for the dedicated PostgreSQL container to report **healthy** before the `--no-deps` maintenance command. Investigate a failed healthcheck instead of proceeding. Run migrations as the dedicated TD owner, then create/verify a separate non-superuser API login role with its password entered privately. The role must have no first-game ownership or migration/publication privileges.

```sh
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps runtime node ops/migrate-release.mjs r3-001
docker compose --env-file ops/.env -f ops/compose.yml exec postgres psql -U last_throne_migrator -d last_throne -v ON_ERROR_STOP=1
```

For a new database, in that interactive session:

```sql
CREATE ROLE last_throne_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
\password last_throne_api
```

Apply the exact R3 read/operation allowlist after migrations and before exposing HTTP. Use an absolute grants path; the runtime directory has no `db/` directory.

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T postgres psql -U last_throne_migrator -d last_throne -v ON_ERROR_STOP=1 -v api_role=last_throne_api < /absolute/staging/db/r3-runtime-grants.sql
docker compose --env-file ops/.env -f ops/compose.yml up -d runtime
timeout 5s docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs status
```

Repeat the bounded status probe until supervisor startup has completed, with a bounded overall deadline. Do not continue after timeout/recovery failure. Then select and read back:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs update r3-001
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs status
curl --fail --connect-timeout 3 --max-time 10 http://127.0.0.1:CHOSEN_PORT/td/api/v1/version
```

Only after readiness/version/bootstrap and bounded real save tests succeed, add the TD location from `nginx-td.conf.example` to the existing HTTPS server block. Back up the full config, run `nginx -t`, and perform the one initial graceful reload. The launcher address is that server's existing origin plus `/td/`. Add its hub card only after its actual API readiness and release/content identity gate succeeds.

## Ordinary R2 → R3 A/B update

If the stable R2 runtime is already installed, keep its image, container, gateway and PostgreSQL running. Do not issue Compose build/up/stop/down or a host Nginx reload for this update. Record container ID/StartedAt, gateway/API PIDs, selection, migration state, first-game baseline and recoverable DB/state backups.

Verify the candidate **outside** the mounted release parent. Perform expand migrations through a separate temporary maintenance container, after confirming the existing PostgreSQL is healthy; the serving runtime stays alive. Apply bounded R3 grants as the dedicated owner:

```sh
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps -e RELEASES_DIR=/candidate-releases -v /absolute/staging/releases:/candidate-releases:ro runtime node ops/migrate-release.mjs r3-001
docker compose --env-file ops/.env -f ops/compose.yml exec -T postgres psql -U last_throne_migrator -d last_throne -v ON_ERROR_STOP=1 -v api_role=last_throne_api < /absolute/staging/db/r3-runtime-grants.sql
node ops/install-release.mjs /absolute/staging/releases/r3-001 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs update r3-001
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs status
```

The command holds a private lock, verifies immutable inventory/compatibility, starts B, probes readiness and published bootstrap, durably journals selection, reads back the gateway route, promotes `current.json`, and drains requests already assigned A. Only API PID changes; immutable clients and published balance pins stay available. The child receives the application URL, not the migration owner's URL. The local CLI uses a mode0600 Unix socket; no public deployment endpoint exists.

**Precommit cold-restart boundary:** before selection commits to R3, an archived R2 API cannot accept a visible R3 client. Keep the candidate outside the mounted parent until the final install/update sequence. If that sequence fails before commit and the runtime cold-restarts, read back durable selection, journal, current pointer and live status. Park only the verified, unselected R3 candidate outside the mounted parent **after all available evidence confirms the previous R2 selection and no R3 client exposure/commit**; then recover R2. An unknown or conflicting result requires investigation, not a blind rename. Do not delete retained or previously exposed clients, edit `current.json`, or erase journal/state. After a durable R3 commit, recovery keeps the R3 API and all declared clients. Automatic precommit cold recovery with an incompatible newly visible client is not claimed.

Runtime older than R2 is outside this unchanged-image path. Verify its actual installed verifier first; historical R1 does not recognize R2 family declarations. This local task neither inspects nor upgrades a server runtime.

## R3 balance publication and live content

`publish-r3-content.mjs` is owner-only and clones the published scalar R3 content catalog into a new immutable version. It accepts 1–64 known scalar updates, compiles the complete projection (including item/expedition/spell guards), publishes, and verifies the actual typed SQL projection hash before commit. It does not modify saved-state reference entities or old content. A private example patch:

```json
{"updates":[{"type":"game_config","code":"r3","parameter":"initial_gold","value":700}]}
```

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node /releases/r3-001/ops/publish-r3-content.mjs r3-content-2 /state/balance-r3.json
```

Build from the same backend/core/schema/lockfile source, retaining every old client ID. The active API must already declare `r3-content-002`:

```sh
CONTENT_VERSION=r3-content-2 BUILD_RELEASES_DIR=releases npm run build -- r3-content-002
node ops/install-release.mjs /absolute/new-package/releases/r3-content-002 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs content r3-content-002
```

The content command checks unchanged backend/core/API/save format, exact declared client ID and published bootstrap. It does not migrate or restart the API. Old parties keep `r3-content-1`; new launches get `r3-content-2`. Unknown IDs/content, new backend identity or invalid projection fail before pointer promotion.

## Rollback, recovery and evidence

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs rollback r2-001
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs status
docker compose --env-file ops/.env -f ops/compose.yml exec -T runtime node ops/cli.mjs recover
```

`rollback` changes the launch client to exact R2 and leaves R3 API/save4 and open R3 clients supported. DB backup restoration is never automatic. `selection.json` is the durable choice; journal phase alone or a matching API ID cannot commit a content/front-only selection without matching operationId. After `recovery_required`, complete recovery before another delivery. Pending retirement reserves A's slot until existing requests finish.

Local delivery tests execute the actual archived R2 supervisor and Node A/B fixture children, immutable archive hashes, pinned bootstrap, content PID stability and front-only save4 fixture retention. Fixtures do not prove game semantics or PostgreSQL concurrent transaction behavior. SQL/API suites cover those separately. Target-server DEP01–07 still require private CLI, real PostgreSQL sessions, measured load, interrupted delivery/cold recovery, backup restoration, TLS/Nginx, unchanged container identity and the first game's baseline/after behavior and resources. Record actual results and limitations; no VPS deployment or general DEP PASS is implied by a local test run.
