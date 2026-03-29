# Spec 001: Face Photo Sorter Cloud

## Summary

Система должна принимать фотографии через web-приложение, аутентифицировать пользователя через Supabase Auth email magic link, хранить исходные файлы в Supabase Storage, ставить обработку в очередь через Supabase Postgres и показывать результат кластеризации лиц в Next.js интерфейсе на Vercel.

## Scope

Этот spec описывает текущий v1:

- web-first flow
- multi-user workspaces
- Supabase Auth, Postgres и Storage
- асинхронные jobs через таблицу `processing_jobs`
- Python worker с InsightFace и DBSCAN
- просмотр jobs и person clusters в UI
- production-only runtime без demo/mock fallback

Вне scope:

- ручной merge/split кластеров
- облачные ML API
- CLI как основной entrypoint
- мобильные клиенты

## User Scenarios

### Scenario 1. Upload and process

Пользователь входит в приложение по email magic link, создает workspace, создает upload batch, загружает фото и запускает processing job.

### Scenario 2. Review results

Пользователь открывает job details и видит статус, прогресс и журнал событий.

### Scenario 3. Browse people

После завершения job пользователь открывает person cluster и просматривает связанные фотографии.
На странице человека сервис показывает рамку детектированного лица и confidence детектора в процентах для каждой подходящей фотографии.

### Scenario 4. Multi-face image

Если на одном фото несколько людей, один и тот же `photo_id` должен быть связан с несколькими `person_clusters`.

## Public Contracts

### Web Routes

- `/`
- `/login`
- `/auth/confirm`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/uploads`
- `/workspaces/[workspaceId]/jobs/[jobId]`
- `/workspaces/[workspaceId]/people/[personId]`

### API Routes

- `GET /api/health`
- `POST /api/workspaces/[workspaceId]/uploads`
- `POST /api/workspaces/[workspaceId]/uploads/[uploadId]/photos`
- `POST /api/workspaces/[workspaceId]/jobs`

### Storage Buckets

- `raw-photos`
- `face-previews`
- `derived-artifacts`

### Job Statuses

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

## Data Model

Обязательные сущности:

- `workspaces`
- `workspace_members`
- `photo_uploads`
- `photos`
- `processing_jobs`
- `worker_heartbeats`
- `person_clusters`
- `detected_faces`
- `cluster_photos`
- `job_events`

### Output Contract

Результат обработки считается успешным, если:

- в `person_clusters` созданы записи по найденным людям
- в `detected_faces` записаны face bounding boxes
- в `cluster_photos` отражена связь cluster -> photo
- превью загружены в `face-previews`
- `processing_jobs.status = completed`
- UI получает доступ к preview и raw photos через signed URLs, а не через public buckets

## Behavioral Requirements

- При отсутствии обязательных env web app не должен показывать demo/mock данные.
- Web app не выполняет тяжелый ML pipeline.
- Неаутентифицированный пользователь перенаправляется на `/login`.
- Пользователь без workspace видит onboarding и может создать workspace из UI.
- Login реализован через Supabase Auth email magic link и callback route `/auth/confirm`.
- Worker должен забирать job атомарно через функцию очереди.
- Worker должен публиковать heartbeat в `worker_heartbeats` на старте, при idle-poll и во время активной job.
- Фото без лиц не должны ломать весь job.
- Ошибка одного файла не должна прерывать всю обработку без записи события в `job_events`.
- Один `photo_id` может принадлежать нескольким кластерам.
- Доступ к данным workspace должен быть изолирован через Auth + RLS.
- Buckets `raw-photos`, `face-previews`, `derived-artifacts` остаются приватными.
- UI должен отображать реальные progress/error/empty states для login, workspace creation, upload и job lifecycle.
- На странице person cluster фотокарточки должны иметь фиксированный формат и не разрастаться из-за больших исходных изображений.
- Если для фотографии есть `detected_faces` текущего `cluster_id`, UI должен поверх изображения показывать face bounding box и confidence детектора.
- Ключевые пользовательские экраны должны объяснять текущий статус и следующий шаг без внешней документации.
- Пользовательский интерфейс должен использовать продуктовый SaaS-язык, а не внутренние инфраструктурные термины по умолчанию.
- Web app должен использовать единый бренд-знак как favicon/tab icon и как знак в основном header.
- Кириллица и латиница должны отображаться согласованно: UI использует шрифты с поддержкой `latin` и `cyrillic`, без визуального рассинхрона между русским и английским текстом.
- Визуальная система web app должна быть цельной для `/`, `/login` и внутренних экранов workspace/upload/job/person, а не только для одного landing-экрана.
- Редизайн может добавлять декоративные solarpunk-мотивы и более тёплый продуктовый tone, но не должен создавать ожидание несуществующих product capabilities вроде форумов, resource sharing workflows или новых backend-сущностей.
- Система должна явно диагностировать ситуацию, когда jobs остаются в `queued` из-за отсутствующего, stale или неготового worker runtime.
- `/api/health` не должен считать worker готовым только по наличию env у web runtime; readiness worker определяется по свежему heartbeat.

## Acceptance Criteria

- Пользователь может запросить magic link по email и завершить login через `/auth/confirm`.
- Аутентифицированный пользователь без workspace может создать workspace из UI.
- Аутентифицированный пользователь может создать upload batch для своего workspace.
- Пользователь может загрузить фотографии в `raw-photos/<workspace_id>/<upload_id>/...` и зарегистрировать их в `photos`.
- Для upload batch можно создать `processing_job` со статусом `queued`.
- Worker переводит job в `running`, пишет progress и завершает его как `completed` или `failed`.
- После завершения job UI показывает список job events.
- После завершения обработки person cluster содержит `display_name`, `preview_path`, `photo_count` и отображается в UI вместе с preview.
- На странице человека фотографии отображаются в фиксированных карточках `4:5`, а confidence лица показывается как процент рядом с bbox.
- Пользователь из другого workspace не может читать чужие jobs, photos и clusters.
- `/api/health` отражает готовность web/admin/worker runtime, доступность Supabase и базовое состояние очереди без demo fallback.
- `/api/health` показывает `last_seen_at`, `worker_id`, freshness threshold и причину деградации, если heartbeat worker отсутствует или устарел.
- Пользователь без гайдов понимает из интерфейса, как войти, создать проект, загрузить фотографии, запустить обработку и открыть результат.
- Favicon/tab icon отображается в браузере, а тот же бренд-знак используется в header приложения.
- Основные экраны выглядят как единая продуктовая среда: согласованные цвета, типографика, карточки, empty states, progress blocks и навигационные элементы.
- Русский и английский текст в одном интерфейсе выглядит согласованно по гарнитуре и не ломает визуальный тон продукта.

## Future Extensions

- ручное переименование и review спорных кластеров
- retry strategy и cancellation UI
- ограничения по quota и batch size
