# Tasks 001: Face Photo Sorter Cloud

## T001. Cloud spec rewrite

- переписать `README.md`, `AGENTS.md`, `docs/` и `specs/`
- отменить legacy `CLI-first` assumptions
- зафиксировать Supabase/Vercel/worker contracts

## T002. Web app bootstrap

- добавить `package.json`, `tsconfig.json`, `next.config.ts`
- создать `app/` routes для workspace, uploads, jobs, people
- добавить базовые UI компоненты и demo fallback

## T003. Supabase schema

- создать migration с domain tables
- добавить RLS policies
- добавить storage buckets
- добавить SQL function `claim_next_processing_job`

## T004. Worker bootstrap

- добавить Python worker package
- добавить polling loop
- добавить processor на InsightFace + DBSCAN
- добавить запись clusters, faces, previews и job events

## T005. API contracts

- добавить `GET /api/health`
- добавить `POST /api/workspaces/[workspaceId]/uploads`
- добавить `POST /api/workspaces/[workspaceId]/uploads/[uploadId]/photos`
- добавить `POST /api/workspaces/[workspaceId]/jobs`

## T006. Verification

- проверить структуру файлов и diff
- проверить Python syntax compile
- проверить SQL migration на предмет согласованности с кодом
- подготовить следующие шаги для запуска через `npm install` и worker env

## Next Sprint

- реальная форма upload с browser-side storage upload
- запись `photos` после загрузки файлов
- auth UI и workspace creation flow
- улучшение retries/error handling
