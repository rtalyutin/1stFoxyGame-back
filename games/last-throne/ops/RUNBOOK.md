# «Последний трон»: технический R0 на VPS первой игры

Этот пакет подготовлен и проверен локально. На целевом VPS команды из этого документа ещё не исполнялись. R0 содержит технический экран, read-only API и EAV-каталог; партии, сохранения, герои и здания относятся к R1.

## Устройство доставки

Host Nginx один раз получает маршрут `/td/` к loopback-порту нового runtime. Постоянный Node gateway внутри отдельного контейнера обслуживает launcher/immutable-файлы и направляет `/td/api/v1/` выбранному дочернему API. Код каждого API и его `node_modules` находятся в собственном каталоге релиза. Runtime-image содержит Node 24, supervisor и стабильный launcher; вся директория `releases` подключена read-only, `state` — постоянно и с записью.

Это уточнение §8.3 ТЗ: обычное обновление меняет A/B-маршрут внутри gateway и не требует reload общего Nginx. Gateway прекращает назначать новые запросы прежнему процессу и считает его текущие запросы. При нуле запросов supervisor посылает только этому API `SIGTERM` и ждёт корректного завершения. Соединения первой игры не входят в дренирование. Неистёкший процесс сохраняет свой слот; его нельзя заменить следующей поставкой. Штатное обновление не вызывает `docker restart`, `compose down` или пересоздание runtime.

Смена supervisor, launcher, Node/system/native-зависимостей требует отдельного обслуживания runtime-image. В R0 все manifest объявляют совместимость только с техническими версиями `r0-core-*`, `r0-content-*`, `r0-meta-*`. `*` в `compatibleClientReleases` не распространяется на R1. Все сохранённые каталоги релизов проверяются перед promotion; автоматической очистки нет. Хэши обеспечивают целостность полученного пакета, а доверенный оператор отвечает за источник пакета: manifest не является цифровой подписью.

## Первичная установка

1. Через существующий разрешённый канал снять read-only факты: работающие контейнеры/Compose, все маршруты Nginx, занятые порты, TLS, CPU/RAM/диск и нагрузку первой игры, запас места под старый и новый релиз. Выбрать не занятый loopback-порт. Проверить запас для первой игры, PostgreSQL и одновременно двух API этой игры. При нехватке ресурса оставить текущие игры рабочими и не активировать TD.
2. Разместить исходный runtime-каркас этого пакета в `/opt/last-throne/runtime`, включая `ops/` и `launcher/`. На машине сборки уже должны быть выполнены `npm ci`, `npm test`, `npm run build -- RELEASE_ID`; на VPS передаётся готовый `dist/releases/RELEASE_ID`, сборка там не требуется.
3. Создать постоянные каталоги, сохраняя остальные проекты:

```sh
sudo install -d -m 0755 /opt/last-throne/releases
sudo install -d -o 10001 -g 10001 -m 0700 /opt/last-throne/state
cd /opt/last-throne/runtime
install -m 0600 ops/env.example ops/.env
```

Заполнить `ops/.env` локально на VPS: точные Node 24 и **PostgreSQL 17** image refs с `@sha256:...`, выбранный loopback-порт, уникальные DB-секреты, отдельные URL владельца миграций и API, измеренные лимиты RAM/CPU и пула. Пароли не помещать в исходники, manifest, архив или командную строку. Проверить реальный digest и совместимость образа перед сборкой; документ не придумывает digest. В этом Compose путь данных рассчитан на PostgreSQL 17; версия 18 требует отдельной проверки путей и обновления конфигурации. Первая игра сохраняет свои порты, сервисы и `/api/`.

4. Атомарно установить уже проверенный release, например `r0-002`:

```sh
node ops/install-release.mjs /path/to/ready/dist/releases/r0-002 /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml config --quiet
docker compose --env-file ops/.env -f ops/compose.yml build runtime
docker compose --env-file ops/.env -f ops/compose.yml up -d postgres
docker compose --env-file ops/.env -f ops/compose.yml run --rm --no-deps runtime node ops/migrate-release.mjs r0-002
```

