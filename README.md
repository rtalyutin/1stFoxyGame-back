# 1stFoxyGame backend — R1

Первый боевой прототип: работающий API доступности и контракты для следующих серверных релизов. TypeScript, Fastify 5, Node.js 24.19.0. Базовая схема конструктора PostgreSQL 18 и её миграции вводятся в R2; аккаунты, профиль и экономика — в R3. В R1 база ещё не подключена.

Основание: `Runner-Forge-GDD-TZ-v1.0.md` и задачи B01–B04 согласованного `Runner-Forge-Release-Plan.xls`; уточнения 2026-10-02: игра требует сеть, аккаунты создаёт владелец миграциями через PR, регистрации нет. Графика готовится отдельно.

## Запуск

```sh
npm ci
npm run build
npm start
```

По умолчанию `127.0.0.1:3001`. Для контейнера задайте `HOST=0.0.0.0`. `PORT` допускает целое число 1–65535. `.env.example` документирует настройки; приложение получает переменные из окружения и не загружает `.env` автоматически.

Для разработки `npm run dev`. Для проверки `npm test` и `npm run typecheck`. Сборка создаёт `dist/`; приложению также нужен каталог `contracts/`. Не добавляйте `.env`, `node_modules` или `dist` в Git.

## Действующий API

`GET /api/v1/health` (алиас `GET /healthz`) возвращает:

```json
{"status":"ok","apiVersion":"1","serverTime":"2026-10-02T14:47:21.000Z"}
```

Ответ всегда `Cache-Control: no-store`. Это проверка процесса API, не проверка базы или игровой сессии. R1 не требует входа: интерфейс логина и реальные аккаунты идут в R3. Все будущие маршруты, включая регистрацию, возвращают 404.

Фронт обращается к `/api/v1/health` через свой origin: Vite proxy локально, reverse proxy в среде. Произвольный CORS не включён. Детали сетевой паузы, доверия, будущих сессий и транзакций: [architecture.md](docs/architecture.md). Целевой типизированный конструктор: [data-model.md](docs/data-model.md).

Единственный машинный HTTP-контракт — [openapi.json](contracts/openapi.json). Его `paths` содержат работающие маршруты. `x-planned-paths`, `x-release: R3`, `x-implemented: false` описывают проектные контракты следующих релизов; наличие схемы не означает реализацию.

## Проверки

`test/app.test.mjs` проверяет действующий health через Fastify inject, формат времени и отсутствие кеширования, отсутствие будущих API и регистрации, безопасный ответ на повреждённый JSON, корректность OpenAPI и отклонение неправильных будущих payload. Это локальные авторские проверки. Интеграционные проверки базовой схемы PostgreSQL и миграций выполняются при реализации R2; авторизации и конкурентных экономических транзакций — в R3. Сейчас эти возможности только спроектированы.

## Источники выбора

Проверены 2026-10-02: [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html), [PostgreSQL constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html). Конкретные зависимости закреплены в `package-lock.json`.
