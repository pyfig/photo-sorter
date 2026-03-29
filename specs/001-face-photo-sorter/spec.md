# Spec 001: Face Photo Sorter Cloud

## Summary

Система должна принимать фотографии через web-приложение, хранить исходные файлы в Supabase Storage, ставить обработку в очередь через Supabase Postgres и показывать результат кластеризации лиц в Next.js интерфейсе на Vercel.

## Scope

Этот spec описывает текущий v1:

- web-first flow
- multi-user workspaces
- Supabase Auth, Postgres и Storage
- асинхронные jobs через таблицу `processing_jobs`
- Python worker с InsightFace и DBSCAN
- просмотр jobs и person clusters в UI

Вне scope:

- ручной merge/split кластеров
- облачные ML API
- CLI как основной entrypoint
- мобильные клиенты

## User Scenarios

### Scenario 1. Upload and process

Пользователь входит в приложение, создает upload batch, загружает фото и запускает processing job.

### Scenario 2. Review results

Пользователь открывает job details и видит статус, прогресс и журнал событий.

### Scenario 3. Browse people

После завершения job пользователь открывает person cluster и просматривает связанные фотографии.

### Scenario 4. Multi-face image

Если на одном фото несколько людей, один и тот же `photo_id` должен быть связан с несколькими `person_clusters`.

## Public Contracts

### Web Routes

- `/`
- `/login`
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

## Behavioral Requirements

- Web app не выполняет тяжелый ML pipeline.
- Worker должен забирать job атомарно через функцию очереди.
- Фото без лиц не должны ломать весь job.
- Ошибка одного файла не должна прерывать всю обработку без записи события в `job_events`.
- Один `photo_id` может принадлежать нескольким кластерам.
- Доступ к данным workspace должен быть изолирован через Auth + RLS.

## Acceptance Criteria

- Аутентифицированный пользователь может создать upload batch для своего workspace.
- Для upload batch можно создать `processing_job` со статусом `queued`.
- Worker переводит job в `running`, пишет progress и завершает его как `completed` или `failed`.
- После завершения job UI показывает список job events.
- После завершения обработки person cluster содержит `display_name`, `preview_path` и `photo_count`.
- Пользователь из другого workspace не может читать чужие jobs, photos и clusters.

## Future Extensions

- ручное переименование и review спорных кластеров
- retry strategy и cancellation UI
- ограничения по quota и batch size
