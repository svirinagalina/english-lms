# Обзор платежей и подписок Advent Academy LMS

Дата проверки: 12 октября 2026 года.

Коммит: `707630c` (`review`).

## Область проверки

Проверены оба платежных контура приложения:

- self-service планы `Practice`, `Calls` и `Everything`;
- Stripe Checkout и Customer Portal для рекуррентных подписок;
- Stripe webhook и выдача доступа;
- разовая Stripe-оплата тарифов `Соло` и `Ментор` после пробного урока;
- ручное сообщение «I have paid» и выдача пакета уроков преподавателем;
- ручное назначение self-service плана после оплаты в рублях;
- смена, отмена и истечение подписки;
- удаление аккаунта и перевод free-пользователя к преподавателю;
- хранение платежного состояния в Prisma;
- идемпотентность, дубликаты и произвольный порядок Stripe-событий;
- возвраты, споры, неуспешные платежи и сверка состояния.

Это статическое repository-backed review. Реальный Stripe-аккаунт, production webhook, Checkout, возвраты и банковские операции не вызывались. Проверка не является бухгалтерской, налоговой или юридической консультацией.

## Итог

Happy path self-service подписки собран логично: сумма определяется на сервере, Checkout размещён у Stripe, webhook подписан, Customer Portal позволяет сменить карту, тариф или отменить продление, а доступ вычисляется по серверному состоянию.

Однако текущий контур нельзя считать надёжным источником финансовой истины. В нём нет сущностей платежа и обработанного Stripe-события, а критичные переходы представлены несколькими полями в `User`. Из-за этого обнаружены сценарии, где:

- Stripe продолжает списывать деньги после удаления LMS-аккаунта или подключения пользователя к преподавателю;
- успешная разовая оплата не замечается, если пользователь не вернулся в LMS;
- один пользователь может создать и оплатить несколько параллельных подписок;
- старое webhook-событие способно вернуть устаревший тариф или подписку;
- неуспешное продление в статусе `past_due` может сохранить доступ до далёкого `current_period_end`;
- интерфейс показывает новую цену, а Stripe фактически списывает старую;
- возврат или dispute никак не отражается в LMS.

До исправления P1-сценариев автоматическую выдачу доступа и отсутствие лишних списаний необходимо регулярно сверять со Stripe Dashboard.

## Текущие денежные потоки

| Поток | Как создаётся платёж | Что делает LMS после оплаты |
|---|---|---|
| Self-service подписка | Stripe Checkout `mode=subscription` | webhook записывает `plan`, `planUntil`, `stripeCustomerId`, `stripeSubscriptionId` |
| Смена/отмена self-service плана | Stripe Customer Portal | `customer.subscription.*` обновляет локальный доступ |
| Оплата `Соло`/`Ментор` после trial | Stripe Checkout `mode=payment` | только browser-return `/billing/checkout/verify` ставит `paymentReportedAt` и отправляет письмо |
| Перевод на карту | студент нажимает «I have paid» | ставится `paymentReportedAt`, преподаватель вручную добавляет уроки |
| Ручной self-service план | OWNER указывает план и дату | локально записывается `planSource=manual`, синхронизируется trainer |
| Пакет занятий | преподаватель задаёт `lessonsPaid` | LMS считает проведённые `Session` после `packageStartedAt` |

Это четыре разных бизнес-процесса, но долговременная финансовая история для них отсутствует.

## P1 — блокирующие риски

### 1. Удаление аккаунта и подключение к преподавателю не останавливают подписку

Self-service подписка принадлежит free-пользователю. Но два перехода, после которых она больше не нужна, меняют только локальную БД:

- `server/src/routes/profile.js:137-149` удаляет пользователя без отмены Stripe subscription/customer;
- `server/src/routes/users.js:203-208` меняет `free` на `false`, после чего весь функционал уже включён как ученику преподавателя, но Stripe-подписка продолжает продлеваться.

После удаления пользователя последующие webhook-события просто не находят `userId` и возвращают успешный ответ. Пользователь теряет доступ к LMS и Customer Portal, но внешняя подписка может продолжить списания.

После подключения к преподавателю подписка остаётся в Stripe, а UI сообщает, что ученику и так открыт весь функционал. Это создаёт риск незаметной двойной оплаты.

Рекомендация:

1. Перед удалением аккаунта явно отменять активную подписку или удалять Stripe Customer согласно принятой бизнес-политике.
2. Не удалять локального пользователя, пока Stripe не подтвердил переход; использовать состояние `DELETION_PENDING`, если внешний вызов временно недоступен.
3. При подключении подписчика к преподавателю предложить явный выбор: отменить продление в конце периода, оставить подписку либо зачесть её в стоимость обучения.
4. Добавить reconciliation job, который ищет Stripe-подписки без локального пользователя и `free=false` пользователей с продолжающимся списанием.

### 2. Разовая Stripe-оплата зависит от возвращения браузера

`POST /api/billing/checkout` создаёт Checkout Session в режиме `payment`, но подтверждение реализовано только через `GET /api/billing/checkout/verify` после redirect (`server/src/routes/billing.js:168-187`).

Общий webhook получает `checkout.session.completed`, но обрабатывает его только при наличии `object.subscription` (`server/src/subscriptions.js:159-164`). У разовой оплаты subscription нет, поэтому событие игнорируется.

Если деньги списаны, а пользователь закрыл вкладку, потерял сеть или redirect не открыл LMS:

- `paymentReportedAt` не выставится;
- преподаватель не получит уведомление;
- в БД не останется записи о платеже;
- пользователь увидит списание, а школа может не добавить уроки.

Рекомендация: fulfillment разовой покупки должен выполняться из подписанного webhook независимо от браузера. Browser-return должен только читать уже сохранённое состояние или инициировать безопасную сверку.

Минимальная модель:

```text
Payment
  id
  userId
  kind                 TRIAL_OFFER | SUBSCRIPTION_INVOICE | MANUAL
  provider             STRIPE | BANK_TRANSFER
  providerPaymentId    UNIQUE
  checkoutSessionId    UNIQUE
  amountMinor
  currency
  quotedAmountMinor
  quotedCurrency
  planCode
  status               PENDING | PAID | REFUNDED | DISPUTED | FAILED
  paidAt
  createdAt
  updatedAt
```

Выдачу уроков/уведомление следует делать идемпотентным consumer-ом состояния `PAID`.

### 3. Параллельные Checkout-сессии могут создать несколько активных подписок

`POST /api/plans/subscribe` запрещает новую покупку только когда локальная БД уже содержит активную Stripe-подписку (`server/src/subscriptions.js:183-208`). До первого webhook или browser-return пользователь может:

- открыть Checkout в двух вкладках;
- повторить запрос после неизвестного результата;
- завершить оплату обеих сессий.

Каждая завершённая Checkout Session создаёт отдельную Stripe subscription. В `User` хранится только один `stripeSubscriptionId`, поэтому вторая подписка теряется из локального представления, но продолжает списывать деньги.

Дополнительный дефект находится в `applySubscription`: событие другой подписки игнорируется только для неактивного статуса. Активное событие от любой старой/параллельной подписки снова записывает её ID в пользователя (`server/src/subscriptions.js:120-134`). Состояние может переключаться между двумя подписками.

Рекомендация:

- сохранять `CheckoutAttempt` до обращения к Stripe;
- запрещать более одной незавершённой subscription-сессии на пользователя;
- отправлять `Idempotency-Key` во все создающие/изменяющие POST-запросы Stripe;
- хранить подписки отдельными строками, а не одним ID в `User`;
- при webhook сверять все активные подписки customer-а и автоматически останавливать либо отправлять на ручную обработку дубликаты.

### 4. Webhook применяет устаревшие snapshot-события как текущее состояние

Stripe не гарантирует порядок доставки и может доставить одно событие повторно. Текущий handler:

- не хранит `event.id`;
- для `customer.subscription.*` применяет `event.data.object` напрямую;
- не получает актуальную Subscription из Stripe;
- не имеет версии локального состояния;
- не защищает переходы транзакцией с записью обработанного события.

Сценарий:

1. Подписка отменена, LMS очистила доступ.
2. Позже приходит retry более старого `customer.subscription.updated` со статусом `active`.
3. `applySubscription` снова выдаёт план и устанавливает старый срок.

Для двух подписок риск выше: активное старое событие ещё и заменяет `stripeSubscriptionId`.

Рекомендация:

- создать `StripeEvent(eventId UNIQUE, objectId, eventType, receivedAt, processedAt, status, error)`;
- сначала атомарно резервировать событие, повторный `event.id` отвечать `2xx` без повторного эффекта;
- по событию получать актуальную Subscription через Stripe API и применять её текущее состояние;
- обновлять Payment/Subscription и фиксировать обработанное событие в одной локальной транзакции;
- при временной ошибке оставлять событие для retry/reconciliation.

