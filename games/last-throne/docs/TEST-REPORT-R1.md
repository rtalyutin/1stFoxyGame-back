# Локальная проверка R1

Поставка: `r1-002`, 4 октября 2026. Source SHA256 `62d3aea6c2b7ed50246e531343913aeb1a2e08ee807c77338838122f4818c9ee`; manifest SHA256 `daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823`. 2266 файлов с SHA256, включая готовый клиент и собственные production dependencies. Версии: frontend `r1-web-4d1ebc495b27e228`, backend `r1-api-0873c6352ef7a1d9`, core `r1-core-1`, content `r1-content-1`, metadata `r1-meta-1`, save2/API1.

## Проверки правил, данных и доставки

`npm run typecheck`: PASS после исправления context-panel. `npm test`: 99 total,98 PASS,0 FAIL,1 SKIP. Финальный log: evidence/unit-final.log; независимый log: evidence/qa-r1/unit-final.log. Проверки включают настоящие SQL-миграции/функции в PGlite, Fastify HTTP, fixed-step/replay ядро, отсутствие двойного списания, приоритет поражения, смерть при переносе, типизированную immutable generation, права non-owner API роли, owner/revision/requestId изоляцию, атомарное finish и historic repeat, локальные A/C/terminal/conflict очереди. Независимые held-out сценарии включают пять волн и отдельное поражение.

Доставка проверяется actual Node A/B процессами и loopback HTTP: gateway PID сохраняется, content promotion сохраняет API PID, retained R0 и оба pins работают, frontend_only не заменяет R1 API/не удаляет новые fixture records; журнал восстановления и drain regressions сохранены. Эти fixture records не являются настоящими R1 PostgreSQL checkpoint. Во время нагрузочного rerun таймер slow fixture мог закончиться раньше candidate readiness: тест исправлен явным удерживающим barrier, обе ветви проверены повторно; production supervisor не менялся.

## Браузер

Авторская проверка exact r1-002: 14/14 PASS,0 browser errors — evidence/browser-r1/report.json. Реальные WebGL2/EAV cold start, ghost cancel и покупка, hero gold upgrade, free round-anchor move, local/cloud checkpoint, pause/resume,4snakes, focus450ms, paid teleport, чтение actual saved boundary и wave reload, controlled WebGL loss/restore, lowquality и unsupported WebGL2 message. Независимая повторная focus-проверка с450/1500ms idle и Enter→75tick channel→destination: PASS, evidence/qa-r1/focus-report.json. Независимая цепочка:19 успешных свойств полной партии/offline/conflict, focus/paidteleport отдельноPASS и native-clock visibility отдельноPASS — evidence/qa-r1/acceptance-report.json и docs/QA-R1.md. Raw полный report сохранён с исходнымFAIL последнего200ms observation oracle; зависимый критерий заменён измерением фактического первого rAF и повторён отдельно на тех же неизменённых исходниках. Первый кадр после настоящего resume-click через441мс продвинул7тактов; hidden/return tick1 оставался1. Этот полный прогон целиком зелёным не объявляется.

Chromium153.0.8010.0, Playwright1.62.1, Babylon9.29.0; Linux software SwiftShader/WebGL2. Сервер scripts/dev.mjs использует настоящие source API и persistent PGlite; браузер получает exact immutable Vite клиент. Исходники API/runtime отдельно сверяются с manifest artifact. Это не production PostgreSQL/Docker запуск.

Standalone renderer probe (docs/r1-renderer-report.json) привязан к renderer SHA25697a5acb2ca73460a6dbcc0388c9ff3fa2e7a89c3549cda2dd562919d65f58801: реальные события крюка/змей/телепорта, перемещение lethal hook victim, север выше юга, pointer picks, DPR1.5→1, controlled context loss/restore и освобождение мешей/материалов. Root осмотрел merged screenshots: ghost северного pad-n1 совпадает с верхней площадкой, четыре змеи появляются около Shaman, дороги идут к трону справа. Эстетическая/человеческая приёмка не заявляется.

## Исправленные находки

QA-R1-01 на preview003: wave-panel сравнивал HTML browser serialization с source string и пересоздавал unchanged start button. Исправлено source signature и focus key; independent normal click/focus retest passed на r1-001 и повторяется на финальной версии.

QA-R1-02 на r1-001: context signature включал движение всех врагов, подтверждение телепорта теряло focus при450/1500ms idle. Исправлено source panelHtml сравнение; все action controls получают стабильные focus keys; save panel также не пересоздаётся без изменения текста. r1-001 исключён из поставки. Raw исходные failure screenshots/reports сохранены отдельно, финальный retest относится к r1-002.

Два авторских observation failures не были доказанными продуктовыми defects: короткий75-tick teleport закончился до наблюдения transient boolean; после короткой первой волны меню правильно показало checkpoint волны2 вместо фиксированного ожидания волны1. Тест теперь наблюдает durable teleport_start и читает фактическую сохранённую границу; wave reload сравнивает ticks/героев с этим checkpoint, а не с предположением.

## Границы локального результата

Unix operator socket bind ограничен средой (EPERM), один production control test SKIP. На VPS не исполнялись Docker/Nginx/TLS, проверка container ID/StartedAt, PostgreSQL multi-session capacity, backup/restore или первая игра до/после. Число одновременно пишущих игроков ограничено общим EAV advisory lock; производительность требует измерения на реальном PostgreSQL.

Не заданы физический CPU/GPU и согласованный FPS-бюджет; software WebGL функционально проверяет сцену и lifecycle, но не подтверждает FPS игрока. Протокол первого запуска людьми, узнаваемость героев и баланс не приняты этой проверкой. Мобильный battle UI не входит в R1 acceptance. R2–R4 не реализованы. Итог client_reported, без leaderboard/anti-cheat проверки.
