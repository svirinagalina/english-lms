# Обзор проекта Advent Academy LMS

Проект представляет собой полноценную LMS для онлайн-школы английского языка. Это не набор микросервисов, а одно приложение из трёх крупных частей:

```text
english-lms
├── client/   React SPA: кабинеты, уроки, доска, звонки, упражнения
├── server/   Express API + Socket.IO + Prisma/PostgreSQL
├── mobile/   Capacitor-оболочка для iOS и Android
└── deploy/   сборка, доставка и запуск production
```

## 1. Клиент — `client/`

Стек: React 18, React Router, Vite, обычный JavaScript и CSS. Основная карта страниц находится в `client/src/App.jsx`, меню с разделением по ролям — в `client/src/components/Nav.jsx`.

### Classroom

Главная рабочая область преподавателя и студента:

- список студентов и преподавателей;
- личные и назначенные доски;
- запуск обычного или пробного урока;
- подключение учебников;
- история занятий;
- пакеты оплаченных уроков.

Основные файлы:

- `client/src/pages/Classrooms.jsx` — список кабинетов;
- `client/src/pages/Classroom.jsx` — конкретный кабинет;
- `client/src/components/StudentHome.jsx` — домашняя страница ученика.

### Интерактивная доска

Одна из самых развитых частей проекта. Есть:

- рисование, фигуры, стрелки, текст и заметки;
- вставка и обрезка изображений;
- PDF-учебники;
- синхронные курсоры;
- spotlight — преподаватель показывает всем нужную область;
- undo/redo;
- OCR текста на картинках через Tesseract;
- добавление слов в словарь;
- фиксация ошибок ученика прямо на доске;
- мобильный режим управления пальцами.

Почти вся клиентская логика находится в `client/src/components/Whiteboard.jsx`. Сервер хранит элементы доски JSON-массивом через `server/src/boardStore.js`.

### Видеоуроки и звонки

`client/src/pages/Call.jsx` объединяет:

- видео и аудио;
- демонстрацию экрана;
- чат и реакции;
- доску и Writing;
- P2P WebRTC;
- альтернативный режим через LiveKit SFU;
- подавление шума;
- виртуальный фон;
- диагностику качества соединения;
- восстановление микрофона и переподключение.

Серверная сигнализация находится в `server/src/signaling.js`. Через Socket.IO передаются WebRTC offer/answer/ICE, сообщения, реакции, изменения доски и Writing.

### Writing

Совместный текстовый редактор находится в `client/src/components/Writing.jsx`. Поддерживаются:

- правки преподавателя как tracked changes;
- принятие и отклонение исправлений;
- заголовки и содержание;
- подсветка и зачёркивание;
- вставка изображений и скриншотов;
- автокоррекция;
- Vim-режим;
- синхронизация между участниками.

Документ хранится как набор текстовых фрагментов `base`, `ins`, `del`, `image` через `server/src/docStore.js`.

### Practice и прогресс

В проекте есть отдельная система грамматических упражнений:

- `TRANSLATE`;
- `FILL_BLANK`;
- `CHOICE`;
- `WORD_ORDER`;
- `MATCHING`;
- проверка ответов;
- классификация ошибок по грамматическим темам;
- рекомендации, что повторить;
- статистика ученика и преподавателя.

Основные страницы:

- `client/src/pages/Practice.jsx`;
- `client/src/pages/UnitPractice.jsx`;
- `client/src/pages/Stats.jsx`;
- `client/src/pages/MistakePractice.jsx`.

### Словарь

Есть:

- общие и персональные наборы слов;
- интервальное повторение;
- автоматическая проверка перевода;
- транскрипция;
- произношение;
- слова, сохранённые с доски;
- собственный словарь ученика.

Основные файлы: `client/src/pages/Vocabulary.jsx`, `client/src/pages/VocabSet.jsx`, `client/src/components/WordCard.jsx`.

### Courses

Отдельная подсистема самостоятельных курсов:

- направления/skillsets;
- курсы;
- упорядоченные уроки;
- текстовые, HTML-, видео-, файловые и графические блоки;
- тесты, пропуски, matching, true/false и эссе.

UI находится в `client/src/pages/Courses.jsx` и `client/src/pages/Course.jsx`.

### Организационные разделы

