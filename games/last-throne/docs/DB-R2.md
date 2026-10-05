# Хранение партий R2

Основание: `docs/R2-CONTRACT.md`, контракт r2/1, SHA-256 `02556ff217ded0abef235fce435e936e8ffce581c3411dfac06ab76008631168`. Изменения ограничены рабочей копией `last-throne-r2`. SQL001–004, опубликованные R1/R0 и каталоги готовых выпусков сохраняются.

## Совместимость

| Данные | R1 | R2 |
| --- | --- | --- |
| Core | `r1-core-1` | `r2-core-1` |
| Metadata | `r1-meta-1` | `r2-meta-1` |
| Начальный content | `r1-content-1` | `r2-content-1` |
| Snapshot | 2 | 3 |
| Герои / здания / волны | 2 / 2 / 5 | 5 / 3 / 10 |
| Профиль и гостевая сессия | Общие bounded-функции R1 | Те же профиль и сессия |

Новые domain/content-типы имеют `schema_revision=2` и отдельные UUID. В `r2-meta-1` включён исходный `player_profile` revision1: настройки пользователя общие, опубликованные параметры R1 не изменяются. SQL-функции `r1_*` остаются исходными; новое приложение выбирает их для R1. Партии не преобразуются из snapshot2 в snapshot3.

`createGameStore(pool)` сохраняет сигнатуры всех методов. `createRun(owner,payload,pins)` выбирает R1/R2 по полному core/metadata/save tuple и проверяет published content в SQL. Для существующей партии предварительное чтение только её принадлежащей владельцу неизменяемой metadata выбирает семейство операции; authoritative gate затем блокирует строку партии и проверяет replay. Полный сохранённый tuple проверяется до нового semantic validator. `getRun` и `getCheckpoint` используют соответствующее семейство, `listRuns` вызывает bounded `r2_list_runs`: общий список обоих форматов, 20 записей, курсор `(created_at,id)`.

## Миграции и содержимое

`005_r2_persistence.sql` добавляет новые типы domain, параметры, функции и уникальный индекс результата R2. Technical-таблицы `guest_sessions`, `run_client_keys`, `save_operations` остаются общими. SQL-trigger `r2_known_spell_handlers` запрещает публикацию R2 без всех трёх известных spell definitions, с повторным или неизвестным `behavior_id`, либо с несовпадающим `code`.

`006_r2_catalog.sql` добавляет полный scalar-каталог из 88 записей `core/content-r2.ts`. Обычный `node scripts/migrate.mjs` применяет его без дополнительного seeding при старте API. Компилятор `node db/build-r2-seed.mjs` предназначен для подготовки новой ещё не опубликованной SQL006; опубликованный файл больше не регенерируется. Он использует свежий PGlite, SQL001–005, stable UUID и `seedR2`, сначала проверяет EAV projection через core parser, затем публикует и проверяет canonical SHA-256 фактического SQL projection.

У обычных врагов `spell_1/2/3=''` допустимы. Для этих полей metadata enum включает пустую строку и три известных ID. В `spell_definition.code/behavior_id` и `saved_hero.stolen_spell` допустимы только `area_heal`, `area_strike`, `temporary_shield`. У R2 content entity revision2; projection schemaVersion остаётся 1, это отдельная версия формата контентного DTO.

Зафиксированные hashes:

| Объект | SHA-256 |
| --- | --- |
| Metadata `r2-meta-1` | `1c6450e874b7b31b2075122e97701dc737e926ee24205715b1ffc3fcd7edfa12` |
| Projection `r2-content-1` | `f4cb8ef36a5e12d1c6e83902bff2227425cff313dbcf529f6a195360ccbbe9ed` |
| SQL005 | `4a501f6d1aff5f6e5270e1aeac7ce95183c2d71cdcd48752d393293890c8d798` |
| SQL006 | `55ba4704ea5746a314b8b2f75eeb353aa37004c479bf2428d0d9bb06ae151193` |
| Runtime grants | `7257167435e3260b873d2c454163e3d3f2b0fdbf4da8b52aa2df7cd30ab79815` |

## Снимки и завершение

Каждый snapshot создаёт новый typed `checkpoint` и отдельные `saved_hero`/`saved_building`. Все значения записаны в соответствующие scalar-колонки EAV; JSON снимка используется только как вход SQL/API и восстанавливаемый DTO. Источником сохранённого состояния JSON blob не служит. Ссылки на definitions указывают в pinned content, ссылки generation/children имеют policy `same_checkpoint`, указатель партии — `same_run`.

В каждом SavedHero R2 сохранены исходные поля R1 и три новых:

| Поле DTO | Параметр EAV | Правило |
| --- | --- | --- |
| `stolenSpell` | `stolen_spell` text, optional | `null` — отсутствие scalar-строки; чтение возвращает JSON null. Строка — один из трёх известных ID |
| `stealCooldown` | `steal_cooldown` integer, required | Неотрицательный; для остальных героев 0 |
| `priority` | `priority` text, required | `nearest`, `strongest`, `commander`; для остальных героев `nearest` |

Три поля обязательны во входном DTO всех пяти героев. Наличие spell/cooldown у героя кроме Rubick и специального priority у героя кроме Sniper отвергается. SQL проверяет типы, обязательность, уникальные IDs/anchors/pads, pinned tuple, seed и диапазон волн. Дополнительные bounds HP/cooldowns/цен/позиций и неизвестные transient-поля проверяет выбранный core validator API на том же leased SQL-client перед записью. Неполный ребёнок, плохая ссылка или значение откатывает всю generation, указатель, revision и technical operation.

