# R3 — проверка текущей поставки

07.10.2026. Контракт r3/1, handoff FEATURE_HANDOFF/1, digest 880ed9d2dc0004f39250f4a5c3739840cc1f9c4b37edf78b652dc787f5aa44e4. Координатор /root; независимый проверяющий /root/spec_verifier. Локальный функциональный gate exact r3-001 PASS, включая полную браузерную партию. Source2233389d406901529b55b5cf7c9ecfef7b1c5726c12cbf0b0495bae7349bfadb; manifestdefab06551d52e9cc71c0a6d56c769e9030e51649756cecfba659a70c5acfc63. VPS и человеческая приёмка не объявлены выполненными.

| Проверка | Фактический результат и граница |
| --- | --- |
| Полный Node suite | 213 случая, 212 PASS, 0 FAIL, 1 SKIP; evidence/node-r3-frozen.log, повтор после freeze; прежний успешный evidence/node-r3-full.log сохранён. SKIP: Unix socket bind недоступен на этом стенде |
| Строгий TypeScript frozen source | PASS; evidence/typecheck-r3-frozen.log |
| Автор core | 10 PASS; 15 волн, seed0x12345678, 30515 тактов, 258 команд, throne240HP. Пакеты30/7 одинаковы |
| Независимый core | 11 PASS; иная стратегия/seed6996017, 15 волн, 37890тактов, 72команды, throne79HP; пакеты31/7 одинаковы. evidence/qa-r3/core-party.json |
| Автор SQL/API | 18 PASS (11 storage, 7 HTTP); nested save4, rollback, grants, metadata без DDL и future-handler guard. docs/DB-R3.md, API-R3.md |
| Независимый SQL/API | 4 PASS на текущем source; evidence/qa-r3/api-metadata-extension.log. Повтор exact final identity:15/15 core/API PASS, evidence/qa-r3/core-api-final.log |
| Delivery | 38 PASS, 1 socket SKIP, 0 FAIL в группе исторических и новых delivery тестов; эти случаи уже входят в полный Node итог |
| Renderer/audio | 17 PASS, 0 browser errors. evidence/renderer-r3/HANDOFF.json и immutable report; отдельные реальные core episodes, не полная UI-партия |
| Main UI | Автор preview001 прошёл 14 проверок новых механик, затем нашёл actual cloud legacy resume error. Preview002 preparation_race: 2 PASS; архивные переходы5PASS; независимый exact R3 API/R1/R2 cloud resume4PASS |
| Hub activation fixtures | 13 PASS fixtures; независимый immutable R3 app/gateway4PASS: evidence/qa-r3/activation/real-activation-latest.json, safe corrupt projection/client rejection |
| Полная UI-партия exact R3 | 15 волн, victory, throne131HP,1064kills, tick32008, cloudrevision37;6финальных PASS после штатного Continue того же естественного run, вместе с предшествующими границами1–3. evidence/qa-r3/party-r3-001-1791352505111/report.json |
| Lifecycle | 5 PASS: two-tab conflict, bounded visibility return, естественный offline-defeat, reload terminal и последующая sync/checkpoint/finish; evidence/qa-r3/lifecycle-final.log |
| Actual assembled wrappers | 13 PASS,0FAIL,0SKIP; evidence/wrappers-r3-final.log |

Пересекающиеся авторские/независимые наборы не складываются с полным Node suite в новый total. Их receipts подтверждают различные границы.

## Найденные ошибки и история

- Early Node integration: 191 total/188 PASS/2 FAIL/1 SKIP. Два исторических теста требовали прежнее число миграций6 и отсутствующий sibling baseline. Исправлены на8 и exact retained r1-002; targeted19/19 PASS, затем полный213/212/0/1. Исходный лог сохранён. Старые продуктовые байты не менялись.
- Preview001: облачный переход в R1 читал несуществующее вложенное run.versions вместо flat API pins. Исправлен клиентский mapper и метки меню; exact архивы не менялись.
- Preview001: при задержанной локальной записи startWave новая prep-команда могла стать частью боя без сохранённой контрольной точки. Ошибка воспроизведена реальными DOM действиями и чтением IndexedDB. Preview002 блокирует prep mutations на время start transaction, проверяет тот же game/manager и учитывает checkpointTasks; bounded regression2PASS.
- Проверка SQL нашла обход known-handler guard у будущей metadata revision. SQL007 scope теперь определяется r3-core-1 и type.code; permissive optional revision публикуется без DDL, неизвестный handler отклоняется SQL и compiler. Это исправление до публикации007/008.
- Исходные ошибки наблюдателей сохранены: sample до RAF, ожидание удержанного Aegis после его корректного естественного потребления, ожидание новых диагностических полей у старого R1. Эти receipts не переименованы в PASS; новые fixtures используют реальные durable события, старый DOM и pinned saved record.

- Root запустил wrapper real-stage check до завершения atomic assembly: получен SETUP_FAIL ENOENT, продукт не исполнялся. Исходный wrappers-r3-setup-failure.log сохранён; после завершения сборки проверка повторена в правильном порядке:13/13PASS на настоящем собранном staging.

- Full UI waiting limit180s на8-йволне не подтвердил softlock: read-only exact checkpoint replay воспроизвёл tick15651/enemy72HP/Pudge19HP, после чего wave закончилась через273такта; public Sniper cast — через24. evidence/qa-r3/timeout-differential-replay.json. Новый natural UI-controller использует способности; raw timeout сохранён.
- Следующий UI-controller получил actionability timeout на обновляющейся DOM-цели и естественное завершение3-йволны между выбором и кастом. Исправлен harness: native clock на момент действий, actual focus+Enter по конкретному enemyID и короткий retry при исчезновении цели. Product source неизменен. Тот же run2c86db71-3676-43a2-be1f-0df141b94a7e штатно продолжен с4-йволны, завершил15волн и сохранил victoryrevision37; terminalreload не предлагает Continue. Предшествующий FAIL receipt party-r3-001-1791352319514 связан с финальным PASS через recoveredFrom и одинаковый runId.

## Среда и практические пределы

Node24.19.0, npm11.9, TypeScript7.0.2, Babylon9.29/WebGL2, Chromium153/Linux/Playwright/SwiftShader. PGlite0.5.8 использует один leased backend; это не реальная многосессионная PostgreSQL17. Реальная CI PG17.11 выполнена:11/11storage PASS,43/43core/HTTP/embedded PASS; evidence/github-ci-r3-source.json. Source2233389d…fadb и exact frontend473a74b…9895 проверены. CI wrappers12PASS/1SKIP из-за намеренного отсутствия readyarchives в Git; локальный actual-stage13/13PASS. Проверки первой игры/хаба в обоих репозиториях также прошли, без их изменений.

Авторские UI-проверки используют обычные часы; независимая полная партия допускает явно записанный virtual RAF/performance clock8x только для ожидания. Fixtures не изменяют игровое состояние или diagnostics. Это не аппаратное измерение FPS.

Не исполнены целевой VPS, первая игра до/после, Docker/Nginx/TLS/container-ID, production Unix socket, server resource/backup recovery, физический GPU/CPU, другие браузеры/телефоны, человеческие A02/A21 и субъективный баланс. Server operation_status=NOT_STARTED. Эти границы не подменяются автоматическими PASS.