Также реализованы:

- `People` — пользователи, роли, приглашения, связи преподаватель–ученик;
- `Timetable` — расписание, повторяющиеся занятия и часовые пояса;
- `Billing` — пакеты уроков, оплаты, Stripe и ручное подтверждение;
- `Trial reports` — результаты пробного урока;
- `Textbooks` — PDF и аудиозаписи к учебникам;
- `Content` — контент-конвейер `SOURCE → EDITING → READY`;
- `Todo` — задачи владельца;
- `Settings` — AI, Stripe, LiveKit, push и внешние интеграции;
- публичные Landing и IELTS-страницы.

## 2. Сервер — `server/`

Сервер запускается из `server/src/index.js`.

```text
React
 ├── REST /api/*
 └── Socket.IO
          ↓
Express
 ├── routes/*
 ├── бизнес-сервисы
 ├── Prisma
 └── PostgreSQL
```

Маршруты разбиты по предметным областям: `auth`, `users`, `classrooms`, `calls`, `units`, `vocab`, `billing`, `courses`, `trials`, `content`, `push`, `settings` и другие.

### Данные

Схема находится в `server/prisma/schema.prisma`. Ключевые сущности:

- `School`, `User`;
- `TeacherStudent`, `Classroom`;
- `Board`, `Document`, `Session`, `Call`;
- `Unit`, `Exercise`, `Attempt`;
- `VocabSet`, `VocabCard`, `CardReview`;
- `LessonMistake`, `LessonSummary`, `TrialReport`;
- `Course`, `CourseLesson`, `CourseLessonBlock`, `CourseExercise`;
- `Textbook`, `ContentItem`;
- расписание, push-устройства, подписки и активность.

Поддерживаются роли `OWNER`, `TEACHER`, `STUDENT`, `PARTNER`.

### Аутентификация

В `server/src/auth.js`:

- JWT хранится в `HttpOnly` cookie;
- срок сессии — семь дней;
- роль на каждом запросе перечитывается из БД;
- пароли хешируются `bcrypt`;
- есть подтверждение email и сброс пароля;
- отдельные Bearer-токены разрешены для Content API;
- добавлены rate limits на вход, регистрацию и платные AI-запросы.

### Интеграции

Проект умеет работать с:

- OpenAI, Anthropic, DeepSeek и xAI;
- LiveKit;
- Stripe;
- APNs push-уведомлениями;
- внешним Advent Trainer;
- email;
- WebRTC TURN/STUN;
- Tesseract OCR;
- MediaPipe и RNNoise.

Ключи некоторых интеграций можно задавать через административный интерфейс, сервер хранит их зашифрованными.

## 3. Мобильное приложение — `mobile/`

Это не отдельная мобильная реализация интерфейса, а Capacitor-контейнер вокруг production-сайта. Конфигурация находится в `mobile/capacitor.config.json`.

Есть:

- iOS- и Android-проекты;
- splash screen и status bar;
- native push notifications;
- offline-страница;
- переходы из push-уведомлений в нужный раздел приложения.

Основная бизнес-логика остаётся общей с веб-клиентом.

## 4. Развёртывание

Сценарий `deploy/deploy.sh`:

1. Проверяет, не идёт ли сейчас урок.
2. Собирает React-клиент.
3. Копирует сервер и клиент на production.
4. Пересобирает Docker-контейнер.
5. Выполняет Prisma migrations.
6. Проверяет `/api/health`.

В production Express также раздаёт собранный SPA, Brotli-файлы и uploads. Сервер собирается из `server/Dockerfile` на Node.js 22.

## 5. Что важно учитывать разработчику

- Автоматических тестов практически нет: обнаружены только стандартные Android example-тесты. В `client` и `server` нет npm-скрипта `test`.
- Самые рискованные файлы — `Whiteboard.jsx`, `Call.jsx`, `Writing.jsx` и `signaling.js`: они крупные и объединяют много состояний и сценариев.
- Доски и документы сначала меняются в памяти процесса и сохраняются в PostgreSQL с задержкой. При штатном завершении сервер пытается принудительно сбросить ожидающие изменения.
- Проект написан на обычном JavaScript без TypeScript.
- Корневого README нет; наиболее подробное описание устройства и истории решений находится в `CLAUDE.md`.

