# AGENTS.md

## Purpose

Этот файл задает правила работы по spec-driven development для облачного проекта `photo-sorter`.

Целевая production-схема:

- web app на Vercel
- Supabase для базы, auth и storage
- отдельный Python worker для ML-обработки

## Working Mode

Обязательный порядок:

1. Обновить спецификацию.
2. Обновить технический дизайн и решения.
3. Зафиксировать изменения в задачах.
4. Реализовать код.
5. Проверить контракты, миграции и observability.
6. Обновить документацию.

## Source Documents

- `docs/PROJECT_CHARTER.md`
- `docs/ROADMAP.md`
- `specs/001-face-photo-sorter/spec.md`
- `specs/001-face-photo-sorter/design.md`
- `specs/001-face-photo-sorter/tasks.md`
- `specs/001-face-photo-sorter/decisions.md`
- `specs/001-face-photo-sorter/risks.md`

Приоритет документов:

1. `spec.md`
2. `design.md`
3. `decisions.md`
4. `tasks.md`
5. `README.md`

## Default Engineering Rules

- Frontend и app layer: `Next.js` на Vercel.
- Data layer: `Supabase Postgres`, `Supabase Auth`, `Supabase Storage`.
- Тяжелый face-processing не выполняется на Vercel.
- ML pipeline реализуется отдельным `Python worker`.
- Очередь задач хранится в Supabase.
- Все schema changes идут через SQL migrations.
- Все публичные маршруты, storage contracts и job statuses сначала фиксируются в `spec.md`.
- Любая новая инфраструктурная зависимость фиксируется в `decisions.md`.

## Subagents

### `spec-owner`

Отвечает за:

- продуктовую спецификацию
- acceptance criteria
- синхронизацию `README.md`, `spec.md`, `tasks.md`

### `web-app`

Отвечает за:

- `Next.js` routes
- UI состояния загрузки, jobs и people
- интеграцию с Supabase Auth и server/browser clients

### `supabase-data`

Отвечает за:

- schema design
- migrations
- RLS policies
- storage bucket contracts

### `worker-ml`

Отвечает за:

- detection
- embeddings
- clustering
- обновление job progress и запись результатов в базу

### `platform-deploy`

Отвечает за:

- Vercel configuration
- worker container/runtime
- env management
- rollback и deploy safety

### `qa-verification`

Отвечает за:

- сценарии тестирования
- проверку multi-user access
- проверку job lifecycle
- smoke validation UI/API/worker

## Handoff Rules

- Изменение web routes требует handoff между `spec-owner` и `web-app`.
- Изменение таблиц или storage policies требует handoff в `supabase-data`.
- Изменение ML pipeline или порогов требует handoff в `worker-ml`.
- Изменение deploy/runtime требует handoff в `platform-deploy`.
- Любая новая проверка или regression scenario требует handoff в `qa-verification`.

## Verification Rules

Перед завершением работы должны быть подтверждены:

- согласованность со `spec.md`
- наличие migration для schema changes
- документирование новых решений и trade-offs
- понятный путь rollback
- диагностируемость ошибок через UI/API/job events/logs

## Change Control

- Публичные API, таблицы и статусы jobs нельзя менять без обновления спецификации.
- RLS policy changes и storage contracts должны быть задокументированы.
- Если задача не отражена в `tasks.md`, она не считается частью утвержденного scope.
