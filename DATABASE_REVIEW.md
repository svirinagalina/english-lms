# Обзор базы данных и миграций Advent Academy LMS

Дата проверки: 2026-10-12

Коммит: `57af312` (`main`)

## Область проверки

Проверены:

- `server/prisma/schema.prisma`: 39 моделей;
- все 46 миграций `server/prisma/migrations`;
- внешние ключи, unique/index constraints и каскадные удаления;
- основные Prisma-запросы, транзакции и фоновые выборки;
- полный replay миграций на пустой PostgreSQL 16;
- соответствие полученной БД текущей Prisma-схеме;
- конкурентные сценарии, где приложение полагается на ограничения базы.

Production-база и production-данные не изменялись и не инспектировались. Проверки с записью выполнялись только во временной пустой PostgreSQL 16.

## Итог

Схема в целом аккуратная: основные связи имеют foreign keys, для многих пользовательских выборок есть подходящие индексы, критичное назначение доски уже защищено транзакцией и PostgreSQL advisory lock. Все 46 миграций успешно применяются с нуля, `prisma migrate status` сообщает `up to date`, а `prisma migrate diff` не обнаруживает drift.

Однако есть один подтверждённый runtime blocker и несколько рисков целостности:

- `TrialReport.callId` используется как unique key, хотя база и Prisma-схема этого не гарантируют;
- personal-space classroom не защищён от дубликатов;
- несколько составных операций оставляют частичные данные при ошибке;
- часть внутренних `...Id` хранится без foreign key;
- несколько фоновых запросов со временем перейдут на полные сканирования таблиц.

Общая оценка: **миграционная цепочка воспроизводима, но текущие бизнес-инварианты не полностью выражены в схеме**.

## Критичная проблема

### P1: `TrialReport.callId` не unique, но читается через `findUnique`

Схема:

```prisma
model TrialReport {
  id     String  @id @default(cuid())
  callId String?
}
```

Код повторного запуска пробного урока:

```js
const openReport = open && await prisma.trialReport.findUnique({
  where: { callId: open.id }
})
```

На сгенерированном Prisma Client этот вызов подтверждённо завершается:

```text
PrismaClientValidationError:
TrialReportWhereUniqueInput needs at least one of `id`
```

Одновременно база допускает несколько `TrialReport` с одинаковым `callId` и допускает `callId`, которого нет в `Call`. Это нарушает предполагаемое отношение «один trial call — один report».

Исправление новой миграцией:

1. Найти дубликаты и orphan `callId` в production read-only запросом.
2. Согласовать, какой отчёт сохранить при дубликатах.
3. Добавить Prisma relation `call Call?`, `callId String? @unique` с подходящим `onDelete`.
4. Не редактировать уже применённую миграцию `20260919093559_trial_reports`; создать новую.
5. Обернуть создание `Call` и `TrialReport` в одну транзакцию.
6. Добавить integration test первого и повторного запуска trial.

## Высокий приоритет

### P2: personal space допускает несколько строк на одного преподавателя

Ожидаемый инвариант описан в коде как один `Classroom` с `studentId = NULL` на преподавателя. Сейчас используется:

```prisma
@@unique([teacherId, studentId])
```

В PostgreSQL `NULL` не равен другому `NULL`, поэтому этот unique index не запрещает две строки `(teacherId = X, studentId = NULL)`. На временной БД две такие строки были успешно вставлены, итоговый `count(*)` равен `2`.

Код `ensurePersonalSpace` дополнительно использует конкурентно небезопасный `findFirst -> create`. Два процесса или два параллельных запроса могут создать дубликат.

Исправление:

```sql
CREATE UNIQUE INDEX "Classroom_one_personal_space_per_teacher"
ON "Classroom" ("teacherId")
WHERE "studentId" IS NULL;
```

Перед индексом нужно найти и объединить дубликаты: перенести boards/calls в выбранную строку и только затем удалить лишние classrooms. В Prisma partial index не выражается обычным `@@unique`, поэтому его следует сохранить явной SQL-миграцией и regression test.

### P2: создание trial call и report не атомарно

`POST /trials` сначала создаёт `Call`, затем отдельным запросом создаёт `TrialReport`. Если второй запрос падает, остаётся открытый trial call без отчёта. Следующая попытка находит этот `Call`, затем попадает в ошибочный `findUnique(callId)` и не восстанавливает состояние.

Нужно создать обе записи в одной interactive transaction. Уведомление и внешнюю Advent-интеграцию запускать только после успешного commit; ошибка внешней системы не должна откатывать локальные данные.

