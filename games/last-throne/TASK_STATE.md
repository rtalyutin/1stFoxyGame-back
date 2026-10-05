# R2 — состояние поставки

ACTIVE_CONTRACT: r2/1. Координатор: /root. Дата: 04.10.2026.

## Поручение и граница

Пользователь попросил «продолжи» после R1. Продолжение принято как ближайший R2 из §8.1 ТЗ; выбор назван пользователю. Вопрос о выборе продолжения вернул no answers, поэтому выполнен этот ближайший этап. R3/R4 не входят.

R2 реализован: пять героев, три семейства зданий, десять волн, командиры волн 5/10, надгробие и реальные зомби Undying, приоритет/прицельный выстрел Sniper, Rubick с тремя известными украденными заклинаниями, тотем замедления. R1 продолжает прежнюю партию на своих правилах и сохранениях save2. Прежние core/content, миграции 001–004 и exact releases r0-002/r1-002 сохранены.

Авторизованы реализация, локальные проверки и подготовка поставки. Цель — сервер первой игры. Серверного канала в этой сессии нет; установка и изменение первой игры не выполнялись. operation_status=NOT_STARTED для VPS. Наличие архива не означает установки.

## Точный объект и принятие

feature_id=last-throne-r2; contract_revision=r2/1; stage=VERIFIED_LOCAL; producer=/root; consumer=user; artifact_revision=r2-001; evidence_status=VERIFIED; gate_verdict=PASS для локальной функциональной области; action_decision=CONTINUE к сохранению готовой поставки; hypothesis_assessment=NOT_ASSESSED для реакции пользователя и баланса.

- Source SHA-256: b4cb38f2477b406608f648cb72e5c1c68a4aed8fd4f3fa84a88637e70d4b9bf8.
- Manifest SHA-256: dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf; 2279 файлов.
- Pins: r2-web-cf9847f563bf04b1 / r2-api-058b93c6ed7eec48 / r2-core-1 / r2-content-1 / r2-meta-1 / save3 / API1.
- Контракт: docs/R2-CONTRACT.md, SHA-256 02556ff217ded0abef235fce435e936e8ffce581c3411dfac06ab76008631168.
- FEATURE_HANDOFF/1: digest aa1cfed01fce21493e11f57235c6efa1f4b4895bb2b1c9b571ae0683956f3750; все компоненты переданы и приняты координатором.

Исходники, входящие в sourceHash, и immutable r2-001 после сборки не изменены. Тесты, доказательства и итоговая документация сохранены отдельно от входов sourceHash. Preview001 не входит в готовую поставку. Исходный R1 в соседнем каталоге сохранён.

## Проверки

Строгий TypeScript PASS. Общий Node test: 163 случая, 162 PASS, 0 FAIL, 1 SKIP (стенд запрещает Unix socket bind). Независимый QA: 13 core/HTTP случаев включены в этот общий итог; browser 31/31, retained-R1 compatibility 2/2, low quality 2/2. Авторский browser отдельно 19/19. Renderer отдельно 16/16. Эти пересекающиеся результаты не складываются в новый общий total.

Независимая UI-партия прошла 10 волн и победила: seed55867687, tick7504, трон 240 HP, 182 убийства, cloud revision20. Все три способности Rubick украдены у реально кастующего командира и применены UI-командами. Чистое воспроизведение ядра: seed0x12345678, 71 команда, 4592 такта; пакеты 30/7 дают одинаковый результат. Отдельный старый R1 создан через R2 API и продолжен exact клиентом r1-002, сохранив две карточки и пять волн.

Основные доказательства: docs/TEST-REPORT-R2.md, docs/QA-R2.md, evidence/qa-r2/acceptance-report.json, evidence/qa-r2/identity-r2-001.json, evidence/browser-r2-final/report.json и неизменяемый renderer receipt. Исходные сбои наблюдателей и ограничения ранних перезаписанных renderer reports отражены честно; подтверждённых открытых продуктовых дефектов в проверенной области нет.

Среда: Node24, PGlite, Chromium153/Linux/Playwright/WebGL2/SwiftShader, desktop1440×900. Main QA ускорял ожидание волн virtual clock; compatibility/low и авторский browser использовали обычные часы. Это не аппаратный FPS benchmark. Синтетические граничные fixtures явно отделены от партии на опубликованном контенте.

