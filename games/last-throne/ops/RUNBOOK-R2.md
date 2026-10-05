# R2: десять волн, новая магия и доставка

Пакет подготовлен для `/td/` на том же VPS, где находится первая игра. Установка, миграции, переключение и проверка первой игры на VPS здесь **NOT_EXECUTED**: доступа к нему в этой работе нет. Старые исходники R1 и готовые `r0-002`/`r1-002` сохраняются точно. Локальная поставка не подтверждает ресурсы VPS, TLS, Unix socket или работу контейнеров.

## Версии и границы

| Клиент | Ядро | Контент | Metadata | Save | API |
| --- | --- | --- | --- | --- | --- |
| Архив R0 `r0-002` | `r0-core-1` | `r0-content-1` | `r0-meta-1` | 1 | 1 |
| Архив R1 `r1-002` | `r1-core-1` | `r1-content-1` | `r1-meta-1` | 2 | 1 |
| R2 `r2-001` | `r2-core-1` | `r2-content-1` | `r2-meta-1` | 3 | 1 |

Новый API поддерживает R1 и R2 по полным закреплённым версиям партии. R1 остаётся пятиволновой игрой с save2: существующий checkpoint не преобразуется в R2. Сборщик включает оба core-модуля, прежние SQL001–004 и новые контролируемые SQL005–006. Данные content/save — scalar typed EAV, а не изменяемый JSON-файл релиза.

В manifest R2 указаны `compatibleApi:[1]`, `compatibleSaveFormats:[1,2,3]`, metadata R0/R1/R2 и `compatibleClientReleases:['*','r1-*','r2-*']`. Это фиксированные семейства: `*` ограничен прежними R0 core/content/meta; `r1-*` требует ID `r1-`, строго core1/meta1/save2/API1 и `r1-content-*`; `r2-*` требует ID `r2-`, строго `r2-core-1`/`r2-meta-1`/save3/API1 и `r2-content-*`. Произвольные regex не принимаются. Отдельно проверяются массивы совместимости, полный artifact inventory и опубликованный DB-контент.

**Runtime:** прежний supervisor R1 не распознаёт `r2-*`. Если такой runtime уже установлен, перед первой R2 активацией нужен один плановый upgrade runtime-image, описанный ниже. R1 в этой сессии на VPS не устанавливался. Для первой TD установки используется сразу каркас R2. Уже внутри этого каркаса дальнейшие обычные immutable releases меняют A/B API без пересоздания образа/контейнера и без reload общего Nginx. Обновление самого supervisor/Node/native dependencies остаётся отдельным обслуживанием.

`rollbackMode:'frontend_only'` возвращает launcher к R1, сохраняя API R2, все R2 записи и поддержку открытых R1/R2 вкладок. Архивный R1 API не умеет читать save3; `pair` откат к нему не объявляется безопасным.

## Сборка и локальная разработка

Нужен Node 24. На машине сборки:

```sh
npm ci
npm run typecheck
npm test
BUILD_RELEASES_DIR=releases npm run build -- r2-003
```

Новый ID обязателен: существующий каталог никогда не заменяется. Значение по умолчанию — `r2-001`, output по умолчанию — `dist/releases`; команда выше сознательно выбирает новый ID и `releases/`. Сборщик копирует точные готовые R0/R1 архивы и проверяет их до/после копирования. Все клиентские ресурсы используют `/td/releases/RELEASE_ID/web/`; открытый бой не подменяет JS через current. `sourceHash` закрепляет инвентарь исходников, file hashes — фактические файлы поставки. Это SHA256 gate целостности, **не подпись/HMAC** и не доказательство доверенного происхождения: за источник отвечает оператор.

`npm run dev` строит новый `r2-dev-<timestamp>`, сохраняет старые immutable clients и использует persistent PGlite в `.local/database` после обычных миграций. Это локальная разработка, production использует PostgreSQL. Единственная сессия PGlite удерживается на всю транзакцию. Dev слушает loopback; Secure cookies отключены только здесь. Можно задать `RELEASE_ID`, `DEV_RELEASES_DIR`, `DEV_DATABASE_DIR`, `DEV_PORT` для точного воспроизведения. После правки исходников выбирается новый releaseId.

## Первая TD установка

