# Architecture

## Runtime Split

- `Vercel / Next.js`: UI, auth-aware data access, orchestration routes
- `Supabase`: Postgres, Auth, Storage, RLS, queue tables
- `Railway / Python worker`: face processing и запись результатов

## Core Data Flow

1. Пользователь логинится.
2. Создает upload batch.
3. Загружает фото в `raw-photos/<workspace_id>/<upload_id>/...`.
4. Клиент регистрирует загруженные файлы в таблице `photos`.
5. Создает processing job.
6. Worker забирает queued job и переводит в `running`.
7. Worker читает фото, строит embeddings, формирует clusters.
8. Worker пишет `person_clusters`, `cluster_photos`, `detected_faces`, preview files и `job_events`.
9. UI отображает итоговый статус и людей.

## Reliability Notes

- источником истины для статусов jobs является таблица `processing_jobs`
- каждый важный шаг worker пишет в `job_events`
- schema changes допускаются только через migrations
- web app и worker скейлятся независимо
