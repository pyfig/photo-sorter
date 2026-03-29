# Architecture

## Runtime Split

- `Vercel / Next.js`: UI, auth-aware data access, orchestration routes
- `Supabase`: Postgres, Auth, Storage, RLS, queue tables
- `Railway / Python worker`: face processing и запись результатов

## Core Data Flow

1. Пользователь логинится.
2. При первом входе создает workspace.
3. Создает upload batch.
4. Загружает фото в `raw-photos/<workspace_id>/<upload_id>/...`.
5. Клиент регистрирует загруженные файлы в таблице `photos`.
6. Создает processing job.
7. Worker забирает queued job и переводит в `running`.
8. Worker читает фото, строит embeddings, формирует clusters.
9. Worker пишет `person_clusters`, `cluster_photos`, `detected_faces`, preview files и `job_events`.
10. UI отображает итоговый статус и людей через signed URLs.

## Reliability Notes

- источником истины для статусов jobs является таблица `processing_jobs`
- каждый важный шаг worker пишет в `job_events`
- schema changes допускаются только через migrations
- web app и worker скейлятся независимо
- buckets остаются приватными, публичного file access нет
