# Обзор тестируемости Advent Academy LMS

Дата проверки: 2026-10-12

Коммит: `57af312` (`main`)

## Область проверки

Проверены:

- test-скрипты и тестовые файлы в `client/`, `server/` и `mobile/`;
- доступные статические и сборочные проверки;
- критичные HTTP-, PostgreSQL-, Socket.IO-, Stripe- и мобильные сценарии;
- структура кода с точки зрения изоляции зависимостей и воспроизводимости тестов;
- минимальный набор проверок, который стоит сделать обязательным перед merge и deploy.

Это review тестового контура, а не доказательство корректности всех функций. Production, реальные платежи, APNs, LiveKit, камера/микрофон и iOS-устройство не тестировались.

## Итог

Автоматического тестового контура у приложения практически нет. В `client/package.json` и `server/package.json` отсутствует даже команда `test`; конфигураций Vitest/Jest/Playwright/Cypress и CI pipeline в репозитории нет. Единственный локальный Android unit test проверяет `2 + 2 = 4`, а instrumented test остался от шаблона Capacitor и ожидает чужой package name.

При этом приложение содержит около 9 тысяч строк серверного JavaScript, 19,5 тысяч строк клиентского JavaScript/JSX, 25 route-модулей, 39 Prisma-моделей, платежи, фоновые задания и многопользовательское Socket.IO-состояние. Production build подтверждает, что файлы собираются, но не проверяет бизнес-поведение, права доступа, транзакционность или восстановление после ошибок.

Текущий статус: **quality gate недостаточен для безопасных изменений**.

## Критичные пробелы

### P1: сервер и клиент не имеют ни одного исполняемого behavioral test suite

Факты:

- `npm test` в `server/` завершается `Missing script: "test"`;
- `npm test` в `client/` завершается так же;
- нет файлов `*.test.*`, `*.spec.*`, каталогов `tests`, `e2e` или конфигурации test runner;
- нет репозиторного CI, который запускал бы сборку, миграции и тесты на каждый change.

В результате изменения в регистрации, ролях, занятиях, словаре, пробных уроках, оплате и подписках проходят без автоматической проверки результата.

Минимальное исправление:

1. Добавить Vitest для `server` и `client`.
2. Добавить Supertest для HTTP integration tests.
3. Поднимать PostgreSQL 16 для integration suite и применять `prisma migrate deploy` с нуля.
4. Добавить Playwright хотя бы для пяти основных пользовательских маршрутов.
5. Завести единый корневой quality gate, который нельзя обойти при merge.

### P1: валидная Prisma-схема и зелёная сборка не ловят реальные runtime-ошибки

В `server/src/routes/trials.js` выполняется:

```js
prisma.trialReport.findUnique({ where: { callId: open.id } })
```

Но `TrialReport.callId` в Prisma-схеме не является `@unique`. Сгенерированный Prisma Client принимает JavaScript-файл при запуске и сборке, но падает при выполнении запроса:

```text
PrismaClientValidationError
TrialReportWhereUniqueInput needs at least one of `id`
```

`prisma validate`, `prisma generate`, `node --check` и frontend build прошли — ни одна из этих проверок дефект не обнаружила. Один HTTP integration test на повторный `POST /api/trials` поймал бы его до production.

Обязательный regression test:

- создать преподавателя, ученика, classroom и board;
- первый запуск trial возвращает `201` и создаёт один `Call` и один `TrialReport`;
- повторный запуск возвращает существующий звонок с `200`;
- в базе по-прежнему один звонок и один отчёт.

### P1: нет тестов на реальные PostgreSQL-ограничения и транзакции

Тесты на mock Prisma здесь недостаточны. Уже подтверждены сценарии, зависящие от поведения PostgreSQL:

- nullable composite unique позволяет создать несколько personal-space classrooms;
- assignment доски использует `pg_advisory_xact_lock`;
- принятие приглашения и password reset используют интерактивные транзакции;
- импорт курса выполняет много связанных записей;
- позиции карточек вычисляются через `count` перед `create`;
- JSON-состояние доски и документа сохраняется с задержкой.

Нужны integration tests на настоящем PostgreSQL 16, включая два параллельных соединения. SQLite и полностью замоканный Prisma не воспроизводят nullable unique, advisory locks, isolation и конкурентные записи.

