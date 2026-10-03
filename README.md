# 1stFoxyGame backend — R2

R2 добавляет проверяемый каталог стрелка/босса, типизированный конструктор PostgreSQL 18 с миграциями и внутренний протокол событий забега. TypeScript, Fastify 5, Node.js 24.19.0. Аккаунты, авторизация, профиль и экономика остаются R3. HTTP-процесс R2 читает проверенный каталог из версии приложения и не получает доступ к БД; миграционный контейнер выполняется отдельно.

Основание: `Runner-Forge-GDD-TZ-v1.0.md`, B05–B07 согласованного `Runner-Forge-Release-Plan.xls` и ACTIVE_CONTRACT в парной front-ревизии; уточнения: герой погибает от одной пули, сильный крип — от одного хука, босс — от трёх разных попаданий. Аккаунты создаёт владелец миграциями через PR, регистрации нет.

## Запуск

```sh
npm ci
npm run build
npm start
```

По умолчанию `127.0.0.1:3001`. Для контейнера задайте `HOST=0.0.0.0`. `PORT` допускает целое число 1–65535. `.env.example` документирует настройки; приложение получает переменные из окружения и не загружает `.env` автоматически.

Для разработки `npm run dev`. Проверки: `npm test`, `npm run typecheck`, `npm run validate:content`. Сборка создаёт `dist/`; пакету также нужны `contracts/`, `content/`, `migrations/`. Не добавляйте `.env`, `node_modules` или `dist` в Git.

## Действующий API

`GET /api/v1/health` (алиас `GET /healthz`) возвращает:

```json
{"status":"ok","apiVersion":"1","serverTime":"2026-10-02T14:47:21.000Z"}
```

Ответ всегда `Cache-Control: no-store`. Это проверка процесса API, не проверка базы или игровой сессии. `GET /api/v1/catalog` отдаёт проверенный снимок [catalog.json](content/catalog.json) с `catalogVersion: r2.1` и `rulesVersion: r2.1`. Клиент сверяет версии и параметры своей сборки перед новым забегом. R2 не требует входа: интерфейс логина и реальные аккаунты идут в R3. Все будущие маршруты и регистрация возвращают 404.

Фронт обращается к `/api/v1/health` через свой origin: Vite proxy локально, reverse proxy в среде. Произвольный CORS не включён. Детали сетевой паузы, доверия, будущих сессий и транзакций: [architecture.md](docs/architecture.md). Целевой типизированный конструктор: [data-model.md](docs/data-model.md).

Единственный машинный HTTP-контракт — [openapi.json](contracts/openapi.json). Его `paths` содержат работающие маршруты. `x-planned-paths`, `x-release: R3`, `x-implemented: false` описывают проектные контракты следующих релизов; наличие схемы не означает реализацию.

## Конструктор и проверки

На отдельной PostgreSQL 18: `npm run build`, затем `npm run db:migrate`. Установите ровно одну переменную `DATABASE_URL` или `DATABASE_URL_FILE` (файл с URL). Миграционный пользователь владеет схемой; HTTP-контейнер R2 не получает этот секрет. Миграции транзакционные, сериализованы advisory lock и проверяют checksum уже применённых файлов. Применённые миграции не редактируются.

`npm run test:db` требует `DATABASE_URL` тестовой БД и PostgreSQL 18. Тесты создают и удаляют только уникальные `foxy_test_*` схемы. Для настоящего backup/restore нужны PG18 `pg_dump`/`pg_restore`: переменные `PG_DUMP_BIN`/`PG_RESTORE_BIN` либо `PG_TEST_CONTAINER` с ID тестового Docker-контейнера PostgreSQL. Отсутствие БД/инструментов — ошибка, не пропущенный PASS. Не запускать тесты на production.

HTTP, каталог, OpenAPI и внутренний owner-scoped RunLedger проверяются `npm test`. DB fixtures отдельно проверяют ограничения самой PostgreSQL, повтор/upgrade/checksum миграции, rollback частичного DDL, конкурирующую уникальность и настоящее восстановление dump. Это авторские проверки; результат независимой QA и CI относится к указанной ревизии. Пределы R2 и соответствие задачам: [r2.md](docs/r2.md). Авторизация и экономические транзакции ещё не реализованы.

## Источники выбора

Проверены 2026-10-02: [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html), [PostgreSQL constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html). Конкретные зависимости закреплены в `package-lock.json`.
