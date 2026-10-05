# Независимая приёмка R2

**Локальный функциональный gate r2-001: PASS.** Подтверждённых открытых продуктовых дефектов в проверенной области нет. Это не приёмка VPS, физической производительности, баланса или человеческой понятности. Producer: root; consumer: отдельный исполнитель spec_verifier. QA не изменял реализацию или опубликованные архивы.

Входы: ACTIVE_CONTRACT `r2/1`, `docs/R2-CONTRACT.md` SHA-256 `02556ff217ded0abef235fce435e936e8ffce581c3411dfac06ab76008631168`; ТЗ v0.4 / версия 3, применимые §8.1/§2.3; authorial_intent `r2-art-1`. Handoff `FEATURE_HANDOFF/1`, digest `aa1cfed01fce21493e11f57235c6efa1f4b4895bb2b1c9b571ae0683956f3750`. Локальные входные digest сверены. `evidence_status=VERIFIED`; `operation_status=NOT_STARTED` для внешней установки; `hypothesis_assessment=NOT_ASSESSED` для реакции пользователя. Проверки выполнены 04.10.2026.

## Точный объект

| Поле | Проверенное значение |
|---|---|
| Release | `releases/r2-001` |
| Source SHA-256 | `b4cb38f2477b406608f648cb72e5c1c68a4aed8fd4f3fa84a88637e70d4b9bf8` |
| Manifest SHA-256 | `dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf` |
| Pins | `r2-web-cf9847f563bf04b1`, `r2-api-058b93c6ed7eec48`, `r2-core-1`, `r2-content-1`, `r2-meta-1`, save3/API1 |
| Inventory | 2279 файлов: полное соответствие manifest/inventory/hash, без дополнительных файлов, symlink и выхода пути за каталог |
| Исполняемые исходники | 56 файлов source inventory; 50 некомпилируемых копий runtime совпали с поставкой. До/после browser sourceHash и manifest неизменны; отдельный inventory всех 27 файлов тестов |
| Retained R1 | `r1-002`, manifest `daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823` |
| Retained R0 | `r0-002`, manifest `40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6` |

Архивы R0/R1 проверены полностью; R1 core/content и SQL001–004 не менялись. [Identity после исполнения](../evidence/qa-r2/identity-r2-001.json), [до исполнения](../evidence/qa-r2/identity-r2-001-before.json). Identity-проверка самостоятельно пересчитывает файлы, не использует application verifier как собственный oracle. Скомпилированный web проверен по hashes поставки и фактическим browser-действиям. Preview001 не используется как доказательство финального интерфейса.

## Результаты

| Критерий / риск | Фактический результат | Evidence |
|---|---|---|
| Общая регрессия | `npm test`: 163 обнаружено, 162 PASS, 0 FAIL, 1 SKIP; `npm run typecheck`: PASS. Skip — запрет Unix socket bind данной средой | [unit-final.log](../evidence/qa-r2/unit-final.log), [typecheck-final.log](../evidence/qa-r2/typecheck-final.log) |
| Независимые core/HTTP/EAV случаи | 13 новых случаев PASS: собственная партия на обычном контенте; ledger/неизменные snapshots; три реальных commander handler в явно синтетических граничных сценах; cap/TTL, lost target, приоритет, slow expiry, смена spell во время кражи; mixed R1/R2, owner/revision/retry/terminal, rollback поздней EAV записи, межпоколенная ссылка, неизвестный handler | [qa-r2-core.test.mjs](../tests/qa-r2-core.test.mjs), [qa-r2-api.test.mjs](../tests/qa-r2-api.test.mjs), основной unit log |
| Настоящая партия | 31/31 browser-проверка PASS, без page errors. UI-командами пройдены все 10 волн: seed55867687, tick7504, 240 HP трона, 1469 золота, 182 убийства, 7 построек, 14 улучшений. Облачный terminal revision20 совпал с результатом; после reload Continue отсутствует | [browser/report.json](../evidence/qa-r2/browser/report.json), [победа](../evidence/qa-r2/browser/02-victory.png) |
| Все герои и здания | Пять карточек, три семейства построены за настоящее золото, отмена preview бесплатна; Shaman/Pudge/Undying/Sniper выполнили ручные действия. Обычные клики по верхнему/нижнему фундаменту соответствуют пространственным подписям; free relocation Rubick подтверждён Enter | Основной browser receipt, [preview](../evidence/qa-r2/browser/01-cancel-preview.png) |
| Rubick в настоящем бою | В волне5 реальный командир последовательно стал источником `area_strike`, `temporary_shield`, `area_heal`; каждая кража заполнила слот, каждое применение очистило его и записало отдельный durable event. Фокус area-confirm сохранился через450мс в движущемся бою | Основной receipt и `rubick-*.png` в [browser evidence](../evidence/qa-r2/browser/report.json) |
| Offline A→C и конфликт | Заблокирован PUT, достигнута C перед волной4; reload восстановил C и точное A. После сети A и C подтверждены последовательными ревизиями до6. Две реальные вкладки дали один winner и REVISION_CONFLICT; pending/local loser и cloud winner сохранены | Основной browser receipt: offline/sync/two real UI branches |
| Save3 и EAV | Через настоящий SQL и HTTP roundtrip сохранены stolenSpell, оба cooldown и Sniper priority. Чужой владелец недоступен, R1↔R2 snapshot отвергается. Исторический точный checkpoint retry после terminal возвращает прежний ответ, новый поздний save отклонён. Ошибка последнего child scalar не публикует частичное поколение; corrected request может выполнить запись | Четыре независимых HTTP/EAV теста в основном unit log |
| Старый R1 через R2 | Отдельный native-clock browser: 2/2 PASS. Exact R1 клиент UI-действиями создал save2 через R2 API; меню R2 вернуло его в `r1-002`. Тот же run/checkpoint/pins, два героя и пять волн, без конверсии | [compat-browser/report.json](../evidence/qa-r2/compat-browser/report.json), [R1 после возврата](../evidence/qa-r2/compat-browser/r1-resumed-under-r2-api.png) |
| Low quality | Отдельный native-clock browser: 2/2 PASS. Реальные tombstone/zombie actors, slow indicators и critical effect geometry остаются при low; 36 наблюдений геометрии по фактическим rAF. Возврат high через настройки не сбрасывает партию. Скриншоты визуально просмотрены | [low-browser/report.json](../evidence/qa-r2/low-browser/report.json), [призывы low](../evidence/qa-r2/low-browser/low-real-tombstone-zombies.png) |
| Context loss / visibility | Настоящий `WEBGL_lose_context` остановил такты; меню→checkpoint пересоздало renderer. Controlled hidden держал tick137, возврат оставил паузу; explicit Resume → первый advancing rAF через345.6мс дал7 ticks, без накопленного hidden времени | Основной browser receipt: controlled WebGL loss / visibility |

