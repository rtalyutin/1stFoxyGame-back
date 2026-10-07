# Подготовка paired-source и установки Last Throne R3

Canonical core/server/db/ops/scripts/launcher находятся только в backend `games/last-throne/`; canonical `web/` — в frontend `games/last-throne/web/`. Ready архивы с production dependencies берутся из готовой поставки, в Git их нет. Камера поставляется новым клиентом r3-content-002; exact r3-001 сохраняется. Generated workspace нельзя редактировать или коммитить.

Нужен Node24. Из backend checkout:

```sh
node deploy/last-throne/assemble.mjs \
  --front-web /absolute/front/games/last-throne/web \
  --ready-root /absolute/unpacked/verified-camera-package \
  --output deploy/last-throne/.workspaces/r3-content-002
```

Helper проверяет закреплённый SOURCE_HASH и exact SHA256 всех пяти манифестов из lib.mjs, затем каждый файл до/после копирования. Новый output должен быть вне input и без symlinks. После изменений исходников прежний hash gate сознательно откажет: следующему релизу нужен новый ID/hash и собственная QA. Хаб вне TD web не входит в hash пары.

Для готовой игры:

```sh
cd deploy/last-throne/.workspaces/r3-content-002
npm ci
RELEASE_ID=r3-content-002 DEV_RELEASES_DIR=releases npm run dev
```

Адрес локального стенда http://127.0.0.1:4173/td/; production — отдельная PostgreSQL17. Это не публичная ссылка на VPS.

## Подготовка сервера

До запуска нужны фактический baseline первой игры/TD, HTTPS/маршруты, Docker/Compose/mounts, свободные порты, CPU/RAM/диск с запасом A+B+PG и проверенный backup/recovery. Helpers не измеряют эти свойства и не вызывают SSH/Docker/SQL/Nginx сами. Секреты задаются вне Git в private env0600 по ops/env.example: точные Node24/PG17 digests, limits, отдельные owner/application URLs, origin. Не использовать базу/volume PostgreSQL18 первой игры для TD PostgreSQL17.

```sh
node deploy/last-throne/operator.mjs \
  --staging /absolute/assembled-R3 \
  --env-file /absolute/private/td.env \
  --output deploy/last-throne/.prepared/r3-camera \
  --runtime-dir /opt/last-throne/runtime \
  --mode upgrade-r2 \
  --ack-backup-baseline --reviewed-env
```

Выбрать режим по реальному состоянию, без автоматического угадывания:

- `first-install`: нет TD selection; установить exact R0/R1/R2/R3 и новый TD runtime, выбрать API r3-001, затем клиент камеры через content.
- `upgrade-r0-r1`: отдельное обслуживание старого технического runtime; остановить только TD, мигрировать кандидат вне watched parent, восстановить прежний выбор, затем установить R3 и switch; камера выбирается после успеха API001.
- `upgrade-r2`: существующий runtime/Compose/env/Nginx сохраняются. Проверить R2 selection/status и PG, применить аддитивную миграцию через read-only candidate mount, проверить роль/grants, установить immutable R3, вызвать приватный A/B update. Нет compose build/up/stop/restart и сброса пароля API. Затем установить клиент камеры и вызвать content, сохранив R3 API001.
- `camera-r3`: уже выбран exact API r3-001. Проверить durable/live выбор и backend, установить только r3-content-002, вызвать content и проверить status/current/bootstrap. Миграции, grants, image/runtime/API restart не выполняются.

Результат — только подготовленные runtime payload, roles.sql, commands.sh и plan.json. Env в output не копируется. Acknowledgements означают заявление оператора, не успешный backup-test. После проверки конкретных команд выполнить их в серверной сессии с нужными правами. psql ON_ERROR_STOP=1; SQL grants читаются из exact staging releases/r3-001/db/r3-runtime-grants.sql. При UNKNOWN сначала читать journal/selection/current/live status, не повторять switch.

У runtime R2 есть граница холодного восстановления до commit: видимый R3 при прежнем R2 selection несовместим. Кандидат держится вне watched parent до migration/grants; подробная подтверждаемая процедура парковки только непродвинутого кандидата и recover — ops/RUNBOOK-R3.md. После commit R3 API поддерживает старые/новые клиенты. Frontend-only rollback оставляет R3 API/save4; pair rollback к R2 не безопасен.

При первой установке добавляется только `/td/` в существующий HTTPS Nginx с nginx -t и первоначальным graceful reload. Обычный R2→R3 update Nginx не меняет. После публичной игры/save/reload/finish, старых runs и первой игры до/после можно включить hub отдельным activate-last-throne gate; основной games.json пока soon. API r3-001 уже объявляет точный ID r3-content-002. Эта поставка меняет только камеру: contentVersion остаётся r3-content-1, core/save/API/backend — прежними. Старые вкладки/сохранения открывают свой прежний immutable клиент. Хаб проверяет раздельно новый client002 и exact API001; старый preset R3 сохраняется для прежних callers.

Для уже работающего R3 используется `--mode camera-r3`. Отказ перед content не выбирает новый клиент. Если content завершился ошибкой или статус неизвестен, читать journal/selection/current/live status; повторно не запускать установочные режимы и не менять файлы указателей. CLI recover завершает подтверждённую операцию; обычный rollback r3-001 возвращает запуск к прежней камере с тем же API.

## Проверки

```sh
TD_TEST_STAGING="$PWD/deploy/last-throne/.workspaces/r3-content-002" \
  node --test deploy/last-throne/tests/wrappers.node.mjs
```

Без TD_TEST_STAGING real-stage case имеет SKIP. Для дополнительной проверки actual API001 в отдельном Node child с локальной PGlite задать TD_TEST_DEPENDENCIES=/absolute/locked-TD/node_modules; без обоих параметров этот case имеет SKIP. Он не заменяет production PostgreSQL/Docker проверку. Проверки покрывают substitution/hash/symlink/overwrite/concurrency, private env, failure до install/switch, отсутствие секретов и сохранность runtime R2. Actual assembly/ready package и game tests отражены в VERIFICATION.md. `.workspaces/.prepared/.test-work`, env, ZIP, node_modules и готовые releases не коммитятся. Серверная установка остаётся NOT_STARTED до реального выполнения/readback.