Через разрешённый канал сначала проверить работающую первую игру, маршруты/порты/TLS, CPU/RAM/диск, запас под старый+новый API и отдельный PostgreSQL volume. Сохранить baseline первой игры и DB/state backup, проверить процедуру восстановления. Выбрать свободный loopback-порт и измеренные лимиты в `ops/.env`; точные Node24/PostgreSQL17 images должны иметь SHA256 digest. PostgreSQL18 нельзя подставлять в этот Compose без отдельной проверки data path. Секреты — в private env, не в исходниках, manifest или командной строке.

```sh
sudo install -d -m 0755 /opt/last-throne/releases
sudo install -d -o 10001 -g 10001 -m 0700 /opt/last-throne/state
cd /opt/last-throne/runtime
install -m 0600 ops/env.example ops/.env
```

В `/opt/last-throne/runtime` располагают только проверенный каркас R2 `ops/`+`launcher/`, а готовые релизы устанавливают из отдельного полученного пакета:

```sh
node ops/install-release.mjs /path/to/ready/releases/r0-002 /opt/last-throne/releases
node ops/install-release.mjs /path/to/ready/releases/r1-002 /opt/last-throne/releases
node ops/install-release.mjs /path/to/ready/releases/r2-001 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml config --quiet
docker compose --env-file ops/.env -f ops/compose.yml build runtime
docker compose --env-file ops/.env -f ops/compose.yml up -d postgres
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps runtime node ops/migrate-release.mjs r2-001
```

Миграции выполняются отдельным владельцем **до** запуска HTTP API; child получает только application URL. Для первой установки создать отдельную API login-роль внутри этой выделенной БД, пароль задать интерактивно:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec postgres psql -U last_throne_migrator -d last_throne
```

```sql
CREATE ROLE last_throne_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
\password last_throne_api
```

Выдать только точные права R2 владельцем выделенной схемы:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec -T postgres psql -U last_throne_migrator -d last_throne -v api_role=last_throne_api < db/r2-runtime-grants.sql
```

Файл должен использоваться после SQL005–006. Он оставляет content/metadata чтение и bounded named функции guest/run/checkpoint/finish, а не прямой доступ к приватным saves/auth/idempotency таблицам. Не выдавать API migration owner, publication functions или generic EAV helper. Revoke глобальных default PUBLIC function permissions выполняет отдельный владелец Last Throne; такой владелец не должен владеть приложениями первой игры. URL/пароль API в env должны соответствовать созданной роли.

```sh
docker compose --env-file ops/.env -f ops/compose.yml up -d runtime
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update r2-001
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Добавить только TD-route из `nginx-td.conf.example` в существующий HTTPS server block, после backup полного конфига и успешного `nginx -t` выполнить один graceful reload. Первая игра сохраняет прежние маршруты/каталоги/контейнеры/API. Для последующих TD releases этот reload не нужен.

## Если R1 runtime уже установлен

Этот сценарий здесь не выполнялся. Он требует планового окна только для TD; PostgreSQL, первая игра и общий Nginx остаются работающими. Новую R2 поставку пока держать **вне** подключённого `TD_RELEASES_DIR`: startup R1 selection не совместим с заранее видимым R2 клиентом.

1. Снять baseline и проверенные DB/state backups. Остановить только TD runtime, сохранить его persistent state и прежние immutable R0/R1 каталоги. Заменить каркас на проверенный R2, сохранить private env, построить новый runtime-image.
2. Выполнить expand-миграции R2 из отдельного staging-пакета через временный read-only mount, не публикуя R2 каталог действующему runtime. Например:

```sh
docker compose --env-file ops/.env -f ops/compose.yml stop runtime
docker compose --env-file ops/.env -f ops/compose.yml build runtime
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps -e RELEASES_DIR=/candidate-releases -v /path/to/ready/releases:/candidate-releases:ro runtime node ops/migrate-release.mjs r2-001
docker compose --env-file ops/.env -f ops/compose.yml exec -T postgres psql -U last_throne_migrator -d last_throne -v api_role=last_throne_api < db/r2-runtime-grants.sql
```

3. Запустить новый R2 runtime с прежними R0/R1 каталогами и прежним state: recovery поднимет выбранный R1 API. Затем установить R2 в постоянный release parent и выполнить обычный update:

```sh
docker compose --env-file ops/.env -f ops/compose.yml up -d runtime
node ops/install-release.mjs /path/to/ready/releases/r2-001 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update r2-001
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Сам плановый upgrade меняет container/gateway PID. Отдельно измеряемое последующее A/B переключение внутри нового runtime их сохраняет. Не выдавать этот upgrade за обычный hot update и не возвращать старый R1 runtime после появления save3.

