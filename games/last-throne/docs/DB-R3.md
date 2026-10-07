# Typed EAV хранения R3

Контракт `r3/1`: `docs/R3-CONTRACT.md`, SHA-256 `0562c4fa5d278e797e163c8ac419b2bfb60efb907c2923c98182c5971690bb13`. Область: рабочая копия `last-throne-r3`, новые SQL007/008 и R3 runtime. SQL001–006, старые core/seed/metadata и готовые каталоги выпусков не изменяются.

`007_r3_persistence.sql` добавляет domain/content-типы revision3 с новыми UUID, bounded `r3_*` операции и R3 publication guards. `player_profile` остаётся исходным revision1, сессии и settings общие. Technical guest_sessions/run_client_keys/save_operations не дублируются. R1/R2 SQL bodies и принятые операции сохраняются; `db/game-store-r3.mjs` выбирает точные retained storage/validators или R3 по immutable pins. Общий список содержит собственные save2/save3/save4 партии.

`008_r3_catalog.sql` публикует `r3-meta-1` и 151 scalar entity из `core/content-r3.ts`: map, side path, пять героев, три здания, enemy roles, spells, четыре item handlers, три expedition definitions, 15 волн. Обычный `scripts/migrate.mjs` применяет всё; API не занимается seeding. `db/build-r3-persistence.mjs` и `db/build-r3-seed.mjs` — authoring helpers для ещё не опубликованной SQL007/008. После применения/публикации эти файлы не регенерируются; следующие изменения получают новую миграцию.

| Объект | SHA-256 |
| --- | --- |
| Metadata r3-meta-1 | `640fc515352132bff283d2dd3b5737cbfcf04cc3de1f4664b49b82039c9d935d` |
| Projection r3-content-1 | `6709321a18dadc7249bac548b848f4460557940faea9b056372e041913b5a7b5` |
| SQL007 | `48ac723e26dae84f8ca094cfe0d1ebc6fe747fc93672925de68f38151a0d1bfc` |
| SQL008 | `94309610338aa916f2b7c4d0f85aebbfe616bbe6742fa18adab478ce8c74b5e7` |
| game-store-r3.mjs | `b2371928c50e7976702bc72b1e2af7dfa54faedb247f0322025fbfe339c03e27` |
| content.mjs | `78aaa48bb8126f415ce1153f1a9f4dc35c74c267f1c6c41ad102ad1937e96491` |
| r3-runtime-grants.sql | `83e62ebf0c18281e0c0709cd1763aaea9250348c611587415f91416e4893d2b7` |

Domain values live in typed scalar/reference columns. JSON is a transport/reconstructed DTO and technical operation response, not an authoritative saved-state blob. Каждый checkpoint — новое поколение с saved_hero/saved_building и nested entities. Все дети, ссылки и root замораживаются вместе; только затем изменяются pointer/revision и журнал операции. Ошибка любого ребёнка откатывает всё. Старые поколения сохраняются.

| DTO R3 | EAV представление | Ссылки и порядок |
| --- | --- | --- |
| hero.items | Две hero_item_slot, required slot integer0/1; optional definition | saved_hero.item_slots multiple ordinals0/1, same_checkpoint; definition pinned_release; отсутствие definition означает null |
| hero.expedition | Nullable saved_expedition с kind, remaining_ticks, total_ticks, reward_id | Ссылки checkpoint/hero same_checkpoint; expedition definition pinned_release |
| hero.aegisToken | Required boolean aegis_token | Значение конкретного saved hero |
| pendingRewards | Отдельный pending_reward с runtime_id, kind=shop | checkpoint.pending_rewards multiple; bound hero same_checkpoint; options ordered multiple item_definition refs pinned_release |

