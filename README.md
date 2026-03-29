# Photo Sorter

Photo Sorter - облачный AI-сервис для сортировки фото по лицам.

Текущая целевая архитектура:

- `Next.js` web app на Vercel
- `Supabase` для Postgres, Auth и Storage
- отдельный `Python worker` для face detection, embeddings и clustering
- очередь задач через таблицы Supabase

Проект решает сценарий: пользователь загружает пакет фотографий, запускает обработку и получает сгруппированные по людям результаты в браузере.

## Status

Репозиторий содержит:

- актуализированную спецификацию под `Supabase + Vercel`
- каркас `Next.js` приложения
- базовую схему Supabase
- skeleton Python worker для асинхронной обработки jobs

## Architecture

End-to-end поток:

1. Пользователь входит в приложение через Supabase Auth.
2. Создает upload batch и загружает фотографии в `Supabase Storage`.
3. Web app регистрирует загруженные объекты в таблице `photos`.
4. Web app создает `processing_job` в Supabase.
5. Python worker забирает job из очереди.
6. Worker читает фото из storage, строит face embeddings, кластеризует результаты и пишет их в Postgres.
7. UI на Vercel читает статусы, кластеры и превью из Supabase.

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
- `SUPABASE_DB_PASSWORD`

## Development Commands

```bash
npm install
npm run dev
python3 -m venv .venv
source .venv/bin/activate
pip install -r worker/requirements.txt
python3 -m worker.main
```

## Deploy

### Vercel

- импортировать репозиторий как Next.js project
- добавить публичные и серверные Supabase env vars
- деплоить `main` branch

### Supabase

- создать проект
- применить SQL migration из `supabase/migrations/`
- создать storage buckets и auth через migration

### Worker

- собрать контейнер из `worker/Dockerfile`
- задеплоить на Railway
- передать `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`

## Source Of Truth

- проектная рамка: [docs/PROJECT_CHARTER.md](/Users/xdshka/Desktop/photo-sorter/docs/PROJECT_CHARTER.md)
- roadmap: [docs/ROADMAP.md](/Users/xdshka/Desktop/photo-sorter/docs/ROADMAP.md)
- правила разработки: [AGENTS.md](/Users/xdshka/Desktop/photo-sorter/AGENTS.md)
- продуктовая спецификация: [spec.md](/Users/xdshka/Desktop/photo-sorter/specs/001-face-photo-sorter/spec.md)
- технический дизайн: [design.md](/Users/xdshka/Desktop/photo-sorter/specs/001-face-photo-sorter/design.md)

Изменения публичных контрактов сначала идут в спецификацию, затем в код.
