# R2 API: совместимость с R1

Контракт `r2/1`, источник `R2-CONTRACT.md`. Текущая машинная спецификация — `server/openapi-r2.json`; генератор `node server/openapi-r2.mjs`. Она описывает обе поддерживаемые формы снимка. Версионный `openapi-r1.json` относится к прежней поставке.

Маршруты остаются `/td/api/v1`: guest-session, bootstrap/content/version/ready/health, profile, runs, checkpoint и finish. Методы, cookie, поля профиля, пагинация, безопасные ошибки, Origin и ограничения размера соответствуют `API-R1.md`. Гостевая сессия и профиль общие для собственных партий R1/R2. В production cookie `last_throne_guest` содержит непрозрачный случайный токен, имеет `Path=/td; Secure; HttpOnly; SameSite=Lax`; БД хранит только SHA-256. Значение owner из пользовательского тела не принимается.

| Сценарий | Закреплённые версии | Поведение |
|---|---|---|
| R0 bootstrap | r0 core/meta, save1 | Технический клиент, игровые capabilities=false |
| R1 run | r1-core-1, r1-content-*, r1-meta-1, save2, API1 | Прежний parser/validator и typed сохранение R1; 2 героя, 2 здания, 5 волн |
| R2 run | r2-core-1, r2-content-*, r2-meta-1, save3, API1 | R2 parser/validator и typed сохранение R2; 5 героев, 3 здания, 10 волн |
| Смешанная пара | Несовпадающие core/meta/save/content | 409 при pin/bootstrap/create; 422 при новом checkpoint; данные не меняются |

Выбор обработчика выполняет `server/game-versions.mjs` по полному tuple. Манифест клиента должен быть принят compatibility-матрицей API; его contentVersion должен существовать как опубликованный release с точными metadataSchemaVersion/coreCompatibility. Новое имя запуска для content-only публикации не изменяет сопоставление старого clientReleaseId. Контент компилируется из фактических EAV-значений; API не подменяет его `defaultR2Content`.

POST `/runs` сохраняет прежнее тело `{clientRunId,clientReleaseId,coreVersion,contentVersion,seed}` и возвращает run, включая `id`, `revision`, `snapshotSchemaVersion`, `clientReleaseId`, `seed`, `status`. GET `/runs` возвращает `{runs,nextCursor}` и содержит собственные партии обоих релизов. GET `/runs/{id}` показывает текущие статус и ревизию отдельно от исторических ответов save. Возобновление R1 использует прежний проверенный клиент; API не преобразует снимок R1 в R2.

PUT `/runs/{id}/checkpoint`: `{requestId,expectedRevision,snapshotSchemaVersion,snapshot}`. Для R1 формат равен 2; для R2 — 3. Тело R2 содержит прежние top-level поля плюс те же обязательные статистики. Каждый saved hero дополнительно содержит `stolenSpell:string|null`, `stealCooldown:integer`, `priority:nearest|strongest|commander`. Только Rubick может хранить одно из `area_heal`, `area_strike`, `temporary_shield` и ненулевой stealCooldown; только Sniper может менять priority. Остальные сохраняют `null`, `0`, `nearest`. Названия неизвестных обработчиков, смешанные версии, диапазоны/кулдауны/площадки, дубликаты и боевые transient-объекты отклоняются валидатором закреплённого ядра. Отсутствие stolenSpell в EAV означает nullable-слот; API восстанавливает явный `null`.

Ответ checkpoint остаётся `{runId,revision,checkpointId}`. GET checkpoint возвращает последнее полное поколение и его `revision`, отдельно текущую `runRevision`; до первого снимка — `null`. Старые поколения и их metadataSchemaVersion неизменяемы.

POST `/runs/{id}/finish`: прежнее `{requestId,expectedRevision,result}`. Result содержит outcome, wave, lastCompletedWave, simTick, gold, throneHp, seed, versions, statistics. Для R2 victory требует финальную десятую волну; для R1 — пятую. Defeat хранит достигнутую активную волну без безопасного checkpoint. Ответ `{runId,revision,resultId,status}`. Typed результат отмечен `client_reported=true`; это не подтверждение серверной симуляцией.

Checkpoint/finish разделяют уникальность `(owner,run,requestId)`. Одна зарезервированная SQL-сессия: владелец → ограниченная блокировка → операция/канонический хеш → terminal/revision → формат и значения → typed поколения или результат → pointer/status/revision/ответ → commit. Точный повтор возвращает прежний ответ до проверки версии, фазы или терминальности; изменённое тело уже принятого ID получает 409 IDEMPOTENCY_CONFLICT. Валидатор читает закреплённый контент тем же client, включая пул размера 1. Новая операция после finish получает RUN_FINISHED, не меняя последний checkpoint.

Канонизация версии 1 и исторические хеши R1 сохранены. В хеш R2 входит формат 3, вид операции, runId и полное тело; пробелы и порядок JSON-ключей не меняют хеш. HTTP проверяет структуру и предел представления чисел до обращения к БД; игровые диапазоны проверяются после locked repeat lookup.

Авторская проверка `node --test tests/r2-db-api-storage.test.mjs tests/r2-db-api-http.test.mjs tests/r1-database.test.mjs tests/r1-api.test.mjs`: 39/39 PASS, Node24, PGlite0.5.8, Fastify5.12.5. Она создаёт R1 party/checkpoint до миграций005/006 и проверяет чтение/точный повтор после них, nullable-slot/кулдауны/priority R2, ошибки версии/прав/идемпотентности/финала и фактические SQL-права роли. Генерация OpenAPI `node server/openapi-r2.mjs` выполнена. Source SHA-256: `server/app.mjs=3667ad1ae66ad3cab2af2e46935197e9e093d5ae2735d3320f91709efd9c8243`, `server/game-versions.mjs=192c521731c832d80b775d77de98dbd1cfeed4ddd53bd841dc325ce9c7b0e731`. Digest SQL/метаданных/контента приведены в `DB-R2.md`.

Очередь PGlite одного leased client позволяет воспроизвести повтор/конфликт и не обещает поведение нескольких PostgreSQL-сессий, производительность целевого VPS или выполненный deployment. Авторские проверки не заменяют независимую приёмку сборки.