После проверки generation и её дети замораживаются вместе, затем меняется current checkpoint и revision партии. Старые поколения сохраняются. `getCheckpoint` возвращает `revision` принятой generation и отдельно `runRevision` текущей партии: после finish эти значения различаются.

`finish` проверяет результат по pinned content: victory только на финальной волне 10, `lastCompletedWave=10`, HP положительный и не выше content throne HP; defeat с нулевым HP, `wave=lastCompletedWave+1` в пределах 1–10. Seed/core/content/metadata обязаны совпасть с партией. Сохраняются outcome, wave, lastCompletedWave, simTick, gold, throneHp, seed, versions и четыре statistics. Typed `client_reported=true` обязателен: это клиентский результат, не серверная проверка прохождения. Результат уникален на партию; результат и терминальная партия замораживаются атомарно. Исходные R1 bounds 5 волн остаются прежними.

## Транзакции и повтор запросов

Все checkpoint/finish выполняются на одном leased connection с transaction, `lock_timeout=5s`, `statement_timeout=15s`. Gate сначала получает глобальный advisory lock 8411201, затем row lock партии и проверяет owner. Технический ключ `(owner_id,run_id,request_id)` общий для checkpoint и finish. Точная принятая операция возвращает сохранённый ответ до terminal/revision/semantic проверок; другой canonical hash с тем же ID даёт `IDEMPOTENCY_CONFLICT`. Новый запрос затем проверяет status, ожидаемую revision и параметры, вызывает core validation, записывает typed generation/result и technical ответ в одной транзакции.

Canonical hash передаёт API. Формула R1 не изменяется; новое приложение сохраняет возможность повторить старый принятый request/hash после миграции. Один и тот же ID, использованный в checkpoint и finish с различающимися телами, конфликтует. Совпадающие повторы не вызывают lazy snapshot validator повторно. Callback `(run,client)` получает уже заблокированную партию и тот же SQL connection: чтение content не требует второго connection при `pool.max=1`.

Глобальная блокировка сохраняет порядок существующего typed EAV. Она сериализует все domain-записи; предел пропускной способности на VPS не измерен.

## Права приложения

`db/r2-runtime-grants.sql` заменяет старые blanket/default SELECT и EXECUTE allowlist. Его применяет отдельный migration/schema owner после миграций, например:

```sh
psql "$TD_DATABASE_MIGRATION_URL" -v api_role=last_throne_api -f db/r2-runtime-grants.sql
```

API-role — выделенный non-owner, NOSUPERUSER, NOINHERIT. Он получает SELECT только на восемь EAV/content/metadata таблиц для trusted серверного content reader и выбора семейства партии. End-user owner определяется гостевой сессией API, а не параметром от клиента. EXECUTE разрешён только на именованные bounded guest/profile/run/list/gate/checkpoint/finish functions R1/R2. Прямые записи EAV/config/metadata, generic helpers, publication и чтение guest token hashes, creation keys, save operation history, migration records и будущих таблиц не разрешены. Global default PUBLIC EXECUTE снимается для выделенного schema owner; права будущих helper functions проверены.

## Проверки и передача

Авторская проверка Node24/PGlite0.5.8/Fastify5.12.5 выполнена 04.10.2026:

```sh
node --test tests/r2-db-api-storage.test.mjs tests/r1-database.test.mjs tests/r1-api.test.mjs tests/r2-db-api-http.test.mjs
```

39/39 PASS. Storage suite сначала создаёт profile/R1-party/checkpoint на SQL001–004, затем применяет SQL005–006 и сравнивает исходные published R0/R1 projection, metadata, миграционные checksums и `r1_*` function bodies. Проверены старый принятый replay и продолжение R1, mixed history, typed roundtrip пяти героев и трёх зданий, nullable slot, unknown/default violations, rollback, owner isolation, competing revisions/replay, wave10 finish, client provenance и действительный grant file. Из legacy test изменено только ожидаемое число всех миграций 4→6.

Это author verification конкретных SQL/API bytes. PGlite pool сериализует single backend leases: проверка competing calls подтверждает последовательные конфликты и replay, не независимые PostgreSQL sessions. VPS throughput, PostgreSQL multi-session race и установка на сервере не проверены; внешние операции не выполнялись. Отдельная независимая приёмка готового R2 относится к координатору.

Handoff: `FEATURE_HANDOFF/1`, digest `aa1cfed01fce21493e11f57235c6efa1f4b4895bb2b1c9b571ae0683956f3750`; `feature_id=last-throne-r2`, `contract_revision=r2/1`, producer `/root/database/r2_store`, consumer `/root/database`; `evidence_status=EXECUTED`, storage author gate `PASS`, `action_decision=CONTINUE`, `hypothesis_assessment=NOT_ASSESSED`, external operation `NOT_STARTED`. Artifact revision — hashes таблицы выше и `db/game-store.mjs` SHA-256 `630ed4ef7273ed52f6c857d12335005991a732760f3d0cd9578e585b697d5ef1`. Next: immutable R2 bundle и independent QA; coordinator owns единственный TASK_STATE.
