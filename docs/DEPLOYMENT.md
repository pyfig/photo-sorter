# Deployment Runbook

## Target topology

- `Vercel`: Next.js web app
- `Supabase`: Postgres, Auth, Storage, RLS
- `Railway`: Python worker

## Supabase

1. Создать проект и получить:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Применить SQL migration из `supabase/migrations/`.
3. В `Authentication -> URL Configuration` задать:
   - `Site URL`: production URL Vercel
4. В `Authentication -> Providers -> Email` проверить:
   - `Enable email signup`: включен
   - `Confirm email`: выключен
5. Проверить, что buckets `raw-photos`, `face-previews`, `derived-artifacts` созданы migration и остались приватными.
6. Проверить, что таблицы `processing_jobs`, `job_events`, `person_clusters` подключены к `supabase_realtime`.

## Vercel

1. Импортировать репозиторий как Next.js project.
2. Добавить env:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Задеплоить `main`.
4. Проверить:
   - `/login`
   - `/api/health`
   - регистрация по email + password
   - повторный вход по email + password

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
   - `SUPABASE_SERVICE_ROLE_KEY` реально задан и не пустой

## Smoke checks

- пользователь регистрируется по email + password и сразу попадает в приложение
- существующий пользователь входит по email + password
- создается workspace из UI
- upload batch пишет файлы в `raw-photos`
- `/api/workspaces/[workspaceId]/jobs` создает `queued` job
- worker публикует heartbeat в `worker_heartbeats`
- worker переводит job в `running/completed`
- job details меняет progress/status без `F5`
- workspace показывает новые clusters без `F5`
- UI отображает clusters, previews и job events
- повторное открытие одного и того же person не перекачивает все raw photos с нуля

## Troubleshooting

- Если jobs остаются в `queued`, сначала проверьте `/api/health`.
- Если `workerRuntime` не `ok`, отдельный Python worker не публикует свежий heartbeat и очередь фактически не обслуживается.
- Если `queuedJobs > 0`, `runningJobs = 0`, а `workerRuntime.error` сообщает про missing/stale heartbeat, consumer очереди не запущен или стартует без service-role ключа.
- Если job завершилась, но экран не обновился live, проверьте наличие таблиц в `supabase_realtime` publication и ошибки Realtime в браузере.
- Для локальной проверки используйте `npm run worker`, а не raw `python -m worker.main`.

## Rollback

- `Vercel`: rollback на предыдущий deployment
- `Railway`: rollback на предыдущий image/release
- `Supabase`: schema rollback не делать вручную ad hoc; использовать отдельную migration или forward-fix