Сводка с hashes сырых evidence — [acceptance-report.json](../evidence/qa-r2/acceptance-report.json). Авторский browser root отдельно дал 19 PASS и ноль errors на том же sourceHash (`evidence/browser-r2-final/report.json`); это corroboration, не замена независимого результата. Отчёт renderer-owner с постановочными эпизодами не выдан за самостоятельно сыгранную партию.

## Исправления стенда

Продуктовых изменений QA не запрашивал. Сохранены два исходных сбоя oracle:

- **R2-QA-H01:** в compat-пробе ошибочно использована R2-only кнопка `overview` в архивном R1. У R1 уже открыт нужный `summary`. Удалён неподдерживаемый шаг стенда, повтор с новой БД — PASS; [исходный timeout](../evidence/qa-r2/compat-browser/unsupported-harness-locator.json). Архив R1 не менялся.
- **R2-QA-H02:** дополнительная сверка копий ошибочно сравнила исходный `web/index.html` с результатом Vite как некомпилируемый файл. Ограничена настоящими runtime-копиями; все50 совпали. Web inventory/hash и реальные browser-проверки остаются обязательными; [исходное расхождение](../evidence/qa-r2/identity-compiled-html-oracle-failure.json). Повтор identity — PASS.

## Границы вывода и повторение

Node24, PGlite, Chromium153.0.8010.0 / Playwright / Babylon WebGL2, Linux headless, ANGLE Vulkan SwiftShader; viewport1440×900/DPR1, canvas и buffer1150×726, наблюдаемый MAX_TEXTURE_SIZE8192. Server/browser запускались в одном дереве Node-процессов; каждый browser-script использовал отдельный порт и свежую БД. Web security не отключалась. Основная партия ускоряла только ожидание волн непрерывными virtual performance/rAF 8x; взаимодействия и отдельные compatibility/low-пробы использовали обычные часы. Это не FPS/latency benchmark и не физический GPU.

Граничные core fixtures меняют разрешённую конфигурацию для длительных наблюдений и отдельно обозначены синтетическими. Настоящая UI-партия использовала опубликованный R2 EAV-контент, не присваивала ресурсы и не меняла игровые объекты. HTTP injection тесты используют реальные handlers/SQL, но технические fixture-manifests. Dev browser API исполняет рабочие runtime-файлы; их50 копий и sourceHash сопоставлены с итоговой поставкой.

Не проверены целевой VPS/первая игра, Docker/Nginx/TLS/container identity, production Unix socket, отдельные PostgreSQL-сессии/ресурсная ёмкость/backup restore, аппаратный GPU и согласованный FPS, телефоны и другие браузеры. Controlled visibility event не равен реальному OS freeze/discard; управляемый WebGL loss не гарантирует восстановление при любом GPU-отказе. Browser defeat с pending checkpoint offline отдельно end-to-end не разыгрывался; terminal и pending→finish покрыты HTTP/SaveManager-тестами. A02/A21 с человеком, субъективная узнаваемость и баланс остаются непроверенными. R3/R4 и публикация не входят.

Повтор: `npm test`, `npm run typecheck`, `node tests/qa-r2-identity.mjs`; browser — `QA_ORIENTATION_CHECK=1 node tests/qa-r2-browser.mjs`, отдельные `node tests/qa-r2-compat-browser.mjs` и `node tests/qa-r2-low-browser.mjs`. При нестандартном Chromium задать `BROWSER_EXECUTABLE_PATH` и JSON-массив `BROWSER_LAUNCH_ARGS`; внешний browser-runtime не входит в поставку. По умолчанию проверяется `releases/r2-001`; можно явно задать `QA_RELEASE_ID` / `DEV_RELEASES_DIR` для другой версии, без переноса этого PASS.

Возврат root: локальный gate закрыт; новых функциональных прогонов без изменения объекта или нового существенного сбоя не требуется. Внешняя установка этим отчётом не выполнена и не разрешается.
