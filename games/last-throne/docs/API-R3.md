# R3 API и сохранения R1/R2

Основание: контракт `r3/1`, `docs/R3-CONTRACT.md` SHA-256 `0562c4fa5d278e797e163c8ac419b2bfb60efb907c2923c98182c5971690bb13`. Машинный контракт — `server/openapi-r3.json`, генератор `node server/openapi-r3.mjs`. Старые версионные OpenAPI остаются документами своих поставок.

Маршруты `/td/api/v1` и формы запросов сохраняются. Production-cookie `last_throne_guest` имеет `Path=/td; Secure; HttpOnly; SameSite=Lax`; БД хранит SHA-256 случайного токена. Owner определяется сессией. Мутации требуют точный Origin; настройки, размеры запросов, пагинация и квоты соответствуют `API-R1.md`. `secureCookies:false` допустим только при loopback HTTP для локальной разработки.

| Клиент / партия | Core / metadata / save | Состав и обработчик |
| --- | --- | --- |
| R0 | r0 / r0 / 1 | Технический bootstrap; игровые capabilities=false |
| R1 | r1-core-1 / r1-meta-1 / 2 | Исходные parser, validator и storage; 5 волн |
| R2 | r2-core-1 / r2-meta-1 / 3 | Исходные parser, validator и storage; 10 волн |
| R3 | r3-core-1 / r3-meta-1 / 4 | R3 parser, validator и typed storage; 15 волн |

Каждая партия закрепляет точные clientReleaseId/contentVersion и остальные версии. API проверяет объявленную совместимость, полный tuple и фактический published-каталог. R3 клиент принимается по заранее объявленному точному release ID; широкого шаблона `r3-*` нет. Это сохраняет возможность проверить новый артефакт старым R2 supervisor. Новые content-only ID должны быть заранее объявлены в активном API. R1/R2 не расширяются до 15 волн и не конвертируются.

| Метод / путь | Тело / ответ |
| --- | --- |
| POST `/guest-session` | Без тела или `{}`; `{profileId,profileRevision}` и cookie при создании |
| GET/PATCH `/profile` | Собственный профиль; PATCH `{expectedRevision,settings}` |
| GET `/bootstrap?clientReleaseId=...` | Точные версии, capabilities, nullable profile, contentUrl |
| GET `/ready`, `/version`, `/health` | Готовность закреплённого контента; версии/совместимость/stage; liveness |
| GET `/content?clientReleaseId=...`, `/content/{version}` | Фактическая EAV-проекция; immutable Cache-Control и canonical SHA ETag |
| POST `/runs` | `{clientRunId,clientReleaseId,coreVersion,contentVersion,seed}` → полный run с `id,revision,status,snapshotSchemaVersion` |
| GET `/runs` | `{runs,nextCursor}`, до 20 собственных партий всех трёх игровых форматов |
| GET `/runs/{id}` | Текущие статус, revision, pinned versions и nullable result |
| PUT `/runs/{id}/checkpoint` | `{requestId,expectedRevision,snapshotSchemaVersion,snapshot}` → `{runId,revision,checkpointId}` |
| GET `/runs/{id}/checkpoint` | Последний snapshot и его `revision`, отдельно текущая `runRevision`; до первой записи `null` |
| POST `/runs/{id}/finish` | `{requestId,expectedRevision,result}` → `{runId,revision,resultId,status}` |

Snapshot4 сохраняет прежние поля R2 и добавляет каждому герою обязательные `items:[string|null,string|null]`, `expedition:{kind,remainingTicks,totalTicks,rewardId}|null`, `aegisToken:boolean`. Root содержит обязательный `pendingRewards:[{id,heroId,kind:'shop',options:string[]}]`. Возможна одна активная вылазка или один незавершённый выбор награды. Они не сосуществуют. Длительности, совместимость предметов, известные обработчики и порядок предложений проверяются по контенту партии. Предметы уникальны по обработчику; два nullable-слота сохраняют порядок. Aegis связан с собственным героем и не занимает слот предмета. `camp`, `shop`, `roshan` — допустимые виды вылазки. Боевые transient-объекты, чужие reward-owner, неизвестные refs/handlers, неправильные таймеры и смешанные версии получают 422 без частичной записи.

FinishResult сохраняет outcome, wave, lastCompletedWave, simTick, gold, throneHp, seed, versions и statistics{kills,builds,upgrades,goldEarned}. Victory R3 требует wave=lastCompletedWave=15 и допустимый положительный HP трона; прежние R1/R2 финалы остаются 5/10. Результат хранит typed `client_reported=true`: это клиентское сообщение о прохождении.

Checkpoint и finish разделяют `(owner,run,requestId)`. Одна SQL-сессия и транзакция: owner → bounded lock → canonical hash/replay → status/revision → pinned validator → typed generation/result → pointer/revision/status/journal → commit. Точный повтор возвращает прежний ответ до семантических проверок и после finish. Изменённое тело принятого ID получает 409 IDEMPOTENCY_CONFLICT. GET run показывает актуальное состояние отдельно от исторического ответа. Canonicalization1 и хеши исторических R1/R2 операций сохранены; новые R3 операции включают save4. Ограничения HTTP-представления проверяются до БД, игровые ограничения — после replay.

При чтении любого каталога, совместимого с `r3-core-1`, API сверяет canonical SHA фактической typed-проекции с stored projection_hash. Несовпадение даёт безопасный 503 CONTENT_VERSION_UNAVAILABLE до возврата данных или ETag304; ready становится 503. Новый параметр метаданных сам по себе не разрешает новый исполняемый handler: R3 SQL-граница публикации проверяет известные spell/item handlers и для новых metadata revisions.

Авторские проверки 07.10.2026, Node24.19.0/PGlite0.5.8/Fastify5.12.5:

```sh
node --test tests/database-r3-storage.test.mjs tests/server-r3-http.test.mjs
```

18/18 PASS: additive сохранение R0/R1/R2, exact nested roundtrip, rollback, owner/revision/terminal/replay, действительные role grants, optional metadata без DDL, unknown handler новой metadata, HTTP dispatch и SHA-negative включая matching ETag. PGlite использует один leased backend; это не измерение независимых PostgreSQL-сессий или VPS. Для той же storage-проверки подготовлен optional PG17 adapter; его локальный запуск не выполнен. Операторская установка и независимая приёмка готовой сборки принадлежат координатору.

Координатор дополнительно выполнил GitHub CI run37576984668: exact paired-source hash, 43core/HTTP/embedded cases PASS и11storage cases PASS на реальном PostgreSQL17.11. Авторская граница PGlite выше остаётся исторической; CI не является установкой VPS.
