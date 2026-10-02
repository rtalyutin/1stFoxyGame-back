# R1: проверка и артефакт (back)

Конвейер GitHub Actions `R1 CI` выполняет `npm ci`, проверку типов, тесты, сборку и smoke-тест контейнера для одного SHA. Node.js зафиксирован в `.nvmrc`, npm-зависимости — в `package-lock.json`. Контейнер копирует уже проверенный `dist`; при доставке JavaScript повторно не собирается.

Триггеры: любой pull request, push в `main`, merge queue (`merge_group`) и ручной запуск. Имя итоговой проверки — `R1 verify`. Настройка required check в правилах репозитория выполняется отдельно после первого успешного запуска; наличие файла workflow само по себе её не включает.

Все Actions закреплены полными SHA официальных репозиториев. Разрешение токена — только `contents: read`; токен не остаётся в git config, npm cache выключен, секретов и шагов публикации нет. Код PR исполняется на одноразовом GitHub-hosted runner. PR-артефакт предназначен для проверки; автоматического продвижения PR-артефакта в рабочую среду нет.

Артефакт `foxy-back-<SHA>-<attempt>` хранится 14 дней и содержит:

- `image.tar.gz`: готовый Docker-образ;
- `image-id.txt`: неизменяемый локальный SHA256 ID образа;
- `source-sha.txt`: проверенная Git-ревизия;
- `dist.tar.gz`: собранное приложение;
- `SHA256SUMS`: контрольные суммы файлов.

Скачанный артефакт проверяется `sha256sum -c SHA256SUMS`, загружается `docker load -i image.tar.gz`; фактический ID проверяется через `docker image inspect`. Сохраните выбранную пару front/back и их манифесты до истечения срока хранения. Порядок запуска и отката пары находится в `1stFoxyGame-front/deploy/STAGING.md`.

## Локальная проверка

```sh
npm ci
npm run typecheck
npm test
npm run build
docker build --build-arg SOURCE_SHA=local --tag foxy-back:local .
```

Dockerfile рассчитан на готовый `dist`, поэтому запуск сборки контейнера до `npm run build` должен завершиться ошибкой. Локальная успешная проверка не означает, что GitHub Actions уже выполнился. Само создание CI-файла также не означает наличие доступного staging.

## Обновления инструментов

Версии `.nvmrc` и Node в Dockerfile бэка меняются согласованно. Базовые образы закреплены версией и manifest digest, проверенными через официальный Docker Hub API. В staging продвигается уже собранный образ по ID. Обновление базового образа выполняется отдельным PR с повторной проверкой; незаметного перехода на новый digest при доставке нет.

Официальные справки: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data), [Node.js releases](https://nodejs.org/en/about/previous-releases).
