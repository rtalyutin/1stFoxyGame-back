# R1 API

Публичный префикс `/td/api/v1`, внутренний `/api/v1`. Машинный контракт — `server/openapi-r1.json`; запросные схемы экспортируются из рабочего HTTP-модуля, чтобы контракт не расходился с формальной проверкой. Обновить файл: `node server/openapi-r1.mjs`. Каноническая игровая проверка дополнительно выполняется ядром и SQL после блокировки партии.

## Сессия и транспорт

`POST /guest-session` без тела либо с `{}` создаёт профиль (201) или возвращает существующий (200): `{profileId,profileRevision}`. Идентификатор владельца из тела не принимается. Cookie `last_throne_guest` содержит 32 случайных байта в base64url; БД хранит SHA-256. Production: `Secure; HttpOnly; SameSite=Lax; Path=/td; Max-Age=31536000`. Сессия действует год; данных партий этот срок не удаляет. Потеря/истечение cookie не предоставляет автоматического восстановления гостевого доступа.

Изменяющие запросы требуют точный `Origin`. Предпочтительно задать `PUBLIC_ORIGIN=https://…`; иначе API использует публичный Host, который сохраняет gateway. HTTP допускается только на loopback для локальной разработки. `secureCookies:false` — явная опция локального dev, запрещённая для публичного origin. Proxy доверяется только с loopback; заголовок forwarded-proto не участвует в выборе разрешённого origin.

Все ошибки имеют `{error:{code,message,requestId,fieldErrors?}}`; этот HTTP requestId также находится в `X-Request-Id`. Это идентификатор запроса для журнала, отдельный от устойчивого `requestId` операции сохранения. Журнал не включает cookie, токены, строку подключения или тело снимка. Неизвестная ошибка зависимости возвращает безопасный 503.

Начальные квоты процесса: 30 обращений к guest-session в минуту на IP, 120 записей и 600 чтений в минуту на владельца; максимум 10 000 корзин. 429 возвращает `Retry-After`. Это ограниченные исходные настройки, а не измеренный бюджет VPS. Все SQL-параметры передаются отдельно от текста SQL. Снимок ограничен 256 КиБ, весь HTTP JSON — 264 КиБ.

## Методы

| Метод | Запрос | Ответ |
|---|---|---|
| GET `/bootstrap?clientReleaseId=…` | Закреплённый ID набора запуска | Версии, capabilities, contentUrl, профиль при действующей cookie |
| GET `/content?clientReleaseId=…` | Закреплённый набор | Публичная неизменяемая проекция EAV |
| GET `/content/{version}` | Версия | Та же проекция, ETag; 304 при совпадении |
| GET `/profile` | Cookie | `{id,revision,settings}` |
| PATCH `/profile` | `{expectedRevision,settings:partial}` | Новый профиль; 409 при конфликте |
| POST `/runs` | `{clientRunId,clientReleaseId,coreVersion,contentVersion,seed}` | Собственная партия; точный повтор clientRunId возвращает тот же ID |
| GET `/runs?cursor=…` | Необязательный непрозрачный курсор | `{runs,nextCursor}`; до 20 записей, новые первыми |
| GET `/runs/{id}` | Cookie владельца | Текущий статус и ревизия, закреплённые версии, seed, результат |
| PUT `/runs/{id}/checkpoint` | `{requestId,expectedRevision,snapshotSchemaVersion:2,snapshot}` | `{runId,revision,checkpointId}` |
| GET `/runs/{id}/checkpoint` | Cookie владельца | `{runId,revision,runRevision,checkpointId,snapshotSchemaVersion,snapshot}` либо `null` до первого снимка |
| POST `/runs/{id}/finish` | `{requestId,expectedRevision,result}` | `{runId,revision,resultId,status}` |
| GET `/health`, `/ready`, `/version` | — | Жизнь процесса, готовность БД/контента, версии/совместимость |

Settings: `soundEnabled:boolean`, `volume:0..1`, `quality:low|medium|high`, `controlScheme:mouse_keyboard`, `autoPause:boolean`. PATCH принимает только перечисленные поля. JSON-типы проверяются без неявного преобразования строк в числа и без молчаливого удаления неизвестных полей.