### 5. `past_due` считается оплаченным доступом

В `server/src/subscriptions.js:124-130` статусы `active`, `trialing` и `past_due` одинаково считаются live. Срок берётся из `current_period_end` и увеличивается ещё на сутки.

`past_due` означает, что очередной платёж не прошёл или требует действия. В зависимости от настроек Stripe период подписки уже может указывать на следующий месяц или год. Поэтому годовой тариф с неуспешным продлением потенциально сохраняет доступ намного дольше заявленного «одного дня grace».

Webhook не подписан на `invoice.payment_failed` и `invoice.payment_action_required`; нет собственного `graceUntil`, причины блокировки и уведомления пользователю.

Рекомендация:

- разделить `providerStatus`, `accessStatus`, `currentPeriodEnd` и `graceUntil`;
- выдавать новый оплаченный период по `invoice.paid`;
- для `past_due` задавать фиксированный короткий grace от момента неуспеха, а не от `current_period_end`;
- после grace блокировать платные возможности, сохраняя доступ к Customer Portal;
- обрабатывать `invoice.payment_failed` и `invoice.payment_action_required`.

### 6. Отображаемая цена может отличаться от цены списания

UI получает цены из `server/src/plans.js`, а Checkout находит ранее созданный Stripe Price только по `lookup_key` (`server/src/subscriptions.js:55-66`, `195-203`). Setup проверяет лишь наличие ключа и не сравнивает:

- `unit_amount`;
- валюту;
- recurring interval;
- product metadata;
- live/test mode конфигурации.

Stripe Price не позволяет изменить сумму существующей цены. Если цена в коде изменится, повторный setup сочтёт старую цену готовой. На экране будет одна сумма, а Checkout спишет другую.

Рекомендация: setup должен валидировать каждый Price против каталога в коде. При расхождении создать новый Price, безопасно перенести `lookup_key`, деактивировать старый для новых продаж и явно решить судьбу существующих подписок. Непосредственно перед созданием Checkout полезно ещё раз проверить сумму, currency и interval найденной цены.

## P2 — существенные пробелы

### Возвраты, disputes и chargebacks не отражаются в LMS

