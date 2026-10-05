# Local wrapper verification — 2026-10-05

Scope: paired-source assembler and command-plan preparation only. Server installation, GitHub/SSH/Docker/PostgreSQL/Nginx execution: **NOT_STARTED** by these helpers.

Author check on Node24.19.0/Linux:

```sh
TD_TEST_STAGING=/workspace/scratch/a8857bd330a9/integration/back/deploy/last-throne/.workspaces/r2-001 \
  node --test integration/back/deploy/last-throne/tests/wrappers.node.mjs
```

Result: **11 PASS, 0 FAIL, 0 SKIP**. `node --check` passed for assemble.mjs, operator.mjs and lib.mjs. The preparation CLI test uses a fake Docker executable and confirms it is not invoked; stdout/stderr do not contain synthetic env secrets. Generated shell commands pass `/bin/sh -n`.

The added startup-failure test executes the generated upgrade script with fake Docker, Node, sleep, install, cp and curl executables in a private temporary directory. It reaches runtime startup, receives 90 failed control-status probes, exits nonzero with `TD control readiness timeout`, and never installs R2 in the watched parent or calls `update r2-001`/curl. Fake sleep avoids the real delay; the shell simulation took 223ms. No real Docker, SQL, network or target-host action was executed. Startup wait order is also checked between `up -d runtime` and R2 exposure/update.

Real assembly from canonical back/front and original ready-root completed, with before/after source and file inventory checks. Current canonical source and original ready-root were reverified after wrapper work:

| Identity | SHA256 / result |
| --- | --- |
| Paired TD sourceHash | `b4cb38f2477b406608f648cb72e5c1c68a4aed8fd4f3fa84a88637e70d4b9bf8` |
| r0-002 manifest | `40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6`; 2200 inventory files PASS |
| r1-002 manifest | `daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823`; 2266 inventory files PASS |
| r2-001 manifest | `dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf`; 2279 inventory files PASS |

The test fixtures exercise rejected substituted web, symlinks, unsafe/existing/concurrent output, mutated and rehashed old archives, private env/mode gates and upgrade command order. These are author checks, not independent production acceptance. No new game/API/DB functional runs were performed. Backup restoration, real roles/permissions, Docker/PG health, resource limits, TLS/Origin, public gameplay and first-game regression remain target-host checks.

Generated `.workspaces`, `.prepared`, `.test-work`, temporary directories, ready releases and private env must remain outside Git. The backend README alone was edited within canonical source; it is outside the original sourceHash inventory. Original core/server/db/ops/scripts/launcher/web and immutable archives remain unchanged.
