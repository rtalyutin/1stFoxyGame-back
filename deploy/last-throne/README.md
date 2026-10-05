# Подготовка paired-source и установки Last Throne R2

Здесь только локальные helpers. Они не вызывают GitHub, SSH, Docker, SQL или Nginx. Исходная игра и готовые архивы не переписываются. Оператор выпускает проверяемый набор команд; серверная установка остаётся **NOT_STARTED**, пока исполнитель не выполнит его на согласованном VPS.

## Один canonical core, два репозитория

- Backend: `games/last-throne/` хранит единственный canonical `core/`, `server/`, `db/`, original `ops/`, `scripts/`, `launcher/`, тесты, документацию, package/lock/tsconfig.
- Frontend: `games/last-throne/web/` хранит canonical web. Его импорты `../../core/` работают после сборки общего workspace.
- Готовые `releases/r0-002`, `r1-002`, `r2-001` с production dependencies поступают из распакованного оригинального ZIP через `--ready-root`; в Git их нет.
- Generated workspace — производная копия для запуска/сборки. Его не редактируют и не коммитят; правки делают только в canonical back/front. В frontend второй core не создаётся.

Нужен Node **24**; отдельного npm install для helpers нет. Из backend checkout:

```sh
node deploy/last-throne/assemble.mjs \
  --front-web /absolute/path/to/front/games/last-throne/web \
  --ready-root /absolute/path/to/unpacked/Last-Throne-R2 \
  --output deploy/last-throne/.workspaces/r2-001
```

По умолчанию backend source определяется относительно helper; при другом размещении есть `--back-source`. Output должен быть новым, не пересекаться с input и не проходить через symlink. Сборщик проверяет sourceHash `b4cb38f2477b406608f648cb72e5c1c68a4aed8fd4f3fa84a88637e70d4b9bf8`, exact manifest SHA256 трёх архивов и весь file inventory через original artifact verifier до/после копирования. Он не устанавливает dependencies и не пересобирает ready releases. `ASSEMBLY.json` подтверждает только локальную сборку workspace, не deploy.

Для разработки точного R2 из generated workspace:

```sh
cd deploy/last-throne/.workspaces/r2-001
npm ci
RELEASE_ID=r2-001 DEV_RELEASES_DIR=releases npm run dev
```

Dev использует persistent PGlite и loopback `/td/`; production — PostgreSQL. Если npm cache неполон, `npm ci --offline` не сработает: нужны доступ к registry или заранее подготовленный cache. Ready production archives при этом остаются пригодными для установки без dev dependencies.

Этот assembler закреплён на принятом R2. После изменения canonical TD source он сознательно откажет по sourceHash. Для следующей TD поставки требуется новая зафиксированная source revision/hash, обновлённый assembly gate, **новый** releaseId, сборка и адресная QA именно новой версии. Старые ready архивы и SQL001–004 не меняются. Доработка общего зала за пределами TD web/core не меняет TD sourceHash.

## Подготовка установки после получения SSH-доступа

На целевом сервере сначала сверить HTTPS/маршруты и работающую первую игру, Docker/Compose, свободные порты, CPU/RAM/диск и запас для A+B+PostgreSQL. Зафиксировать baseline, сделать DB/state/config backups и подтвердить доступную процедуру восстановления. Helpers это не проверяли и не выбирают значения за оператора.

Исполнитель передаёт проверенный staging на VPS и задаёт private env по оригинальному `ops/env.example`: реальные Node24/PostgreSQL17 image digests, свободный loopback-порт, измеренные limits, отдельные owner/application URLs и точный HTTPS `TD_PUBLIC_ORIGIN`. Для принятого Compose URLs используют сервис `postgres:5432`, БД `last_throne`; owner — `last_throne_migrator`, API — отдельная не-владеющая login-роль. Секреты не помещаются в Git, stdout или CLI arguments. Env — regular file с правами `0600` или строже; `$`/backslash в literal secret нужно заключать в одинарные dotenv quotes, а пароль в URL — percent-encode.

Из backend checkout на VPS, с фактическими абсолютными путями:

```sh
node deploy/last-throne/operator.mjs \
  --staging /absolute/path/to/verified/assembled-R2 \
  --env-file /absolute/path/to/private/td.env \
  --output deploy/last-throne/.prepared/first-install \
  --runtime-dir /opt/last-throne/runtime \
  --mode first-install \
  --ack-backup-baseline --reviewed-env
```

Оба acknowledgement означают подтверждение исполнителя, а не автоматическую приёмку backup/env. Для уже установленного R0/R1 явно выбрать `--mode upgrade-r0-r1` и новый output. Режим автоматически не определяется. Если TD уже работает на R2, этот one-time upgrade helper не применяется: обычные `ops/cli.mjs update/content/rollback/recover` остаются в original runbook.

Результат: `runtime/` payload, `roles.sql`, private `commands.sh`, `plan.json`. Env не копируется в output. Проверить команды и пути до исполнения. Первый режим требует свежего TD state и устанавливает exact R0/R1/R2. Upgrade останавливает только TD, мигрирует R2 через staging read-only mount, выдаёт retained R1+R2 grants, запускает новый supervisor с прежним R0/R1 selection, **затем** устанавливает R2 в watched parent и вызывает update. В данном окне container/gateway меняются; это не обычный A/B switch.

В интерактивной SSH-сессии с нужными правами Docker/каталогов, после проверки:

```sh
sh deploy/last-throne/.prepared/first-install/commands.sh
```

Commands ждут PostgreSQL readiness и owner `SELECT 1` до `--no-deps` migration, затем bounded readiness приватного control socket до update; на host нужен `timeout`. psql использует `ON_ERROR_STOP=1`. API-роль создаётся/проверяется как не-владеющая без inherited memberships, пароль задаётся интерактивно и должен совпасть с private URL. Grants берутся по абсолютному пути **из immutable staging `releases/r2-001/db/r2-runtime-grants.sql`**, поскольку runtime содержит лишь ops/launcher. Проверяются CLI status и loopback ready/bootstrap. Helpers не меняют первую игру или Nginx и не выполняют команды сами.

После loopback проверки исполнитель вручную добавляет только `/td/` в существующий HTTPS server block, делает `nginx -t` и первоначальный graceful reload. Затем независимая публичная QA: конкретные release/pins, игра/сохранение/reload/finish, retained R1 при наличии данных, первая игра до/после. Карточку зала включать только после подтверждённого публичного прямого запуска. `frontend_only` возвращает launcher к R1, сохраняя R2 API/save3; DB backup автоматически не возвращается. Обычные дальнейшие A/B updates сохраняют runtime container/gateway, content-only сохраняет также API PID.

## Проверки helpers

Из backend checkout:

```sh
TD_TEST_STAGING="$PWD/deploy/last-throne/.workspaces/r2-001" \
  node --test deploy/last-throne/tests/wrappers.node.mjs
```

Без `TD_TEST_STAGING` только тест CLI на real ready package отмечается skip; остальные тесты самостоятельны. Проверяются подмена web/старого архива, symlinks и output overwrite/concurrency, private env, mode/gates, порядок команд и отсутствие Docker calls/секретов. Имена `*.node.mjs` не попадают в типичную Vitest discovery. Original battle/API tests не меняются и не объявляются заново выполненными.

`.workspaces/`, `.prepared/`, `.test-work/`, temporary stages, env и node_modules исключены локальным `.gitignore`. Не добавлять ZIP, assembled source, ready releases или private env в Git, даже с force. SHA gates подтверждают целостность выбранной поставки, не являются подписью/HMAC и не доказывают доверенное происхождение либо production readiness.
