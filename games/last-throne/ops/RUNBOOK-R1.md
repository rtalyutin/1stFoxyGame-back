# R1: первая оборона и сохранения

R1 выпускается на том же VPS, где находится первая игра, по `/td/`. Настоящая установка на VPS этим пакетом не выполнялась. Первая игра сохраняет свои каталоги, контейнеры, API и маршруты. Общую конфигурацию Nginx один раз расширяют TD-маршрутом; обычные последующие TD обновления используют внутренний A/B gateway и не перезапускают runtime-контейнер или общий Nginx.

## Что входит в пакет

Сборщик `scripts/build.mjs` создаёт новый неизменяемый `r1-*` каталог, включает `core/`, клиент, API, контролируемые SQL-миграции, операционные команды и отдельные production-зависимости. Exact архив `releases/r0-002` копируется в комплект готовых релизов без повторной сборки и правок. Его `manifest.json` и весь inventory проверяются до и после копирования. Не изменять существующие releaseId; выпускать новый ID.

R1 manifest закрепляет `r1-core-1`, `r1-content-1`, `r1-meta-1`, snapshot/saveFormat `2` и API `1`. API принимает прежние R0 технические клиенты и R1 партии. `compatibleClientReleases:['*','r1-*']` — два фиксированных правила, не произвольные regex: `*` допускает только прежние R0 core/content/meta; `r1-*` допускает ID с `r1-`, строго `r1-core-1`, `r1-meta-1`, saveFormat2/API1 и contentVersion с `r1-content-`. Остальные массивы совместимости и опубликованный DB-контент всё равно проверяются. Неизвестные core, metadata, save/API или R2 не принимаются этим правилом.

Режим восстановления R1 — `frontend_only`: возврат launcher к R0 сохраняет новый R1 API и новые записи. R0 API не умеет читать R1 данные, поэтому `pair` не объявляется безопасным. Открытые R1 вкладки продолжают обращаться к совместимому R1 API после отката launcher; автоматического восстановления DB backup нет.

**Граница runtime:** R0 был подготовлен локально и на VPS не устанавливался. Для первой TD установки используется runtime-каркас из этого R1 пакета. Сохранённый прежний R0 runtime-verifier не распознаёт `r1-*`; нельзя заявлять, что такой уже запущенный образ принимает новый pattern без обслуживания. Локальная A/B проверка запускает постоянный R1 supervisor с R0 и R1 артефактами: внутри этого runtime обычный switch сохраняет gateway PID. Реальные container ID/StartedAt и первая игра проверяются на VPS отдельно.

## Сборка и разработка

На машине сборки:

```sh
npm ci
npm run typecheck
npm test
BUILD_RELEASES_DIR=releases npm run build -- r1-003
```

Готовые каталоги: `releases/r0-002` и `releases/r1-003` для новой сборки; готовая поставка содержит `releases/r1-002`. Vite использует относительный base; весь клиент загружается из закреплённого `/td/releases/RELEASE_ID/web/`, а не из изменяемого current. Backend identity хеширует сервер/БД/ядро и lockfile, frontend identity — фактические собранные web-файлы. Небоевая правка документации/операторского helper не меняет API identity. `sourceHash` и file inventory фиксируют полный пакет.

`npm run dev` создаёт новый ID `r1-dev-<timestamp>`, сохраняет прошлые client artifacts и использует persistent PGlite в `.local/database`. Это local development, не production PostgreSQL. Единственная сессия PGlite удерживается на всю транзакцию; одновременные HTTP запросы не разделяют незавершённый transaction. HTTP dev слушает только loopback и явно использует `secureCookies:false`; production cookies остаются Secure/HttpOnly/Path=/td. Для воспроизведения точного уже созданного dev-релиза можно задать `RELEASE_ID`. После изменений исходников выбирается новый ID.

## Первая установка и promotion

Выполнить обследование ресурсов/портов/TLS и создание отдельных каталогов по [RUNBOOK.md](RUNBOOK.md). PostgreSQL 17 располагается на том же VPS с отдельным постоянным volume. Заполнить `ops/.env`: точные Node24/PostgreSQL17 image digests, измеренные RAM/CPU/DB pool limits, уникальные секреты API и владельца миграций, свободный loopback-порт; `TD_PUBLIC_ORIGIN` рекомендуется указать точным HTTPS origin. Не записывать секреты в исходники/manifest или публичную командную строку.

Контролируемые миграции включают R0 и R1: domain metadata, guest/run/checkpoint/idempotency foundation и опубликованный R1 EAV-каталог. Выполняются отдельным владельцем **до** readiness API. HTTP API не выполняет DDL и не получает `DATABASE_MIGRATION_URL` в дочернем окружении. Права R1 API задаются согласно точному разделу roles в `db/README.md`; прежнего R0 SELECT-only набора недостаточно для R1. Не выдавать API роль владельца, права публикации metadata/content или blanket-доступ к схемам других игр.