Run содержит `id`, `clientRunId`, `clientReleaseId`, `coreVersion`, `contentVersion`, `metadataSchemaVersion`, `snapshotSchemaVersion`, `seed`, `revision`, `status`, `currentCheckpointId`, `createdAt`, `result`. Статус — `active`, `victory` или `defeat`. Чужая партия отвечает 404, а отсутствующая сессия — 401. История и настройки всегда относятся к владельцу cookie.

## Версии и сохранение

R1: `core=r1-core-1`, `content=r1-content-1`, `metadataSchema=r1-meta-1`, `snapshotSchemaVersion=2`, API 1. Контентные версии `r1-content-*` допускаются только с совместимым ядром и той же схемой, после публикации и регистрации нового immutable clientReleaseId. Новый API продолжает отдавать закреплённый R0 bootstrap с `battle/profiles/cloudSaves=false`; R0-клиенту нельзя создать боевую партию.

Снимок — результат `createSnapshot` из общего ядра. Поля: `schemaVersion`, `versions`, `phase:'preparation'`, `seed`, `rngState`, `simTick`, `commandEpoch`, `lastCompletedWave`, `nextWave`, `gold`, `throneHp`, `scrolls`, `heroes`, `buildings`, `statistics`. В нём нет активных врагов, снарядов, призывов, незавершённой стройки или телепорта. Ядро проверяет известные определения/ID, уникальность, типы площадок, занятость, уровни, HP, расходы и остатки таймеров. Seed должен совпадать с seed партии.

`result` берётся из `getFinishResult`: `outcome`, `wave`, `lastCompletedWave`, `simTick`, `gold`, `throneHp`, `seed`, `versions`, `statistics`. Statistics — целые неотрицательные `kills`, `builds`, `upgrades`, `goldEarned`; значения сохраняются также в checkpoint. Finish проверяет seed/версии, волны и предел HP по закреплённому контенту. Результат является сообщением клиента; серверная проверка структуры не доказывает честность боя.

Порядок checkpoint: одна зарезервированная SQL-сессия и транзакция → владелец и блокировка run → поиск принятого requestId → сравнение канонического хеша → терминальность → ревизия → проверка версий и снимка → запись всех типизированных сущностей нового поколения → замораживание → указатель/revision/ответ операции → commit. Валидатор читает контент тем же client; пул размером 1 не блокируется повторным резервированием соединения. Finish использует тот же порядок и область requestId, фиксируя результат и терминальность вместо нового checkpoint.

Хеш включает версию канонизации 1, вид операции, run ID, формат 2 и полное JSON-тело с expectedRevision и закреплёнными версиями. Порядок ключей и пробелы JSON не меняют хеш. Повтор принятого тела возвращает прежний ответ даже после finish. Другой хеш того же ID — 409 `IDEMPOTENCY_CONFLICT`; новая запись после финала — 409 `RUN_FINISHED`. Нельзя выводить текущий статус из исторического ответа: читать GET run отдельно. `revision` в GET checkpoint относится к поколению; `runRevision` — к текущей партии.

При конфликте ревизии клиент сохраняет свою локальную ветку и не перезаписывает облачную. Очередь pendingOperation и локальные поколения — ответственность `save-client`; сервер не объединяет золото/предметы/состояние разных вкладок.

## Хранение и проверка

Снимок не хранится единственным JSON. `player_profile`, `run`, `checkpoint`, `saved_hero`, `saved_building`, `run_result` — типизированные EAV-сущности; JSON ответа операции служебный. Источники — SQL003/004; R0 SQL001/002 не изменены. Опубликованный контент/метаданные и замороженные поколения неизменяемы. Права API устанавливаются `db/r1-runtime-grants.sql`: чтение ограниченного набора EAV/контентных таблиц, EXECUTE только перечисленных операций; технические сессии/операции/ключи и универсальные конфигурационные функции закрыты.

Авторская проверка: `node --test tests/r1-api.test.mjs tests/r1-database.test.mjs tests/api.test.mjs`. HTTP-тесты используют настоящий Fastify и PGlite SQL, включая разные владельцы, конфликт двух вкладок, повтор после потерянного ответа/finish, rollback, версии, ошибки размера/Origin/квоты и права API. PGlite-пул последовательно резервирует один SQL backend: это проверяет конкурентные HTTP-сценарии при pool=1, но не доказывает блокировки нескольких отдельных PostgreSQL-сессий, производительность VPS или выпуск на сервер.

Официальные технические основания: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Fastify server/proxy](https://fastify.dev/docs/latest/Reference/Server/), [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html).
