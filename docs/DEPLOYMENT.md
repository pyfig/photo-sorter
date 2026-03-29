# Deployment Runbook

## Target topology

- `Vercel`: Next.js web app
- `Supabase`: Postgres, Auth, Storage, RLS
- `Railway`: Python worker
- `Resend SMTP`: доставка magic link через Supabase Auth

## Supabase

1. Создать проект и получить:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Применить SQL migration из `supabase/migrations/`.
3. В `Authentication -> URL Configuration` задать:
   - `Site URL`: production URL Vercel
   - `Redirect URLs`: `https://<vercel-domain>/auth/confirm`
4. В `Authentication -> SMTP Settings` включить custom SMTP и задать `Resend SMTP`.
5. Проверить, что buckets `raw-photos`, `face-previews`, `derived-artifacts` созданы migration и остались приватными.

## Vercel

1. Импортировать репозиторий как Next.js project.
2. Добавить env:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Задеплоить `main`.
4. Проверить:
   - `/login`
   - `/api/health`
   - magic link redirect на `/auth/confirm`

## Railway

1. Создать service из `worker/Dockerfile`.
2. Добавить env:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WORKER_ID`
   - `PYTHON_WORKER_POLL_INTERVAL_SECONDS`
   - `PYTHON_WORKER_CLUSTER_EPS`
   - `PYTHON_WORKER_CLUSTER_MIN_SAMPLES`
   - `PYTHON_WORKER_MIN_FACE_SIZE`
   - `PYTHON_WORKER_MODEL_NAME`
3. Убедиться, что service работает как long-running worker, а не как web endpoint.
4. Проверить логи на старте:
   - worker поднялся
   - нет ошибок по InsightFace/onnxruntime
   - worker может claim'ить queued job

## Smoke checks

- пользователь получает magic link и логинится
- создается workspace из UI
- upload batch пишет файлы в `raw-photos`
- `/api/workspaces/[workspaceId]/jobs` создает `queued` job
- worker переводит job в `running/completed`
- UI отображает clusters, previews и job events

## Rollback

- `Vercel`: rollback на предыдущий deployment
- `Railway`: rollback на предыдущий image/release
- `Supabase`: schema rollback не делать вручную ad hoc; использовать отдельную migration или forward-fix
