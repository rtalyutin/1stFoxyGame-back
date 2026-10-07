# R3 — состояние поставки

## Текущая правка камеры

ACTIVE_CONTRACT: r3-camera/1, 07.10.2026. Пользователь попросил приблизить поле, убрать пустое пространство и опустить угол к горизонту, сначала показав макет; макет camera-preview-2 принят ответом «да. отлично». authorial_intent=camera-preview-2. Цель — реализовать этот ракурс в существующем Babylon renderer, сохранив игровой ввод, три линии, круглые позиции героев, квадратные площадки зданий и трон целиком с запасом справа. Новые модели, механики, core/content/save/API и первая игра вне этой правки.

stage=QA_VERIFIED; evidence_status=VERIFIED; action_decision=CONTINUE к paired CI и объединению. /root — координатор и DevOps; renderer_r1 — замороженный код и 6 авторских браузерных PASS плюс TypeScript; delivery — actual assembly и 31PASS/0FAIL/0SKIP (совместимость, API001/client002, content/rollback, checkpoint/replay и неизменный PID); spec_verifier — независимая приёмка конечной сборки PASS10/errors0, docs/QA-CAMERA.md, evidence/camera-qa/acceptance.json. Проверены все 15 мест обоих размеров, трон целиком, low/resize, перестановка, строительство, наземное/прицельное заклинание и save4 reload с API001 (revision4). Изменение камеры инвалидирует только её framing/picking evidence, сохраняя исторические R3 core/DB результаты. Старые архивы r0-002/r1-002/r2-001/r3-001 и Last-Throne-R3.zip неизменяемы.

Критерии: поле заметно крупнее, угол ниже принятого исходного; все позиции и площадки видны и выбираются; трон не обрезан; строительство и прицеливание работают после resize и в low quality. Проверяемые экраны 1440×900 и 2048×1025; Linux/Chromium153/WebGL2/SwiftShader — доступный стенд, физический GPU и VPS не проверены. Готовый клиент r3-content-002 sourceHash0dfe1bcaef0f7d94e05d5f50495bcfb0f84227b8f93b113b38cf5bdf0c732c83/manifest7d65186b3f8522585dc4ef17aa91c84a46994e63f57f656720a970916b50852a/frontendr3-web-28b2f81030b0bd69, прежние API001/backend7b084f31d98e7e6f/core/content/save4. Git frontend PR9/head eb590b49e07a3be7b7725182565939f615f558c3; свежие main front1f6fe217635c7d811f179a99a67a85b5dc6e939a/back3a359828aeb2c5998fa6f47f971e4af792147d71. Следующий шаг: независимая QA, paired CI, объединение и сохранение нового пакета; серверная операция NOT_STARTED.

## Проверенная поставка R3

ACTIVE_CONTRACT: r3/1. Координатор /root, 07.10.2026. Поручение «давай следующий релиз выполним». Основание docs/R3-CONTRACT.md и текущее ТЗ v0.6 (обновление ранее принятой identity v4). R3: полная партия, 15 волн, 3 командира, вылазки, предметы, Aegis, сохранения save4; старые партии не конвертируются.

stage=SOURCE_MERGED; evidence_status=VERIFIED; action_decision=CONTINUE; hypothesis_assessment=NOT_ASSESSED. GitHub base backend846be5b5f3a26e34e801a7d22a002375d7274302, frontend44a5ce0d127e7b76d6e1883f4dea7e248b1b978e. Новые изменения хаба сохраняются. Runtime Node24/Babylon9.29/WebGL2; доступный стенд Linux/Chromium/SwiftShader, не целевой физический ПК. Старые аппаратные/runtime доказательства не подтверждают R3.

accepted: core_r1 — frozen core/content, 10 авторских PASS и независимая полная партия; database — frozen server/SQL007/008, 18 авторских PASS; delivery — frozen build/ops, 38PASS/1socketSKIP; renderer/audio — frozen,17PASS. accepted: renderer_r1 — cloud resume DTO/start checkpoint race исправлены, preview002 targeted7PASS; graphics/audio17PASS. accepted: spec_verifier — независимый PASS_LOCAL_SCOPED, acceptance-report.json/QA-R3.md; exact UI15волн/victory/tick32008/throne131/cloudrevision37. Новых product defects не установлено. Root — интеграция репозиториев, контракт, фактический выпуск файлов. GitHub только root/DevOps. VPS operation_status=NOT_STARTED: серверного канала нет; подготовка и проверки продолжаются.

authorial_intent r3-art-1: сигилы лагеря/лавки/Рошана и читаемое отсутствие героя, предметы/выбор награды/Aegis рядом с карточками; сохранить магию и различие круглых и квадратных площадок. Принятие человеком не заявлено.

next: готовая поставка/ТЗ, затем серверный канал пользователя и человеческий плейтест. r3-001 frozen source2233389d…fadb/manifestdefab065…fc63; fullNode213/212PASS/1SKIP; independent core/API15,compat4,activation4,lifecycle5PASS. FrontPR8 иBackPR6 опубликованы, CI обоихрепозиториев иactual PostgreSQL17.11 (11PASS) green; Полный UI gate закрыт; main обоихрепозиториев продвинулся параллельным Syezzhaem R2,53/52изменённыхпути, конфликтовнет. Front integratedheadbabf28bdc01e559ac16bab117c15805e1aad37ff сохраняет921upstreamblobs, Интеграционный CI front37579477356/37579477346 иback37580098470/37580098529 SUCCESS. Finalpairedbackend549ff45d…81c0. PR8/PR6 MERGED; mainfront1f6fe217635c7d811f179a99a67a85b5dc6e939a иback3a359828aeb2c5998fa6f47f971e4af792147d71. Readback main/PR/merge tree равен tested tree; fresh rulesets=[]/protected=false. evidence/github-ci-r3-final.json. VPS NOT_STARTED.

## История проверенного R2

ACTIVE_CONTRACT: r2/1. Координатор: /root. Дата: 04.10.2026.

## Поручение и граница

Пользователь попросил «продолжи» после R1. Продолжение принято как ближайший R2 из §8.1 ТЗ; выбор назван пользователю. Вопрос о выборе продолжения вернул no answers, поэтому выполнен этот ближайший этап. R3/R4 не входят.

R2 реализован: пять героев, три семейства зданий, десять волн, командиры волн 5/10, надгробие и реальные зомби Undying, приоритет/прицельный выстрел Sniper, Rubick с тремя известными украденными заклинаниями, тотем замедления. R1 продолжает прежнюю партию на своих правилах и сохранениях save2. Прежние core/content, миграции 001–004 и exact releases r0-002/r1-002 сохранены.

Авторизованы реализация, локальные проверки и подготовка поставки. Цель — сервер первой игры. Серверного канала в этой сессии нет; установка и изменение первой игры не выполнялись. operation_status=NOT_STARTED для VPS. Наличие архива не означает установки.

## Точный объект и принятие

feature_id=last-throne-r2; contract_revision=r2/1; stage=SOURCE_MERGED; producer=/root; consumer=user; artifact_revision=r2-001; evidence_status=VERIFIED; gate_verdict=PASS для локальной функциональной области; action_decision=CONTINUE к сохранению готовой поставки; hypothesis_assessment=NOT_ASSESSED для реакции пользователя и баланса.

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
