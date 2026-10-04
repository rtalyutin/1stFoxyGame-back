# СЪЕЗЖАЕМ! — backend R1

Fastify API, Better Auth, PostgreSQL, типизированный EAV/RLS, активный забег, CAS, дедупликация команд, профиль, история и recovery. Frontend находится в `rtalyutin/1stFoxyGame-front`, в таком же каталоге `games/syezzhaem`.

Это отдельный проект. Выполняйте команды из `games/syezzhaem`, а не из корня первой игры. Node.js 24 и Python 3:

```sh
npm ci
npm run check
npm test
```

Интеграционные тесты запускают disposable настоящий PostgreSQL из `embedded-postgres`. На обычном Linux используйте пользователя без root. Ограниченный тестовый UID shim из `tests/data-pg-uid-shim.c` предназначен только для контейнера QA; он не входит в production-конфигурацию. Тесты поставки используют локальные fixtures, а не целевой VPS.

Миграция — отдельный операторский шаг. После создания минимальных LOGIN-ролей задать отдельные `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `AUTH_DATABASE_URL` и применить `npm run migrate`; HTTP startup не выполняет DDL. Схемы `syezzhaem` и `syezzhaem_auth` отделены от первой игры. Runtime не может быть superuser, BYPASSRLS или наследовать владельца таблиц.

API: `AUTH_ORIGIN` — точный origin игры, `AUTH_SECRET` — постоянный секрет от 32 символов. Production требует HTTPS, `SMTP_HOST`, `SMTP_FROM` и параметры SMTP, а также проверенный `SYEZZHAEM_RELEASE_ROOT`, общий с nginx. Секреты хранить вне Git. Локальный режим можно явно включить через `NODE_ENV=development`, `AUTH_MAIL_MODE=file`, `AUTH_MAIL_DIRECTORY`.

```sh
node --env-file=.env --import tsx server/index.ts
```

API слушает loopback, порт по умолчанию 8091; префикс `/api/syezzhaem/`. Клиентские файлы собираются в frontend-проекте. По запросу для локальной статической раздачи копируйте готовый frontend `dist/` сюда. Production публикация использует immutable release root; инструкции и blue-green находятся в [deploy/README.md](deploy/README.md). Frontend-команды этого документа выполняются в парном frontend, backend-команды — здесь. Корневые контейнер/CI первой игры не переключаются на эту игру.

AT-36 — отдельный интеграционный тест двух настоящих API-процессов после потери ACK. Сначала собрать frontend и скопировать его `dist/` в этот проект, затем:

```sh
npm run test:api-update
```

Нормальный `npm test` проверяет сервер и общую симуляцию без зависимости от frontend build. `test:api-update` проверяет общую БД/сессию и прежний запрос между двумя процессами на текущем контракте; это не проверка неизвестного будущего кода, nginx или VPS.

Общие `src/contracts.ts`, `core.ts`, `snapshot-v1.ts`, `r1-contracts.ts` и `public/content/` побайтово совпадают с frontend. Их SHA-256 и исходного полного пакета записаны в `source-provenance.json`. В общей исходной приёмке были 74 Node-теста и 14 браузерных сценариев PASS. VPS, настоящий SMTP и физический телефон не проверены. Полные ограничения — [README-R1.md](README-R1.md).