В webhook отсутствуют `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `payment_intent.payment_failed` и эквивалентные события. В БД нет Payment, поэтому нельзя связать возврат с доступом или пакетом уроков.

Необходимо заранее определить бизнес-правило: отзыв доступа, уменьшение неиспользованного пакета, ручная проверка или сохранение уже оказанной услуги. Автоматическое удаление проведённых уроков недопустимо; спорные случаи лучше переводить в `MANUAL_REVIEW`.

### Повторная проверка разовой оплаты повторно уведомляет преподавателей

`GET /billing/checkout/verify` на каждом вызове заново:

- записывает текущий `paymentReportedAt`;
- отправляет письмо всем преподавателям.

Выбранное ранее `paymentReportedAt` не используется для дедупликации. Повтор URL, refresh или два параллельных запроса дают повторные уведомления. Уникальный `checkoutSessionId` в Payment должен сделать fulfillment exactly-once на уровне бизнес-эффекта.

### Ручной план конфликтует со Stripe-состоянием

`PUT /plans/manual/:userId` меняет `plan`, `planUntil` и `planSource`, но не очищает и не отменяет `stripeSubscriptionId`. Следующий Stripe webhook может молча перезаписать ручное решение. При снятии ручного плана Stripe IDs также остаются.

API должен запрещать manual override при активной Stripe subscription либо требовать явного действия над внешней подпиской и сохранять audit reason/operator.

### Настройки Stripe глобальны, хотя данные разделены по школам

`PlatformSetting` хранит единственные глобальные `stripe.key`, `stripe.webhook` и `stripe.portal`, а routes доступны через `requireRole('OWNER')`. При этом текущая реализация `requireRole` также пропускает `PARTNER` на OWNER-only routes (`server/src/auth.js:97-106`).

Если в одной БД действительно возможны несколько школ, OWNER или PARTNER одной школы может изменить общий Stripe-аккаунт для всех. Нужно либо формально закрепить single-tenant deployment, либо привязать Stripe configuration/customer/payment к `schoolId` и строго ограничить управление ролью OWNER соответствующей школы.

### Успешная оплата не гарантирует синхронизацию внешнего trainer

`setPlan` сохраняет план, затем запускает `syncTrainer(userId)` без `await` (`server/src/plans.js:76-83`). Ошибка логируется и забывается. Активная подписка не попадает в периодическую повторную синхронизацию; sweep повторяет её только при истечении.

Следовательно, LMS может показать оплаченный Practice, а trainer останется на trial. Нужен outbox/job с retry, состоянием доставки и периодической сверкой.

### Пользователь теряет кнопку управления после блокировки доступа

`planView.canManage` требует одновременно `stripeSubscriptionId` и активный план (`server/src/plans.js:34-39`). После истечения или блокировки оплаты UI скрывает Customer Portal, хотя именно тогда пользователю нужно обновить карту, увидеть invoice или окончательно отменить подписку.

Доступность Portal следует определять по `stripeCustomerId`/существованию subscription, а не по entitlement.

### Разовый тариф обозначен как ежемесячный, но не создаёт подписку

В интерфейсе `Соло` и `Ментор` показываются с суффиксом `/мес`, однако Checkout работает в `mode=payment`. После оплаты LMS только просит преподавателя вручную добавить уроки и не создаёт следующего списания.

Если это первый разовый платёж за пакет, текст должен прямо так и говорить. Если ожидается ежемесячное автопродление, нужен отдельный subscription-контракт, правила отмены и webhook lifecycle.

### Нет закреплённой версии Stripe API и request audit

REST-вызовы выполняются вручную через `fetch` без `Stripe-Version`; форма webhook зависит от API version аккаунта. Не сохраняются Stripe `Request-Id`, event API version и результат внешнего запроса.

Рекомендуется использовать официальный Stripe SDK либо как минимум закрепить и протестировать API version, логировать безопасные request/event IDs и покрыть контракт fixtures разных статусов.

## Что сделано хорошо

- Webhook смонтирован до `express.json`, поэтому подпись проверяется по raw body.
- Используются HMAC, ограничение возраста подписи и `timingSafeEqual`.
- Secret key и webhook secret не отправляются браузеру; значения в БД зашифрованы AES-256-GCM.
- Checkout Session создаётся сервером, а план выбирается из серверного allowlist.
- Суммы self-service планов и разовой покупки передаются в minor units.
- Возврат из Checkout привязан к `client_reference_id`, поэтому пользователь не может проверить чужую сессию.
- Customer Portal используется для смены карты, тарифа, периода и отмены в конце периода.
- Portal configuration отделена от возможных других продуктов Stripe-аккаунта.
- Для ручного изменения пакета преподаватель ограничен своими учениками, а student lookup ограничен школой.
- Платёжные ссылки валидируются как HTTPS.
- Нативное приложение скрывает внешнюю покупку, а веб-версия оставляет её доступной.

## Целевая модель

Одних полей в `User` недостаточно. Минимально полезное разделение:

```text
User
  currentEntitlements

BillingCustomer
  userId UNIQUE
  provider
  providerCustomerId UNIQUE

Subscription
  userId
  providerSubscriptionId UNIQUE
  planCode
  providerStatus
  accessStatus
  currentPeriodEnd
  graceUntil
  cancelAtPeriodEnd
  lastProviderSyncAt

CheckoutAttempt
  userId
  kind
  idempotencyKey UNIQUE
  checkoutSessionId UNIQUE
  status
  expiresAt

Payment
  providerPaymentId UNIQUE
  checkoutSessionId UNIQUE
  subscriptionId
  amountMinor
  currency
  status
  paidAt

StripeEvent
  eventId UNIQUE
  objectId
  eventType
  status
  receivedAt
  processedAt
  lastError