### P2: импорт курса оставляет частично созданный граф

`POST /api/courses/import` последовательно создаёт:

1. `Skillset`;
2. `Course`;
3. каждый `CourseLesson`;
4. blocks и exercises урока.

Транзакции нет. Ошибка на втором уроке — например, повторная позиция, некорректный payload или потеря соединения — оставляет Course и уже созданные уроки. Повторный импорт создаст ещё один курс вместо безопасного продолжения/отката.

Нужно:

- полностью валидировать import DTO до первой записи;
- выполнить создание графа в `prisma.$transaction`;
- возвращать `201`, а не общий `200` для нового ресурса;
- добавить test «ошибка в середине → в БД нет ни Course, ни Lessons, ни Blocks».

### P2: внутренние идентификаторы без foreign key создают orphan records

Не все поля с внутренними ID оформлены как отношения:

| Модель | Поля | Риск |
|---|---|---|
| `TrialReport` | `studentId`, `teacherId`, `callId` | отчёт переживает удаление/не существует для указанного пользователя или звонка |
| `LessonSummary` | `classroomId`, `studentId`, `mistakeIds[]` | summary может ссылаться на удалённый classroom/student/mistake |
| `LessonMistake` | `teacherId`, `boardId` | orphan после удаления преподавателя/доски |
| `Textbook` | `uploadedById` | ID uploader остаётся после удаления пользователя |
| `UserCalendarEvent` | `studentIds[]` | удалённые и межшкольные ID остаются в массиве |
| `AdventLesson` | `teacherId`, `calendarEventId`, `callId`, `classroomId` | внутренние связи не контролируются базой |

Не каждый historical snapshot обязан иметь cascade relation. Но текущий код использует многие из этих значений как живые ссылки. Следует для каждого поля явно выбрать один из вариантов:

- настоящий foreign key с `Cascade`, `Restrict` или `SetNull`;
- immutable snapshot без последующего join;
- отдельная join table для коллекции ID.

Особенно важно заменить `UserCalendarEvent.studentIds String[]` на join table, если по этим ученикам продолжаются выборки и уведомления. Массив не может обеспечить referential integrity и плохо поддерживает запросы по одному ученику.

### P2: конкурентное добавление слов может создавать дубликаты и одинаковые позиции

`personalSet` использует `findFirst -> create`, но `VocabSet.ownerId` не unique. Добавление слова использует:

1. `findFirst` по case-insensitive term;
2. `count` карточек;
3. `create` с `position = count`.

Параллельные запросы могут создать:

- два personal sets одного пользователя;
- две одинаковые карточки с разным регистром;
- две карточки с одинаковой `position`.

Варианты исправления:

- отдельный явный признак personal set и unique constraint на владельца;
- нормализованное поле `termKey` (`trim/lower`) и `@@unique([setId, termKey])`;
- позиционирование внутри транзакции либо отказ от `count` в пользу стабильного order key;
- retry только при известном unique-conflict.

## Миграционные риски

### P2: миграция календаря удаляет назначения без backfill

`20260922172911_change_calendar_to_student_ids` удаляет `studentId` и добавляет пустой `studentIds TEXT[]`. Значение старого ученика не переносится:

```sql
ALTER TABLE "UserCalendarEvent" DROP COLUMN "studentId",
ADD COLUMN "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
```

Это уже историческая миграция, поэтому редактировать её нельзя: изменение checksum повредит применённые окружения. Но при обновлении старой копии БД через эту точку назначения событий будут потеряны.

Нужно:

- задокументировать, было ли такое удаление принято сознательно;
- проверить production backup/старые snapshot на потерянные значения;
- любые будущие преобразования `scalar -> array/join table` делать по схеме add → backfill → validate → switch code → drop в отдельном релизе.

### P3: ранняя миграция classroom намеренно удаляет Board/Lesson данные

`20260914105724_classrooms` начинает с `DELETE FROM "Board"` и затем удаляет таблицу `Lesson`. Комментарий сообщает, что remap невозможен. Полный replay проходит, но обновление базы, остановившейся до этой миграции, уничтожит существующие данные.

Не следует переписывать историческую миграцию. Следует хранить этот факт в runbook восстановления и не считать `migrate deploy` со старого snapshot безопасным без предварительной оценки данных.

## Индексы и рост данных

### P2: sweep открытых звонков выполняет полный scan `Call`

Фоновая задача регулярно делает `findMany({ where: { endedAt: null } })`. Текущий индекс `Call(hostId, createdAt)` этот predicate не обслуживает. По мере накопления истории каждый sweep будет читать всю таблицу.

