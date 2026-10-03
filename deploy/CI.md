# R2: backend CI и миграционный gate

GitHub Actions `R2 CI` на pull request, push в `main`, `merge_group` или ручной запуск устанавливает lockfile, проверяет типы и контент, запускает API/контрактные тесты и `test:db` на реальном PostgreSQL 18.6 с закреплённым manifest digest. Интеграционные тесты проверяют чистую установку, повторный запуск, переход с более ранней схемы, ограничения БД, checksum drift и реальный backup/restore изолированной схемы. `PG_TEST_CONTAINER` задаёт ID этого временного сервиса: тест запускает штатные `pg_dump`/`pg_restore` PostgreSQL 18 через Docker, затем сравнивает восстановленные данные и журнал миграций. Отсутствие этих инструментов не превращается в успешный skip.

Имя проверки — `R2 verify`. Она не становится required check автоматически. Официальные Actions закреплены полными SHA, Node — `.nvmrc`; токен только `contents: read`, checkout без сохранения credentials, runner одноразовый. PostgreSQL job использует исключительно временный CI пароль; секретов действующего сервера и операции выпуска в workflow нет.

После сборки Docker копирует проверенный `dist`, `contracts`, `content` и `migrations`. Health проверяется в непривилегированном контейнере с read-only filesystem. Отдельный gate запускает migration CLI дважды из упакованного образа на CI PostgreSQL: отсутствие SQL/каталога внутри образа или ошибка повторяемости прерывает выпуск артефакта.

Артефакт `foxy-back-<SHA>-<attempt>` содержит `image.tar.gz`, `image-id.txt`, `source-sha.txt`, `dist.tar.gz` (включая контракт, каталог и SQL) и `SHA256SUMS`. Он полезен для backend-проверки, но для совместной доставки применяется **frontend CI-артефакт**: он закрепляет конкретный backend SHA и содержит оба образа, совместно прошедшие проверки API и каталога. Образы продвигаются по неизменяемым ID, без пересборки.

Локально:

```sh
npm ci
npm run typecheck
npm run validate:content
npm test
# Только адрес тестовой PostgreSQL 18:
DATABASE_URL=postgresql://user:password@localhost:5432/test npm run test:db
```

Реальный VPS rollout и наблюдение runtime выполняет оператор по `1stFoxyGame-front/deploy/STAGING-R2.md`. Успешный CI подтверждает проверенную сборку, но не публичный HTTPS, текущую production-версию или поведение реального телефона.

Источники: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [метаданные PostgreSQL образа](https://github.com/docker-library/repo-info/blob/master/repos/postgres/remote/18.6-bookworm.md).