```

Права доступа должны быть производным состоянием подтверждённой Subscription/Payment, а не единственной копией финансового факта.

## Обязательные тесты

### Webhook

- корректная и ошибочная подпись, несколько `v1` signatures, просроченный timestamp;
- повтор одного `event.id` не повторяет бизнес-эффект;
- `updated(active)` после более нового `deleted` не возвращает доступ;
- события разных подписок одного пользователя не переключают активную подписку случайно;
- `checkout.session.completed` для `mode=payment` сохраняет Payment без browser-return;
- webhook падает до commit, Stripe retry успешно завершает обработку;
- refund/dispute переводит платёж в ожидаемое состояние.

### Subscription lifecycle

- initial payment success/failure/SCA;
- renewal paid, `past_due`, `unpaid`, `paused`, `canceled`;
- cancel at period end и immediate cancel;
- upgrade/downgrade с proration и неуспешной доплатой;
- две параллельные Checkout Session;
- ручной план при существующей Stripe subscription;
- изменение цены в коде при старом Stripe Price;
- удаление пользователя и подключение к преподавателю при активной подписке.

### Разовая оплата и пакет уроков

- оплачено, но redirect не состоялся;
- verify вызван несколько раз и параллельно;
- оплата возвращена после выдачи пакета;
- письмо не отправилось после commit — повторная job доставляет его;
- два одновременных «I have paid» не создают два уведомления;
- amount/currency/plan в Payment совпадают с Checkout Session.

### Авторизация и tenant isolation

- STUDENT не меняет manual plan и package;
- TEACHER меняет только своих учеников;
- PARTNER не меняет Stripe secret/setup, если операция действительно OWNER-only;
- OWNER одной школы не видит и не меняет биллинг другой школы;
- пользователь не открывает Portal чужого Stripe Customer.

## Рекомендуемый порядок исправления

1. Сделать webhook источником fulfillment разовых оплат и добавить `Payment` с уникальным Checkout Session/Payment ID.
2. Остановить списания при удалении аккаунта и определить поведение подписки при подключении к преподавателю.
3. Добавить `CheckoutAttempt`, Stripe idempotency keys и защиту от параллельных подписок.
4. Добавить `StripeEvent` inbox, дедупликацию и получение актуальной Subscription вместо применения старого snapshot.
5. Разделить provider status, entitlement и фиксированный grace; обработать failed/action-required invoices.
6. Ввести проверку каталога Stripe Price против цен в коде и процедуру безопасной смены цены.
7. Добавить refund/dispute lifecycle, финансовый audit trail и ручную очередь спорных случаев.
8. Сделать trainer/email side effects устойчивыми через outbox/job queue.
9. Закрепить Stripe API version и добавить интеграционные тесты со Stripe CLI/test mode.
10. После исправлений выполнить reconciliation production Stripe ↔ LMS и независимую проверку реальных сценариев оплаты.

## Проверено командами

- `node --check server/src/subscriptions.js` — **PASS**.
- `node --check server/src/plans.js` — **PASS**.
- `node --check server/src/routes/billing.js` — **PASS**.
- `DATABASE_URL=postgresql://review:review@127.0.0.1:5432/review npx prisma validate` — **PASS**; соединение с БД для validate не выполнялось.
- `npm --prefix client run build` — **PASS**, 652 модуля; precompression завершён, осталось предупреждение о chunks больше 500 kB.

Автоматических server/integration тестов платежного контура в репозитории нет. Реальные Stripe API и webhook не вызывались, потому что это могло бы создать объекты или операции во внешнем аккаунте.

## Использованные правила Stripe

- Stripe предупреждает, что webhook может доставляться повторно, и рекомендует сохранять обработанные event IDs: <https://docs.stripe.com/webhooks#handle-duplicate-events>.
- Порядок доставки webhook не гарантирован; недостающие и актуальные объекты следует получать через API: <https://docs.stripe.com/webhooks#event-ordering>.
- Все Stripe POST поддерживают `Idempotency-Key` для безопасного повторения создающих запросов: <https://docs.stripe.com/api/idempotent_requests>.
- `invoice.payment_failed` обозначает неуспешный платёж, а `past_due` не равен подтверждённой оплате: <https://docs.stripe.com/api/events/types> и <https://docs.stripe.com/api/subscriptions/object>.
- Отмена Subscription останавливает будущие списания, а удаление Stripe Customer также отменяет активные подписки: <https://docs.stripe.com/api/subscriptions/cancel> и <https://docs.stripe.com/api/customers/delete>.
- Сумма существующего Stripe Price не обновляется обычным update; для новой суммы нужен новый Price: <https://docs.stripe.com/api/prices/update>.

## Вывод

Платёжный интерфейс выглядит завершённым, но финансовая надёжность пока держится на happy path и ручном контроле. Самые опасные дефекты находятся на границах жизненного цикла: пользователь уже заплатил, не вернулся из Checkout, удалил аккаунт, стал учеником преподавателя, открыл две оплаты, получил неуспешное продление или возвратил деньги.

До устранения P1 нельзя полагаться на локальные `plan`, `planUntil` и `paymentReportedAt` как на доказательство оплаты. Нужны отдельные неизменяемые записи платежей и событий, идемпотентный webhook fulfillment, явная отмена внешних подписок и регулярная сверка со Stripe.