Подходящий PostgreSQL partial index:

```sql
CREATE INDEX "Call_open_idx"
ON "Call" ("createdAt", "lastActiveAt")
WHERE "endedAt" IS NULL;
```

Конкретный порядок полей следует подтвердить на production-like объёме через `EXPLAIN (ANALYZE, BUFFERS)`.

### P3: cleanup scratch boards и `PushSent` также не имеют целевых индексов

Запросы:

- `Board WHERE scratch = true AND updatedAt < ...`;
- `PushSent WHERE createdAt < ...`;
- expired plans по `User.free/plan/planUntil`.

работают без соответствующих индексов. Пока таблицы малы, это не blocker. Перед заметным ростом стоит снять `pg_stat_statements` и добавить индексы только по подтверждённым планам запросов, чтобы не увеличивать стоимость каждой записи без необходимости.

### P3: часть аналитических endpoint читает полную историю

Некоторые activity/stats запросы загружают все sessions, mistakes, reviews или calendar events пользователя/преподавателя и агрегируют их в Node.js. Это создаёт не только сетевую нагрузку, но и растущий heap процесса.

Рекомендация: добавить временные границы/pagination, переносить простые агрегаты в SQL и проверять планы на production-like данных. Это следует согласовать с отдельным performance review.

## Ограничения значений

Часть доменных значений хранится как свободный `String`:

- `User.plan`, `planSource`, `priceCurrency`;
- `Call.kind`;
- `UserCalendarEvent.recurrence`;
- `AdventLesson.kind/status/outcome`;
- course block/exercise types.

HTTP-валидация защищает не все writers: остаются scripts, background jobs, Prisma Studio и будущие endpoints. Для стабильных наборов лучше использовать Prisma enum или SQL `CHECK`. Для денежных/счётных полей полезны `CHECK (value >= 0)`, если отрицательное значение не имеет отдельного бизнес-смысла. Перед добавлением constraints сначала проверить существующие строки.

## Что сделано хорошо

- Все 46 миграций применяются к чистой PostgreSQL 16 без ручных исправлений.
- Полученная схема не расходится с `schema.prisma`.
- Большинство основных foreign keys имеют осознанный `onDelete`.
- Частые выборки attempts, sessions, card reviews и content items имеют составные индексы.
- `CardReview(cardId, studentId)` и `TeacherStudent(teacherId, studentId)` защищены unique constraints.
- Создание пользователя по invite и password reset выполняются транзакционно.
- Назначение доски использует транзакцию и `pg_advisory_xact_lock`, что защищает важный конкурентный инвариант.
- Токены хранятся в виде hash, а не открытого значения.

## Проверено командами

- `npx prisma validate` — **PASS**.
- `npx prisma generate` — **PASS**.
- `prisma migrate deploy` на пустой PostgreSQL 16 — **PASS**, применены 46/46 миграций.
- `prisma migrate status` — **PASS**, database schema is up to date.
- `prisma migrate diff --from-url ... --to-schema-datamodel ... --exit-code` — **PASS**, difference отсутствует.
- Runtime `trialReport.findUnique({ where: { callId } })` — **FAIL**, подтверждён `PrismaClientValidationError`.
- Две записи `Classroom` с одинаковым `teacherId` и `studentId IS NULL` — **обе приняты БД**, риск дубликата подтверждён.

Локальная БД `english_lms` из инструкции оказалась недоступна под текущим системным пользователем (`role "jin" does not exist`), а `server/.env` в checkout отсутствует. Поэтому состояние локальных данных и возможные существующие дубликаты не проверялись.

## Рекомендуемый порядок исправления

1. Исправить отношение `TrialReport ↔ Call`, предварительно проверив production на duplicates/orphans.
2. Сделать создание trial call/report одной транзакцией и добавить regression test.
3. Устранить дубликаты personal space и добавить partial unique index.
4. Обернуть course import в транзакцию и валидировать весь payload до записи.
5. Защитить personal vocab set, нормализованное слово и позиции от гонок.
6. Принять явное решение по всем внутренним ID без foreign key.
7. Добавить migration replay + drift check в CI.
8. Снять query plans на production-like данных и добавить индексы для open-call/scratch cleanup только после измерения.

## Вывод

Миграции технически воспроизводимы, но этого недостаточно для гарантии целостности. До исправления `TrialReport.callId` повторный запуск пробного урока имеет подтверждённый runtime-дефект. До добавления database constraints и integration tests personal space, импорт курса и словарь остаются уязвимыми к частичным и конкурентным записям.
