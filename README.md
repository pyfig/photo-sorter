# Photo Sorter

Photo Sorter - облачный AI-сервис для сортировки фото по лицам с цельным и читаемым web-интерфейсом.

Текущая целевая архитектура:

- `Next.js` web app на Vercel
- `Supabase` для Postgres, Auth и Storage
- отдельный `Python worker` для face detection, embeddings и clustering
- очередь задач через таблицы Supabase

Проект решает сценарий: пользователь загружает пакет фотографий, а сервис сразу начинает preprocessing каждой успешно переданной фотографии и автоматически завершает общую обработку после закрытия upload batch.

## Status

Репозиторий содержит:

- актуализированную спецификацию под `Supabase + Vercel`
- `Next.js` приложение с production-only auth/upload/job flow
- live-обновление job/workspace через `Supabase Realtime`
- страницу результата человека с bbox на изображении и face-метриками в футере карточки
- rename flow для person clusters через существующий `display_name`
- единый brand mark для favicon и header
- базовую схему Supabase c RLS, buckets и queue function
- Python worker для асинхронной обработки jobs

## Architecture

End-to-end поток:

1. Пользователь регистрируется или входит в приложение через Supabase Auth по email и паролю.
2. Если workspace еще нет, создает его в UI.
3. Создает upload batch и запускает bounded-parallel upload фотографий в `Supabase Storage`.
4. После каждого успешного upload web app сразу регистрирует фото в `photos` и создает `photo_processing_task`.
5. На первом успешно зарегистрированном фото web app автоматически создает upload-level `processing_job`.
6. Python worker забирает photo tasks из очереди, строит embeddings и временно складывает их в `staged_faces`.
7. После закрытия upload batch worker автоматически запускает финальную кластеризацию по всему `job_id` и пишет результат в Postgres.
8. UI на Vercel читает initial snapshot из Supabase, затем обновляет job/workspace через `Supabase Realtime`.
9. Пользователь может переименовать группу человека через UI, а `display_name` становится базой для будущего имени папки результата.
10. Preview изображений читаются через signed URLs, raw photos на странице человека идут через приватный cacheable app route, а метрики лиц читаются в футере карточки без текста поверх лица.

## Repository Layout

```text
.
├── AGENTS.md
├── README.md
├── app/
├── components/
├── docs/
├── lib/
├── specs/
├── supabase/
└── worker/
```

## Environment

Скопируйте `.env.example` в `.env.local` для web app и в отдельный `.env`/secret storage для worker.

Обязательные переменные:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_DB_PASSWORD`

## Development Commands

```bash
npm install
npm run dev
python3 -m venv .venv
source .venv/bin/activate
pip install -r worker/requirements.txt
npm run worker
```

## Deploy

### Vercel

- импортировать репозиторий как Next.js project
- добавить публичные и серверные Supabase env vars
- деплоить `main` branch

### Supabase

- создать проект
- применить SQL migration из `supabase/migrations/`
- оставить `Auth -> Email -> Enable signup` включённым
- отключить `Auth -> Email -> Confirm email`
- убедиться, что migration подключила `processing_jobs`, `job_events` и `person_clusters` к `supabase_realtime`

### Worker

- собрать контейнер из `worker/Dockerfile`
- задеплоить на Railway
- передать `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` и `PYTHON_WORKER_*`

## Troubleshooting

Если upload дошёл до обработки, но прогресс не движется:

1. Проверьте `/api/health`.
   Там должен быть `workerRuntime.status = ok`, свежий `last_seen_at`, backlog `queue.photoTasksQueued` / `queue.photoTasksRunning` и понятный снимок очереди.
2. Проверьте, что worker запущен как long-running process.
   Web app только создаёт job, но не обрабатывает её.
3. Проверьте `SUPABASE_SERVICE_ROLE_KEY`.
   Без него worker не сможет стартовать, claim'ить jobs, читать приватные buckets и писать heartbeat.
4. Для локального запуска используйте `npm run worker`.
   Скрипт заранее валидирует env и настроит writable cache directories для ML-библиотек.

Если обработка завершается, но UI не обновляется сам:

1. Проверьте, что migration для `supabase_realtime` применена.
2. Проверьте, что в браузере есть авторизованная Supabase session.
3. Проверьте `Network/WebSocket` и убедитесь, что realtime channel не падает в `CHANNEL_ERROR`.

## Source Of Truth

- проектная рамка: [docs/PROJECT_CHARTER.md](/Users/xdshka/Desktop/photo-sorter/docs/PROJECT_CHARTER.md)
- roadmap: [docs/ROADMAP.md](/Users/xdshka/Desktop/photo-sorter/docs/ROADMAP.md)
- правила разработки: [AGENTS.md](/Users/xdshka/Desktop/photo-sorter/AGENTS.md)
- продуктовая спецификация: [spec.md](/Users/xdshka/Desktop/photo-sorter/specs/001-face-photo-sorter/spec.md)
- технический дизайн: [design.md](/Users/xdshka/Desktop/photo-sorter/specs/001-face-photo-sorter/design.md)

Изменения публичных контрактов сначала идут в спецификацию, затем в код.
