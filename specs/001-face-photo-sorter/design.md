# Design 001: Face Photo Sorter Cloud

## Architecture Overview

Система делится на три runtime-слоя:

1. `Next.js / Vercel`
2. `Supabase`
3. `Python worker`

## Data Flow

### 0. Auth and onboarding

- пользователь открывает `/login` и выбирает `Войти` или `Зарегистрироваться`
- web app вызывает `supabase.auth.signInWithPassword` для повторного входа
- web app вызывает `supabase.auth.signUp` для создания нового пользователя
- при отключенном email confirmation `signUp` сразу создает session
- после успешного `signIn/signUp` UI вызывает auth-aware bootstrap endpoint, который завершает `ensureSharedWorkspaceAccess` и возвращает redirect target
- если у пользователя нет workspace, UI вызывает `bootstrap_workspace(name, slug)` через server action

### 1. Upload orchestration

- UI создает запись в `photo_uploads`
- клиент загружает файлы в `raw-photos/<workspace_id>/<upload_id>/...` с bounded concurrency
- каждое успешно загруженное фото сразу регистрируется в `photos`
- при регистрации первого фото создается upload-level `processing_job`
- для каждого нового `photo_id` создается `photo_processing_task`
- после полного client-side drain upload flow вызывает `/uploads/[uploadId]/complete` и фиксирует `photo_uploads.sealed_at`

### 2. Job orchestration

- upload-level `processing_job` отражает весь pipeline по подборке и остаётся источником истины для UI
- worker upsert'ит состояние в `worker_heartbeats`
- worker вызывает `claim_next_photo_processing_task(worker_name)` и берёт preprocessing одного фото
- после завершения всех связанных photo tasks и после `sealed_at` worker вызывает `claim_next_finalizable_processing_job(worker_name)`
- SQL-функции атомарно claim'ят либо photo task, либо upload job в фазе `finalizing`

### 3. Face processing

- stage `preprocessing`:
  - worker скачивает одно raw image из storage
  - запускает InsightFace detection и embeddings
  - пишет результат в `staged_faces`
  - обновляет counters/progress upload-level job
- stage `finalizing`:
  - worker читает все `staged_faces` текущего `job_id`
  - кластеризует embeddings через DBSCAN
  - создает `person_clusters`
  - записывает `detected_faces`
  - записывает связи `cluster_photos`
  - загружает face preview в bucket `face-previews`
  - очищает staging rows этого `job_id`

### 4. Result rendering

- UI читает workspace summary, jobs, clusters и events из Postgres
- UI получает initial snapshot через SSR и затем подписывается на `processing_jobs`, `job_events` и `person_clusters` через `Supabase Realtime`
- страница person cluster отправляет `PATCH /api/workspaces/[workspaceId]/people/[personId]`, чтобы обновить `display_name` без изменения `system_label`
- `display_name` остаётся единственным пользовательским именем группы; будущий export flow sanitiz'ит его в filesystem-safe имя папки
- при деградации realtime-канала UI использует редкий fallback polling через read-only API routes
- UI генерирует signed URLs только для preview-изображений через auth-aware server-side client
- raw photos отдаются через стабильный приватный app route `/api/workspaces/[workspaceId]/people/[personId]/photos/[photoId]`, чтобы браузер мог переиспользовать HTTP cache между повторными переходами
- страница person cluster читает `detected_faces` для текущего `cluster_id` и группирует их по `photo_id`
- bbox хранится в пиксельных координатах, а overlay на UI пересчитывается в проценты относительно фактического размера загруженного изображения
- подписи не рисуются поверх лица: bbox остаётся только визуальным оверлеем, а метрики переносятся в footer фотокарточки
- дополнительная метрика `размер лица` вычисляется в UI как доля площади bbox от площади исходного изображения после загрузки `naturalWidth/naturalHeight`, без изменения схемы БД
- фотокарточка человека использует фиксированный frame `4:5`, а изображение внутри него рендерится без потери геометрии bbox
- страницы используют production-only доступ к Supabase без fallback demo-data
- ключевые экраны используют продуктовый язык и подсказывают следующий шаг без знания внутренних терминов платформы
- общий app-shell использует единый visual system для home, login и внутренних экранов
- brand mark поставляется как App Router icon asset и одновременно используется в основном header
- типографика опирается на шрифты с `latin + cyrillic` subsets, чтобы русский и английский текст выглядели согласованно
- декоративные природные мотивы реализуются как presentation-layer: CSS gradients, мягкие поверхности и lightweight motion без изменения data contracts
- hero и card typography проектируются под text-safe layout: заголовки не опираются на агрессивный clipping и сохраняют читаемость на узких экранах

## Modules

### Web app

- `app/`
- `components/`
- `lib/supabase/`
- `lib/data.ts`
- `middleware.ts`
- `app/icon.svg`
- read-only API routes для snapshot refresh и raw photo proxy
- mutation route для rename person cluster

### Data layer

- `supabase/migrations/`
- storage buckets
- RLS policies
- SQL queue functions для photo tasks и финализации upload jobs
- `photo_processing_tasks`
- `staged_faces`
- `worker_heartbeats`
- `supabase_realtime` publication для live UI updates

### Worker

- `worker/config.py`
- `worker/repository.py`
- `worker/processor.py`
- `worker/main.py`

## Reliability And Operability

- единый источник истины по job lifecycle: `processing_jobs`
- длительный upload pipeline наблюдается через один upload-level job, а photo tasks остаются внутренней реализацией
- аудит ключевых действий: `job_events`
- liveness worker runtime фиксируется отдельно в `worker_heartbeats`
- web app не зависит от локального ML runtime
- worker можно масштабировать отдельно от UI
- service-role ключ используется только worker/runtime automation, не браузером
- `/api/health` проверяет обязательные env, базовую доступность Supabase, снимок очереди jobs, backlog `photo_processing_tasks` и свежесть heartbeat worker
- live UI updates опираются на `Supabase Realtime`, а не на отдельный websocket runtime в Vercel
- локальный worker entrypoint валидирует env заранее и использует writable cache directories для ML-библиотек
- визуальный редизайн не добавляет новых API или data dependencies; весь декор должен деградировать безопасно до обычного SSR/HTML/CSS
- motion делается через CSS и должен уважать `prefers-reduced-motion`, чтобы UI оставался диагностируемым и доступным

## Security Model

- пользовательская изоляция на уровне workspace
- RLS включен для domain tables
- storage policies проверяют membership по `workspace_id` в первом сегменте пути
- Vercel app работает через anon/session context, worker через service-role
- storage buckets остаются приватными; preview читает signed URLs, а raw photo delivery идёт через auth-aware proxy route внутри Next.js

## Failure Handling

- отсутствие обязательных env переводит app в setup/degraded state, а не в demo-режим
- отсутствие heartbeat от worker переводит operability слой в degraded state даже если env у web runtime настроены
- ошибка конкретного фото должна логироваться событием и не останавливать весь batch, если оставшаяся часть job может быть обработана
- фатальная ошибка конкретного photo task пишет `photo_preprocessing_failed` и не останавливает весь upload pipeline, если остальные фото ещё могут быть обработаны
- фатальная ошибка финальной кластеризации переводит upload-level job в `failed` и пишет `job_failed` event
- повторный job создает новые `person_clusters` в рамках нового `job_id`, не перезаписывая прошлый run
- если Realtime недоступен, job/workspace экраны продолжают обновляться через polling snapshot endpoints без ручного refresh