`install-release` не заменяет существующий releaseId. Он копирует пакет в скрытую staging-директорию, повторно проверяет inventory/SHA256, синхронизирует файлы и публикует каталог атомарным rename. Не выбирать staging-каталоги. Владелец хоста может снять read-only права, но штатные процессы этого не делают.

5. Создать отдельную read-only роль R0 после миграций. В `psql` пароль задаётся интерактивно; не писать его в SQL-файл:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec postgres psql -U last_throne_migrator -d last_throne
```

```sql
CREATE ROLE last_throne_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
\password last_throne_api
GRANT CONNECT ON DATABASE last_throne TO last_throne_api;
GRANT USAGE ON SCHEMA last_throne TO last_throne_api;
GRANT SELECT ON ALL TABLES IN SCHEMA last_throne TO last_throne_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA last_throne GRANT SELECT ON TABLES TO last_throne_api;
```

Эти GRANT исполняются от владельца миграций. `TD_DATABASE_URL` использует `last_throne_api`, а `TD_DATABASE_MIGRATION_URL` — отдельного владельца. Встроенный PostgreSQL entrypoint создаёт владельца с cluster-level полномочиями; он доступен только внутри проекта и не используется для HTTP-запросов. Перед публичным запуском проверить роли и отсутствие PUBLIC/write-привилегий у API. Пароль в `.env` должен соответствовать интерактивно заданному паролю API. R1 будет отдельной поставкой разрешённых записей, не blanket-GRANT нынешней роли.

6. Запустить постоянный runtime и активировать технический пакет:

```sh
docker compose --env-file ops/.env -f ops/compose.yml up -d runtime
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update r0-002
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

7. Вставить только правила из `nginx-td.conf.example` в существующий HTTPS server block, заменив пример порта. Сначала сохранить исходную конфигурацию и проверить полный `nginx -t`, затем выполнить штатный graceful reload. Это один первичный reload; дальнейшие TD обновления его не требуют. Проверить HTTPS `/td/`, `/td/current.json`, `/td/api/v1/ready`, `/td/api/v1/version` и сценарий первой игры на её прежнем пути. Не обходить TLS-проверку.

## Обычное обновление и откат

Новый пакет собирается и проверяется вне VPS с новым уникальным releaseId. Перед update зафиксировать ID/StartedAt runtime-контейнера, gateway/API PID, версии, свободные ресурсы и состояние первой игры. Загрузить готовый каталог и установить его той же `install-release` командой. Затем:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs update NEW_RELEASE_ID
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Операторская команда доступна через Unix socket `/state/control.sock` с mode `0600`. Публичного HTTP `/deploy` нет. Supervisor берёт эксклюзивную блокировку, проверяет полный artifact/runtime/совместимость всех сохранённых клиентов, выполняет expand-миграции владельцем, проверяет readiness и identity B, атомарно фиксирует намерение API, переключает маршрут, проверяет API через реальный gateway, атомарно публикует `current.json` и дренирует A. Cookie-профили/сохранения R1 ещё не существуют, поэтому их совместимость и идемпотентность R0 не объявляет проверенными.

Для изменения только контента известного поведения есть отдельная команда `content`: нужен новый clientReleaseId и manifest на новую опубликованную EAV contentVersion. Backend/core/API/saveFormat должны совпадать с активным API; metadata и client должны проходить его матрицу совместимости. Команда проверяет `/bootstrap?clientReleaseId=NEW_RELEASE_ID` через активный API до promotion, фиксирует selection/pointer и сохраняет API PID. Она не запускает миграции или дочерний процесс.

Конкретный R0 пример меняет только технический параметр `application_settings.title`. От владельца миграций создать новый draft, клонировать существующие typed EAV значения и вызвать `publish_content_release` в одной транзакции — это выполняет контролируемый helper:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node /releases/r0-002/ops/publish-r0-content.mjs r0-content-2 "Последний трон — каталог 2"
```

Опубликованный `r0-content-1` остаётся неизменным. Helper принимает только технический тип `application_settings` с `gameplay_available=false`; это не интерфейс создания будущих героев и башен. Публикация ещё не меняет launcher и не требует остановки API. Затем на машине сборки из **тех же исходников API/ядра** собрать новый набор запуска:

```sh
CONTENT_VERSION=r0-content-2 npm run build -- r0-002-content
```

Передать готовый каталог на VPS и продвинуть клиентский указатель:

```sh
node ops/install-release.mjs /path/to/ready/dist/releases/r0-002-content /opt/last-throne/releases
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs content r0-002-content
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
```

Проверить прежний bootstrap/content с `clientReleaseId=r0-002`, новый с `clientReleaseId=r0-002-content` и неизменный API PID. Если DB версия не опубликована или требует нового кода, команда отказывает до изменения pointer. Обычный `update` использует A/B при смене API releaseId.

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs rollback OLD_RELEASE_ID
```