Не проверены целевой VPS и первая игра до/после, Docker/Nginx/TLS/container identity/production Unix socket, самостоятельные сессии PostgreSQL, ёмкость/backup restore, аппаратный GPU/FPS, телефоны/другие браузеры, OS freeze, отдельный browser offline-defeat, человеческие A02/A21 и субъективный баланс. Серверное размещение NOT_EXECUTED.

## Художественное намерение и обратная связь

Authorial_intent r2-art-1 сохранён. B1: фиксированный бой на позициях. M1: Rubick забирает последнее реальное заклинание; дуга переносит магию к посоху, видимый слот хранится до расхода. M2: трещины, надгробие и последовательный подъём реальных зомби, отличимых от змей. Sniper: подготовка, луч, попадание. Круги героев и квадраты зданий, цена/preview/confirm, пространственные источники и цели, север сверху, HTML focus и клавиатура сохранены.

Основание — просьбы пользователя усилить магию и объяснить размещение. Реальные эффекты и механика проверены технически; человеческая приёмка нового экрана ещё не получена.

## Передача

Готовый пакет Last-Throne-R2.zip включает исходники, exact R0/R1/R2, тесты, доказательства, обновлённое ТЗ v0.5 и инструкции. Last-Throne-R2-screen.png — кадр реально работающего r2-001, не концепт. ТЗ обновляет ту же ранее созданную identity с сохранением истории версий.

Следующее действие координатора: проверить целостность архива и сохранить готовые файлы. Следующее внешнее действие при доступном серверном канале — выполнить ops/RUNBOOK-R2.md на сервере первой игры; никакая внешняя установка этим локальным gate не объявлена выполненной.

## Интеграция в существующие репозитории — 2026-10-05

Предыдущий шаг сохранения архива завершён. По поручению «реализуй что сможешь сам, потом напиши что с меня осталось» выполнена техническая интеграция: canonical core/server/db/ops находятся в backend `games/last-throne`, web — в парном frontend `games/last-throne/web`. Первый игровой код, его production-маршруты и графика зала сохранены. Готовые releases и production dependencies продолжают поступать из принятого ZIP, не из Git.

Добавлены `deploy/last-throne/assemble.mjs` и `operator.mjs`: exact paired-source assembly и подготовка команд установки в явном режиме first-install/upgrade-r0-r1. Проверки — 11/11 author wrapper PASS с реальным R2 и независимый контроль; startup failure прекращает план до expose/update. Hub activation: 13/13 Node PASS и 4/4 независимых actual R2 API/PGlite/original gateway PASS. Probe закреплён на manifest/source/content projection hashes и проверяет 55 web files; default catalog остаётся soon до фактического размещения.

Публикация: backend PR https://github.com/rtalyutin/1stFoxyGame-back/pull/5 и frontend PR https://github.com/rtalyutin/1stFoxyGame-front/pull/7. Исполняемая ревизия backend 21afa87aed9f051a3295a733d29da45db7905d72: CI run37340330644 PASS, включая первую игру, PostgreSQL18 и Docker smoke; wrapper CI без ready package — 10 PASS/1 явный SKIP. Frontend 1fe83cc6282a8b54109b7c8ab68921080a6c15bb: CI run37340218868 PASS, включая typecheck/build первой игры, hub build, activation13 и paired-container smoke. Это CI первой игры/интеграции, не проверка TD PostgreSQL17 на VPS. Дальнейшая правка этого раздела — только документация; sourceHash b4cb… и exact R0/R1/R2 неизменны.

Текущий local gate VERIFIED/PASS. Целевой VPS, private env, TD Docker/PG17, HTTPS, backup restore, браузерные сохранения и первая игра до/после на общем сервере ещё не проверены; server operation_status=NOT_STARTED, server gate=BLOCKED из-за отсутствующего канала доступа. Следующее действие исполнителя с SSH-доступом: выполнить обследование и установку по `deploy/last-throne/README.md`, затем публичную QA и probe/build/publish автомата. Сохранённый художественный замысел и профиль исходного браузерного R2 не изменены. Дальнейшие обычные A/B updates идут через original CLI без перезапуска runtime; первоначальная установка/one-time R0/R1 upgrade этим обещанием не подменяется.
