# Last Throne — canonical backend source R2

Эта директория — единственный canonical core/server/db для TD. Web находится в frontend repository `games/last-throne/web`; второй редактируемый core там не создаётся. Ready archives с production dependencies в Git не хранятся.

Общий workspace собирает `deploy/last-throne/assemble.mjs` из back source, front web и распакованного original ready-root. Разработка и проверка выполняются в generated workspace; правки вносятся только в canonical файлы двух репозиториев. Generated source/ready/private env не коммитятся. Оператор первоначальной установки/перехода R0/R1 готовит команды без внешнего исполнения.

Полные команды и границы проверки: [deploy/last-throne/README.md](../../deploy/last-throne/README.md). Исходная README ниже относится к полному исходному R2 workspace, а не к изолированному backend checkout.

# Последний трон — R2

Браузерная tower defence в мире Доты: три линии, десять волн и пять героев — Pudge, Undying, Rubick, Shadow Shaman, Sniper. Постоянная защита: баллиста, магическая башня, тотем замедления. Здания ставятся на квадратные фундаменты, герои — на круглые позиции; строительство подтверждается после цены и preview. Три уровня улучшений, продажа в подготовке, бесплатная перестановка и платный телепорт в бою.

Undying поднимает надгробие и временных зомби; Rubick крадёт последнее реально использованное заклинание командира и применяет лечение/удар/щит; Sniper готовит прицельный выстрел. Командиры приходят на волнах5/10. Модели и магия процедурные Babylon.js/WebGL2, чужих игровых ассетов нет. Баланс требует плейтеста.

Профиль гостевой, привязан к этому браузеру. Есть IndexedDB и серверные межволновые контрольные точки, offline pending/revision/branch и история результатов. Reload посреди боя возвращает к подготовке перед волной. Результат client_reported: сервер не пересчитывает бой для защиты от подмены клиентом. В меню старый R1 открывается на точном retained клиенте и остаётся партией из пяти волн/save2; R2 использует save3.

## Запуск

Нужны Node.js24 и npm:

```sh
npm ci
npm run dev
```

Открыть http://127.0.0.1:4173/td/. Dev создаёт immutable r2-dev-<timestamp>, persistent PGlite в .local/database и хранит сборки в .local/releases. Это локальная разработка; production использует PostgreSQL. БД содержит scalar typed EAV, новые005/006 аддитивны;001–004 неизменны.

Готовая поставка содержит releases/r2-001, exact r1-002/r0-002 и production-зависимости. Для проверки готового клиента:

```sh
RELEASE_ID=r2-001 DEV_RELEASES_DIR=releases npm run dev
```

Проверки:

```sh
npm run typecheck
npm test
npm run test:browser
```

Для browser check нужен установленный Chromium Playwright либо BROWSER_EXECUTABLE_PATH. Стенд этой поставки — Chromium153/Linux/SwiftShader; отчёты не подтверждают FPS пользовательского ПК.

## Размещение и обновление

Целевой сервер общий с первой игрой. Namespace /td, отдельные каталог релизов/БД/API и стабильный gateway с A/B-процессами. Обычная доставка нового совместимого immutable релиза заменяет дочерний API, сохраняя runtime-контейнер и gateway; смена баланса сохраняет и API PID. Откат frontend_only оставляет новый API обслуживать R1/R2 и новые сохранения.

Первый запуск TD использует runtime R2. Если ранее установлен runtime R0/R1, переход семейства требует отдельного обслуживания runtime-verifier; его старый код не знает r2-*. Это ограничение не скрыто обычным switch. Здесь установка на VPS не выполнялась: доступ к серверу не предоставлен. Саму первую игру не меняли.

Инструкции: ops/RUNBOOK-R2.md. Контракты: docs/R2-CONTRACT.md, docs/CORE-R2.md, docs/API-R2.md, docs/DB-R2.md, docs/FRONTEND-R2.md, docs/GRAPHICS-R2.md. Текущий HTTP контракт server/openapi-r2.json. Проверки и ограничения: docs/TEST-REPORT-R2.md и docs/QA-R2.md. Исторические документы R0/R1 относятся к своим сборкам.