Для `pair` возвращаются API и новый запуск клиента; verifier требует совместимости прежнего API со всеми сохранёнными manifest, включая вкладки новой версии. `frontend_only` возвращает только launcher к выбранному прежнему клиенту, сохраняя новый совместимый API. `forward_only` запрещает rollback: требуется новая исправленная версия. Откат не восстанавливает DB backup и не удаляет новые записи. Уже открытые вкладки сохраняют свои адреса `/td/releases/RELEASE_ID/`. Совместимость форматов в manifest — необходимая проверка, а не доказательство поведения будущих save-операций; R1 обязан дополнить её настоящей матрицей записей/чтения/повторов.

После update/rollback сверить HTTPS API/pointer/immutable-ресурсы, журнал, процессы и первую игру. ID/StartedAt контейнера и gateway PID должны сохраниться, API PID меняется. Ресурсные/HTTP наблюдения приложить к evidence. `drained:false` или `retirement_pending` означает, что вывод прежнего процесса ещё не завершён.

## Обрыв операции и восстановление

`selection.json` — каноническое устойчивое намерение, `journal.json` — журнал фаз, `current.json` — клиентский указатель. Записи синхронизируются с диском и публикуются через rename в том же persistent state. До фиксации операции восстановление сохраняет прежний выбор API/клиента. После фиксации завершает выбранную операцию, сохраняя новые записи. Совпадение API само по себе не доказывает commit при content/frontend_only: восстановление завершает клиентское продвижение только при совпавшем `operationId` selection и журнала. При явной ошибке после фиксации команда сообщает `recovery_required`; следующий update не разрешён до восстановления:

```sh
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs status
docker compose --env-file ops/.env -f ops/compose.yml exec runtime node ops/cli.mjs recover
```

При падении API supervisor запускает его снова из выбранного неизменяемого каталога. При отдельном обслуживании/восстановлении контейнера сохранённая selection поднимает нужный API и согласует pointer. Пересоздание контейнера проверяется отдельно от штатного update; не использовать его для продвижения новой версии. После неисправимого recovery не редактировать pointer вручную и не повторять switch вслепую: прочитать журнал, selection, доступные артефакты и DB, исправить причину, затем вызвать recovery.

## Проверено и что остаётся на целевом сервере

`node --test tests/delivery.test.mjs`: фактические Node A/B-процессы и loopback HTTP, запрос старому A во время switch, 30 новых запросов B, сохранение gateway PID, вывод A, immutable старые файлы, hash/migration/readiness отказ, эксклюзивная блокировка, pair/frontend_only, отсутствие восстановления записей, четыре границы interrupted delivery, live recovery и восстановление упавшего API. Live content проверяет прежний/новый pin, сохранение API PID, отказ при смене backend и неопубликованном DB-контенте. В PGlite исполняется реальный EAV publisher: новая версия/title, неизменная прежняя версия, rollback транзакции при повторе contentVersion и hash derived projection. Fixture-записи проверяют отсутствие удаления данных механизмом rollback; это не тест будущего checkpoint/finish.

Локальная среда запрещает bind Unix sockets (`EPERM`), поэтому тест private socket/CLI помечается skip; fixture вызывает тот же controller напрямую через constructor-only harness. Production по умолчанию требует private Unix socket и не имеет TCP admin fallback. Docker/PostgreSQL service/Nginx/TLS, контейнер ID/StartedAt, backup/restore, реальные миграции multi-session PostgreSQL, ресурсные лимиты и первая игра проверяются на VPS отдельно. Эти checks нельзя заменить локальным PASS.
