# Проверка технического R0

Версия: `r0-002`, 4 октября 2026. Исходный inventory SHA256: `62ab2127e3c88f1d76b530beb9e7d4e34b44a1df531b07d748a9573290e6227a`. В release manifest — 2200 файлов с индивидуальными SHA256. Готовая поставка отдельно сверена независимым QA с runtime-исходниками.

## Локальные результаты

- `npm run typecheck`: PASS.
- `npm test`: 47 тестов, 46 PASS, 1 SKIP, 0 FAIL. SQL исполняется в PGlite (PostgreSQL/WASM), HTTP и A/B выполняются реальными Node-процессами.
- EAV: типы, ровно одна колонка, кратность/ordinal, required, ограничения и границы ссылок, immutable публикации, новые версии, права читающей роли, точные seed hashes и SQL-транзакции.
- API: реальная связь с EAV, old/new pins на разные версии контента, валидация клиента, несовместимость R1 и безопасные ошибки недоступной БД.
- Доставка: полный inventory, изменённый/добавленный/удалённый файл, symlink/traversal, сохранение gateway PID, A/B drain, ошибки hash/migration/readiness, закрытая блокировка, content-only API PID, pair/frontend_only и journal recovery до/после commit.
- `tests/browser-smoke.mjs`: PASS на готовом `r0-002`, Chromium 153.0.8010.0. Проверены настоящий launcher, реальные ответы API/EAV, ошибка и повтор, 1440×900/390×844, отсутствие горизонтального переполнения, unavailable release, движение кольца и reduced-motion. Применён npm-пакет Chromium вместо недоступной CDN-загрузки стандартного браузера Playwright. JSON-доказательство: `docs/browser-report.json`; screenshots: `docs/r0-desktop.png`, `docs/r0-mobile.png`. Root осмотрел реальные desktop/mobile рендеры. Конфликт специфичности CSS reduced-motion найден отдельной проверкой и исправлен до этого PASS.
- Независимое ревью: `docs/QA.md`; обнаруженные QA-01–03 исправлены и независимо воспроизведены после исправления.

## Не проверено в этой среде

Unix socket bind запрещён (`EPERM`) — production control/CLI тест SKIP, публичного TCP admin fallback нет. Docker, host Nginx/TLS, target PostgreSQL multi-session, ID/StartedAt контейнера, ресурсный запас VPS, backup/restore и работа первой игры до/после остаются BLOCKED до серверного запуска.

Локальный PASS не означает установки на VPS или пройденных серверных DEP-01–07. Фикстуры записей проверяют, что rollback не удаляет данные, но не заменяют будущие checkpoint/finish R1. Игровые механики, герои, строительство, заклинания и облачные сохранения в R0 не входят.