SQL проверяет полные pins, seed, обязательность, scalar типы, distinct IDs/anchors/pads, item compatibility/handler uniqueness, two slots, count≤1 expedition/reward, duration и remainingTicks, exact ordered shop options и owner refs. Закреплённый core validator дополнительно проверяет HP/cooldown/цены/unknown DTO fields в той же leased SQL-сессии после replay. Пустые item_1..4 у non-shop допустимы; у shop допустимы 1–4 известные уникальные предложения. Unknown spell/item handlers блокируют публикацию любого content с r3-core-1 compatibility, включая новые metadata revisions. Новый optional parameter создаётся новым type revision/parameter IDs без DDL доменной таблицы; старые определения неизменны.

R3 terminal result требует финальную волну15 или корректную defeat-активную волну. Seed/core/content/metadata совпадают с run, HP ограничен pinned throne HP. Все ресурсы и четыре statistics — scalar параметры; required client_reported=true отмечает клиентское происхождение. Result и терминальный status/revision фиксируются атомарно; checkpoint не обязателен.

Запись удерживает одну сессию, transaction advisory lock8411201 и run row lock. Lock_timeout5s/statement_timeout15s ограничивают работу. Exact replay сначала читает scoped журнал, затем новая операция проверяет status/revision и вызывает validator(run,client). Запрещён повторный pool.query внутри validator при pool.max=1. Последняя generation.revision и текущая runRevision сообщаются отдельно. Глобальная EAV-блокировка сериализует записи этого приложения; ёмкость на VPS требует измерения.

После миграции migration owner применяет `db/r3-runtime-grants.sql` для отдельного API-role NOSUPERUSER/NOINHERIT/non-owner:

```sh
psql "$TD_DATABASE_MIGRATION_URL" -v api_role=last_throne_api -f db/r3-runtime-grants.sql
```

В allowlist восемь content/EAV/metadata таблиц SELECT и именованные bounded R1/R2/R3 операции. Нет table DML, generic helpers, публикации, технических auth/operation/migration чтений и автоматических прав будущих объектов. Старые grant files и архивные runtime не меняются. Schema owner выделен только для Last Throne; credentials и schema первой игры не используются.

Проверки 07.10.2026, Node24.19.0/PGlite0.5.8:

```sh
node --test tests/database-r3-storage.test.mjs tests/server-r3-http.test.mjs
```

18/18 PASS. Storage suite сначала применяет SQL001–006, создаёт R1/R2 checkpoint, затем применяет 007/008 и сравнивает published projections, metadata, checksums, function bodies, profile и старые accepted replay. Проверены deepEqual nested R3 snapshots, immutable closure, negative refs/values/unknown future handler, no-DDL optional publication, failed-generation rollback, competing calls, terminal15, role grants и actual EAV tamper SHA rejection. HTTP проверяет все version families, owner, replay/finish, safe errors, matching ETag hash refusal и machine OpenAPI.

PGlite сериализует один backend. Тот же storage test поддерживает node-postgres max4 и реальные независимые сессии:

```sh
TD_TEST_DATABASE_URL='<URL свежего выделенного PostgreSQL17 td_db>' node --test tests/database-r3-storage.test.mjs
```

Перед любым DDL адаптер требует current_database()=td_db и отсутствие last_throne.entities. Он отказывается от существующей базы, не очищает её и не обращается к первой игре. URL не выводится. CI-сервис одноразовый; local real PG run не выполнен. Эта подготовка не означает выполненную проверку VPS, multi-session races, backup/restore или deployment.

Передача `FEATURE_HANDOFF/1`, digest текущего docs/FEATURE_HANDOFF-1.md `880ed9d2dc0004f39250f4a5c3739840cc1f9c4b37edf78b652dc787f5aa44e4`: feature_id=last-throne-r3, contract_revision=r3/1, producer=/root/database, consumer=/root, artifact_revision=hashes выше; author gate PASS, evidence_status=EXECUTED, action_decision=CONTINUE, hypothesis_assessment=NOT_ASSESSED, external operation NOT_STARTED. Next: freeze/immutable bundle, independent QA и отдельный CI PostgreSQL17. Координатор владеет единственным TASK_STATE.