### P1: нет автоматической проверки авторизации на всём HTTP и Socket.IO периметре

Статическое security review уже нашло проблемы с ролями и Socket.IO. Тестовый контур должен не перечислять отдельные happy paths, а выполнять матрицу:

| Ресурс | Положительные случаи | Обязательные отрицательные случаи |
|---|---|---|
| Classroom/board | владелец, преподаватель, назначенный ученик | другая школа, чужой преподаватель, неназначенный ученик |
| Trial report | преподаватель создаёт и редактирует, ученик читает опубликованный | ученик читает draft, чужая школа, повторная публикация |
| Billing | ученик читает своё, преподаватель меняет доступного ученика | чужой ученик, другая школа, неправильная роль |
| Content | разрешённый автор/редактор | прямой ID другого school, запрещённый upload/download |
| Socket.IO board/doc | участники комнаты | событие без `open`, чужой board/document, подмена element id |

Для каждого mutation endpoint нужны минимум `401`, `403/404`, invalid body, not found и успешный сценарий. Проверять следует и HTTP-ответ, и то, что запрещённая операция ничего не изменила в БД.

### P1: отсутствуют E2E-тесты критичных пользовательских цепочек

Минимальный Playwright smoke suite:

1. Регистрация → подтверждение/вход → открытие доступной практики.
2. Приглашение ученика → принятие → classroom → назначение доски.
3. Преподаватель и ученик подключаются к одному звонку → board/doc изменения видны обоим → reconnect не теряет данные.
4. Пробный урок → отчёт → публикация → ученик видит отчёт и предложение оплаты.
5. Ошибка внешнего AI/словаря/платежа отображается локально и не выбрасывает пользователя из урока.

Реальный Stripe Checkout нельзя запускать в обычном CI. Его границу следует тестировать через локальный fake HTTP server и отдельно иметь ручной release checklist для Stripe test mode.

## Высокий приоритет

### P2: Android-проверки зелёные, но тестируют почти ничего

После `cap sync android` команды `testDebugUnitTest` и `lintDebug` прошли. Однако:

- `ExampleUnitTest` проверяет только `assertEquals(4, 2 + 2)`;
- `ExampleInstrumentedTest` ожидает `com.getcapacitor.app`, тогда как реальный `applicationId` — `online.adventacademy.lms`;
- `testDebugUnitTest` не запускает instrumented test на устройстве или эмуляторе;
- WebView login, cookies, push permission/token, deep links, offline page и возврат из background не проверяются.

Следует удалить шаблонный unit test либо заменить его полезной проверкой. Instrumented test нужно исправить и запускать через `connectedDebugAndroidTest` хотя бы в release pipeline с эмулятором.

### P2: нет lint/type quality gate для JavaScript

Сейчас доступны только:

- `node --check` для серверных `.js`;
- Vite production build для клиентских `.js/.jsx`;
- Android lint.

Нет ESLint, проверки React hooks, поиска неиспользуемого кода и типовой проверки API-объектов. Это особенно рискованно для `Whiteboard.jsx` (~3630 строк), `Call.jsx` (~1954) и `Writing.jsx` (~1226).

Рекомендация: ESLint с `react-hooks`, запретом floating promises в критичных местах и постепенным JSDoc/TypeScript-контрактом для API, socket payload и JSON-полей Prisma.

### P2: время, сеть и фоновые процессы трудно контролировать в тестах

Код напрямую использует `Date.now()`, `setTimeout`, `setInterval`, `fetch`, случайные токены, singleton Prisma и module-level `Map`. Это относится к:

- срокам токенов и подписок;
- sweep открытых звонков;
- push reminders;
- circuit breaker/retry;
- reconnect и delayed save доски/документа.

Не требуется переписывать приложение целиком. Достаточно вынести небольшие зависимости `clock`, `scheduler`, `httpClient`, `tokenGenerator` и lifecycle `start/stop`, чтобы unit tests могли использовать fake timers, а integration tests завершались без висящих интервалов.

### P2: нет regression tests на конкурентные действия

Нужны тесты с `Promise.all`/двумя соединениями:

- два одновременных открытия personal space;
- два запуска одного trial/call;
- два добавления одного слова без учёта регистра;
- два назначения разных досок одному ученику;
- два использования одного password-reset token;
- два Stripe webhook для одного события/подписки;
- reconnect двух редакторов с несохранёнными изменениями.

Проверять нужно не только ответы, но и итоговые cardinality/invariants в БД.

## Предлагаемая тестовая пирамида

### 1. Быстрые unit tests

Запуск на каждый commit, без сети и БД:

- `answerCheck.js`: нормализация и варианты ответа;
- `placementTest.js`: расчёт уровня;
- `offer.js` и `plans.js`: дедлайны и entitlements;
- recurrence календаря и timezone/DST;
- Zod-схемы board/document/socket payload;
- `freeTier.js` на фиксированных наборах идентификаторов;
- pure helpers для lesson summary, billing и Stripe signature.

### 2. HTTP + PostgreSQL integration tests

Один PostgreSQL 16 на test worker, миграции с нуля, отдельная схема/БД на suite. Покрыть:

- signup/login/email verification/password reset;
- invites, teacher-student link и classroom creation;
- CRUD досок и их assignment;
- trial lifecycle;
- billing/package count;
- course import rollback;
- content and file metadata;
- tenant/role matrix.

Каждый test должен сам создавать данные через factories и очищать их транзакцией либо отдельной schema, а не зависеть от локальной `english_lms`.

### 3. Socket.IO integration tests

Поднять HTTP server на случайном порту и подключать несколько `socket.io-client`:

- join/reconnect/disconnect;
- board add/update/delete/clear;
- document update и offline reconnect;
- call session start/end/resume;
- запрет чужого board/document;
- cleanup scratch board;
- сохранение состояния после debounce и restart simulation.

### 4. Browser E2E

Playwright на Chromium; короткий smoke suite на каждый merge, расширенный multi-browser suite перед release. Камеру, микрофон, WebRTC stats, clipboard и push API подменять на уровне browser context. Отдельный ручной сценарий оставить для реального устройства и реального звонка.

### 5. Mobile

- `testDebugUnitTest` и `lintDebug` на каждый mobile change;
- `connectedDebugAndroidTest` в release pipeline;
- отдельный manual checklist для iPhone/iPad: push, permissions, background/foreground, deep link и WebView cookies.

## Рекомендуемый quality gate

После внедрения команды должны быть оформлены как package scripts, а не как знания конкретного разработчика:

```text
server: npm ci -> prisma validate -> unit -> integration
client: npm ci -> lint -> unit -> build
e2e:    playwright test
mobile: cap sync android -> testDebugUnitTest -> lintDebug
db:     prisma migrate deploy on empty PostgreSQL -> schema drift check
```

На первом этапе лучше не вводить высокий глобальный процент coverage: он поощрит тесты простых строк вместо рисковых сценариев. Gate должен требовать:

- 100% прохождение перечисленных critical-path suites;
- regression test на каждый исправленный production-дефект;
- отсутствие падения coverage изменённых модулей;
- запрет merge при неуспешном migration replay или schema drift.

## Проверено командами

- `npm test` в `server/` — **FAIL**, script отсутствует.
- `npm test` в `client/` — **FAIL**, script отсутствует.
- `node --check` для 50 файлов `server/src/**/*.js` — **PASS**.
- `npx prisma validate` — **PASS**.
- `npx prisma generate` — **PASS**.
- `npm run build` в `client/` — **PASS**, 652 модуля; есть предупреждение о chunk > 500 kB.
- `./gradlew testDebugUnitTest lintDebug` после `cap sync android` — **PASS**, 289 Gradle tasks.
- Runtime-вызов `trialReport.findUnique({callId})` на PostgreSQL 16 — **FAIL** с `PrismaClientValidationError`, что подтверждает недостаточность текущих проверок.

## План внедрения

1. Добавить runner, test scripts и CI; зафиксировать Node 22.
2. Первым regression test закрыть повторный запуск trial.
3. Добавить PostgreSQL integration tests для personal space, board assignment и course import rollback.
4. Добавить auth/tenant matrix для HTTP и Socket.IO.
5. Добавить пять Playwright smoke flows.
6. Исправить Android template test и подключить emulator job.
7. После появления базовой защиты постепенно покрывать pure domain functions и frontend states.
