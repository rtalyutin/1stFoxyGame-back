# FoxyGame backend — Runner R5

Мастерская с ручным заработком, четырьмя производствами, постоянными улучшениями и офлайн доходом до восьми часов. Серверный профиль, вход в заранее выданный аккаунт, пересчёт боя, магазин, крафт, экипировка, улучшения и расходники. Кошелёк, имущество, награды и снимок записываются транзакционно в PostgreSQL 18. Публичной регистрации нет.

## Запуск

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run validate:content
```

Задать ровно одно из `DATABASE_URL` и `DATABASE_URL_FILE`, применить миграции владельцем схемы, затем `npm start`. Приложение не переходит на память при сбое БД. `MemoryRepository` используется только явным тестовым внедрением. По умолчанию `HOST=127.0.0.1`, `PORT=3001`; файл `.env` автоматически не загружается.

`npm run test:db` требует отдельную PostgreSQL 18 и средства `pg_dump`/`pg_restore` либо `PG_TEST_CONTAINER`. Тесты создают уникальные схемы; отсутствие БД является ошибкой. Не запускать на рабочей БД.

## Контракт и доступ

Машинный контракт: [OpenAPI](contracts/openapi.json). Правила и принятые начальные настройки: [R3/R4](docs/r3-r4.md), [R5](docs/r5.md).

Рабочие маршруты с префиксом `/api/v1`: `/auth/login`, `/auth/logout`, `/session`, `/profile`, `/economy/catalog`, `/workshop`, `/run`, `/operations` и `/operations/:operationId`. Session привязывает приватные чтения и записи к аккаунту; изменения требуют same-origin JSON и CSRF. `/api/v1/health` и `/healthz` проверяют процесс. `/readyz` проверяет БД и требуемую схему; при сбое отдаёт 503. Контейнерная healthcheck использует readiness.

Аккаунт создаётся контролируемой миграцией идентичности: стабильные UUID/login в PR, credential-файл вне репозитория. `dist/profile/hash-cli.js` готовит защищённый файл хэшей; `provision-cli.js --file` применяет его идемпотентно без сброса имущества или пароля; `password-cli.js --rotate --file` отдельно меняет пароль и отзывает сессии. Нет account-create HTTP endpoint.

## Хранение и доставка

Аккаунт, профиль, экземпляры и сборки хранятся в типизированном конструкторе `entities/entity_parameters/entity_parameter_values`. Сессии, receipts и снимки — технические таблицы. Золото — целая строка тысячных долей, расчёты — BigInt. Награды определяет сервер после пересчёта кадров; клиент передаёт только ввод.

Одинаковый operationId и тело возвращают прежний результат; изменённое тело отклоняется. Revision и активный клиент проверяются в транзакции. Takeover явный, offline не симулирует бой. Повреждённый snapshot можно завершить без потери имущества.

CI проверяет настоящую БД, повтор миграции, runtime grants, создание аккаунтов, откат неудачной операции и восстановление копии. Парный frontend CI закрепляет backend SHA, сравнивает каталоги и код симуляции, запускает оба контейнера с БД и выпускает один комплект. Production rollout не объявляется выполненным по CI. Инструкция поставки — в парном frontend `deploy/R3-R4.md`.

Прежние R1/R2 документы сохранены как история. Новая графика и видимая экипировка исключены указанием пользователя.

## СЪЕЗЖАЕМ! — R1

Соответствующая часть второй игры находится в [games/syezzhaem](games/syezzhaem/README.md). Это отдельный Node.js-проект; команды и контейнер первой игры в корне сохраняются. Размещение кода в репозитории не устанавливает игру на VPS.


## Runtime Runner balance

`GET /api/v1/balance` previews the active balance for the next run. The separate frontend `/admin/balance/` editor uses authenticated `GET` / `PUT /api/v1/admin/balance`; a PUT supplies the complete `values` map and `expectedRevision`. Existing sessions, same-origin JSON and `X-CSRF-Token` are required. An account also needs an explicit `balance-admin` privilege; no account receives it automatically.

After a one-time paired frontend/backend installation and additive migration `005-balance.sql`, balance publication needs no rebuild or process restart. All 157 supported scalar combat, shop, equipment, recipe, consumable and reward settings live as typed constructor parameters in immutable revisions. One pointer changes atomically; stale publication returns 409 and unavailable/corrupt storage returns 503. New runs pin the selected revision, including shop prices, reward tables and consumable effects. Existing and saved runs retain their rules after publication, pause, restore and process restart. Legacy `r34.1` runs and historical receipts retain the original economy and shop schedule; new `r34.2` snapshots carry the selected runtime settings. Shops initially appear after each 250 metres of forward progress; the merchant still appears ahead by `spawnDistance` (36 metres initially).

Use the migration owner to assign or revoke the chosen existing account's privilege, after building the backend:

```sh
npm run balance:admin -- grant ACCOUNT_UUID
npm run balance:admin -- revoke ACCOUNT_UUID
```

Set exactly one of `DATABASE_URL` or `DATABASE_URL_FILE`; keep the owner connection out of the running app. The runtime role cannot grant itself this privilege. Apply the updated `src/profile/runtime-grants.sql` after migration. Compose installations can override the existing migration service command with `node dist/balance/admin-cli.js grant ACCOUNT_UUID`, reusing its protected owner URL file. No account has been assigned by this change.

Drain old backend writers before the initial migration and install the matching frontend/backend pair. The database writer protocol blocks old app mutations of run rows; this compatibility guard is not an authorization mechanism. Do not roll back to an old image after adopting the new run format without a compatible restoration plan. To undo a balance change, publish the previous values as a new revision; existing runs keep their original pin. This repository change has not been deployed to a server.