После создания отдельной API роли выполнить владельцем точные GRANT из проверенного R1 пакета:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T postgres psql -U last_throne_migrator -d last_throne -v api_role=last_throne_api < db/r1-runtime-grants.sql
```

Файл разрешает только функции guest/profile/run/checkpoint/finish и чтение опубликованного content/metadata; не выдавать INSERT/UPDATE/DELETE на EAV/auth/metadata таблицы или generic helper EXECUTE. Если PostgreSQL уже администрируется другим способом, выполнить тот же файл через существующий private owner-channel, сохраняя секреты вне командной строки.

```sh
node ops/install-release.mjs /path/to/releases/r0-002 /opt/last-throne/releases
node ops/install-release.mjs /path/to/releases/r1-002 /opt/last-throne/releases
# Первичная сборка runtime и запуск PostgreSQL выполняются один раз по RUNBOOK.
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps runtime node ops/migrate-release.mjs r1-002
# После создания API роли и точных R1 GRANT:
docker compose --env-file ops/.env -f ops/compose.yml up -d runtime
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update r1-002
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

После первичного TD Nginx маршрута проверить настоящий HTTPS launcher/current/bootstrap/version и полную короткую R1 партию с сохранением, точным повтором requestId, конфликтом двух вкладок и finish; сохранить отчёт, версии/процессы/ресурсные метрики и исходное/итоговое состояние первой игры. Локальные тесты не заменяют эти VPS checks. В production A/B остаётся прежний API до readiness нового; switch и client pointer фиксируются durable state и журналом. Precommit recovery оставляет прежний выбор, postcommit определяется совпадением operationId selection и журнала. Во время switch серверные записи требуют идемпотентного повторения тех же requestId; браузерный бой продолжает использовать закреплённые версии.

## Баланс без рестарта API

R1 balance publisher — отдельная локальная команда владельца БД. Она клонирует опубликованный EAV набор с новыми entity IDs, изменяет только существующие scalar параметры, проверяет типы/ограничения БД и компилирует полный content через R1 core validator до publication. Никакого выполнения кода или произвольного JSON blob в EAV. Предыдущий release сохраняется. Перед повтором после timeout прочитать существующую версию; существующая contentVersion никогда не перезаписывается.

Пример `balance-r1.json`:

```json
{"updates":[{"type":"game_config","code":"r1","parameter":"initial_gold","value":700}]}
```

Передать файл в private state и выполнить owner helper из неизменяемого R1 каталога:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node /releases/r1-002/ops/publish-r1-content.mjs r1-content-2 /state/balance-r1.json
```

Публикация ещё не меняет launcher. На машине сборки из тех же server/core/schema/lockfile исходников собрать новый launch manifest:

```sh
CONTENT_VERSION=r1-content-2 npm run build -- r1-content-002
```

Установить готовый каталог и переключить только client pointer:

```sh
node ops/install-release.mjs /path/to/releases/r1-content-002 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs content r1-content-002
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Команда проверяет равенство backend/core/API/saveFormat с активным API и `/bootstrap?clientReleaseId=r1-content-002` до promotion; при неопубликованном content или новой логике отказывает. API PID сохраняется. Прежний R1 run использует `r1-content-1`, новая партия получает `r1-content-2`; точка сохранения не переводится на новый баланс молча. Новый behavior/core/metadata вне нынешнего compatibility требует обычного проверенного code-release, а не команды content.

## Откат и evidence

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs rollback r0-002
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Launcher вернётся к R0 техническому экрану; R1 API и новые guest/run/checkpoint записи останутся. Открытые R1 клиенты и оба bootstrap pins должны работать. Для восстановления interrupted operation используется `recover`, а не ручная правка pointer/DB. При `retirement_pending` прежний процесс сохраняет слот; после завершения запросов повторить recover и проверить его фактический выход.

Delivery tests проверяют actual Node A/B процессы и loopback HTTP, фиксированную матрицу R1 family, неизменность точного R0 archive, R0→R1 switch без смены gateway PID, Host для Origin validation, frontend_only с новой guest fixture записью и старым/новым bootstrap pin, balance promotion без смены API PID, а также все сохранённые R0 interruption/drain regressions. Fixtures не доказывают настоящие R1 owner/isolation/checkpoint/finish: эти сценарии отдельно проверяются API/DB/game-core integration tests. Private Unix control socket всё ещё требует target-host проверки: local execution environment запрещает его bind, тест отмечен skip. Docker/Nginx/TLS, PostgreSQL multi-session, backup/restore и совместное размещение с первой игрой остаются эксплуатационной приёмкой VPS.
