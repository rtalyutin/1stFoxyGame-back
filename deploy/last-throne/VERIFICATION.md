# R3 wrapper verification — 07.10.2026

Node24.19.0/Linux. Scope: exact paired assembly and executable command guards; target VPS NOT_STARTED.

Actual assembly preserves sourceHash2233389d406901529b55b5cf7c9ecfef7b1c5726c12cbf0b0495bae7349bfadb and all four ready manifests. r3-001 SHAdefab06551d52e9cc71c0a6d56c769e9030e51649756cecfba659a70c5acfc63;2294files. R0/R1/R2 retained2200/2266/2279files with unchanged exact manifests.

`TD_TEST_STAGING=<assembled r3-001> node --test deploy/last-throne/tests/wrappers.node.mjs`:13PASS,0FAIL,0SKIP. Real-stage case prepares first-install commands without invoking Docker or revealing synthetic env values. Generated shell passes `/bin/sh -n`. Negative migration fixture executes fake migration exit23 and proves no install/update and R2 remains selected. R2 upgrade plan contains no image build, compose up/restart or Nginx restart; migration/grants occur before exposing immutable R3. Startup timeout protects the older R0/R1 maintenance path.

Initial root real-stage run began before atomic assembly finished and got SETUP_FAIL ENOENT; original log retained in ready evidence. Correct ordered repeat passed.

These wrapper tests simulate external executables; they do not establish real Docker/PostgreSQL/Nginx/TLS, backup recovery, public availability or first-game before/after. Delivery core tests separately execute the actual archived R2 supervisor locally. Dedicated GitHub CI run37576984668 separately executed PostgreSQL17.11 with11/11storage PASS and43/43core/HTTP/embedded PASS. It uses a separate ephemeral TD database and independent sessions; it is not a VPS capacity/backup check. CI wrappers12PASS/1SKIP because readyarchives are intentionally outside Git; the local real-stage result above covers that case. Generated .workspaces/.prepared/private env/releases/dependencies stay outside Git.
