# Design 001: Face Photo Sorter Cloud

## Architecture Overview

Система делится на три runtime-слоя:

1. `Next.js / Vercel`
2. `Supabase`
3. `Python worker`

## Data Flow

### 0. Auth and onboarding

- пользователь вводит email на `/login`
- web app вызывает `supabase.auth.signInWithOtp`
- magic link возвращает пользователя на `/auth/confirm`
- callback route завершает auth session и перенаправляет в `/`
- если у пользователя нет workspace, UI вызывает `bootstrap_workspace(name, slug)` через server action

### 1. Upload orchestration

- UI создает запись в `photo_uploads`
- клиент загружает файлы в `raw-photos/<workspace_id>/<upload_id>/...`
- после загрузки создаются записи в `photos`

### 2. Job orchestration

- UI создает запись в `processing_jobs`
- worker вызывает `claim_next_processing_job(worker_name)`
- функция атомарно переводит первый `queued` job в `running`

### 3. Face processing

- worker скачивает raw images из storage
- запускает InsightFace detection и embeddings
- кластеризует embeddings через DBSCAN
- создает `person_clusters`
- записывает `detected_faces`
- записывает связи `cluster_photos`
- загружает face preview в bucket `face-previews`

### 4. Result rendering

- UI читает workspace summary, jobs, clusters и events из Postgres
- UI генерирует signed URLs для preview и исходных фото через auth-aware server-side client
- страницы используют production-only доступ к Supabase без fallback demo-data

## Modules

### Web app

- `app/`
- `components/`
- `lib/supabase/`
- `lib/data.ts`
- `middleware.ts`

### Data layer

- `supabase/migrations/`
- storage buckets
- RLS policies
- SQL queue function

### Worker

- `worker/config.py`
- `worker/repository.py`
- `worker/processor.py`
- `worker/main.py`

## Reliability And Operability

- единый источник истины по job lifecycle: `processing_jobs`
- аудит ключевых действий: `job_events`
- web app не зависит от локального ML runtime
- worker можно масштабировать отдельно от UI
- service-role ключ используется только worker/runtime automation, не браузером
- `/api/health` проверяет обязательные env и базовую доступность Supabase

## Security Model

- пользовательская изоляция на уровне workspace
- RLS включен для domain tables
- storage policies проверяют membership по `workspace_id` в первом сегменте пути
- Vercel app работает через anon/session context, worker через service-role
- storage buckets остаются приватными; UI использует signed URLs вместо public access

## Failure Handling

- отсутствие обязательных env переводит app в setup/degraded state, а не в demo-режим
- ошибка конкретного фото должна логироваться событием и не останавливать весь batch, если оставшаяся часть job может быть обработана
- фатальная ошибка worker переводит job в `failed` и пишет `job_failed` event
- повторный job создает новые `person_clusters` в рамках нового `job_id`, не перезаписывая прошлый run