## Обычный update, content и rollback

Проверить новый пакет вне VPS, установить с новым ID, зафиксировать container ID/StartedAt, gateway/API PID и baseline первой игры. Внутри стабильного R2 runtime:

```sh
node ops/install-release.mjs /path/to/ready/releases/r2-003 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update r2-003
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Local CLI использует private Unix socket mode0600; публичного `/deploy` нет. Supervisor проверяет hashes и совместимость всех retained clients, берёт эксклюзивный lock, выполняет idempotent migrations, проверяет readiness/identity/DB-published bootstrap нового B, durable фиксирует selection, переключает API, публикует launcher pointer и ждёт текущие запросы A. `retirement_pending` сохраняет прежний слот до завершения запросов; старый API не убивается ради следующего update. Новые API requests идут B, старые открытые бои используют прежние client/content pins.

Для известного scalar баланса есть owner-only `ops/publish-r2-content.mjs`. Он клонирует весь опубликованный каталог с новыми entity IDs, применяет 1–64 известных scalar updates, проверяет типы и полный R2 compiler (включая три разрешённых spell behavior IDs), публикует и сравнивает actual SQL projection hash внутри одной транзакции. Старые версии не меняются. Это не произвольная публикация новых поведения/схемы/кода.

Пример private `balance-r2.json`:

```json
{"updates":[{"type":"game_config","code":"r2","parameter":"initial_gold","value":700}]}
```

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node /releases/r2-001/ops/publish-r2-content.mjs r2-content-2 /state/balance-r2.json
```

Публикация сама ещё не выбирает новый клиент. На машине сборки из тех же backend/core/schema/lockfile исходников:

```sh
CONTENT_VERSION=r2-content-2 BUILD_RELEASES_DIR=releases npm run build -- r2-content-002
node ops/install-release.mjs /path/to/ready/releases/r2-content-002 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs content r2-content-002
```

`content` требует прежний backend/core/API/saveFormat, совместимую metadata и подтверждённый bootstrap новой DB contentVersion. Он сохраняет API PID и не запускает migration/new child. Прежняя R2 партия остаётся на `r2-content-1`, новая получает `r2-content-2`. При неопубликованной версии или новом backend команда отказывает до pointer promotion.

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs rollback r1-002
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Launcher возвращается к точному R1 клиенту, R2 API/save3 записи остаются; проверяются оба bootstrap pins, открытые вкладки и неизменный API PID. DB backup не восстанавливается автоматически. Для interrupted operation:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs recover
```

`selection.json` — durable выбор; `journal.json` — фазы; `current.json` — производный pointer. Precommit recovery сохраняет прежний выбор, postcommit завершается только по совпавшему `operationId` selection/журнала; совпавший API ID сам по себе не считается commit для content/frontend_only. После `recovery_required` новые update запрещены до recovery. Не редактировать pointer руками.

## Приёмка

Delivery fixtures проверяют реальные Node A/B/loopback HTTP, сохранение gateway PID, R1→R2 switch, обратный отказ старого API, hashes и exact R0/R1 архивы, frontend_only с сохранённой save3 fixture записью и обоими pinned clients, content без смены API PID. Publisher отдельно проверяется на actual typed EAV/PGlite; fixture запись не доказывает настоящий owner/revision/idempotency/finish — это API/SQL integration suite. Общие R0/R1 drain/crash/operationId regressions остаются в suite.

На целевом VPS отдельно исполнить private Unix socket/CLI, PostgreSQL multi-session, backups/restore, TLS/Nginx, container ID/StartedAt, ресурсные лимиты и первую игру. Проверить полноценную R2 партию/сохранение/повтор requestId/конфликт вкладок/finish, восстановление R1 через exact client, новую/старую contentVersion и состояние первой игры до/после. Локальные SwiftShader/browser проверки не подтверждают GPU FPS или человеческую оценку читаемости магии.
