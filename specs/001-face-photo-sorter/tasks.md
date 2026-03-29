# Tasks 001: Face Photo Sorter Cloud

## T001. Cloud spec rewrite

- переписать `README.md`, `AGENTS.md`, `docs/` и `specs/`
- отменить legacy `CLI-first` assumptions
- зафиксировать Supabase/Vercel/worker contracts

## T002. Web app bootstrap

- добавить `package.json`, `tsconfig.json`, `next.config.ts`
- создать `app/` routes для workspace, uploads, jobs, people
- добавить базовые UI компоненты и production-only auth-aware navigation

## T003. Supabase schema

- создать migration с domain tables
- добавить RLS policies
- добавить storage buckets
- добавить SQL function `claim_next_processing_job`
- добавить таблицу `worker_heartbeats` для runtime liveness

## T004. Worker bootstrap

- добавить Python worker package
- добавить polling loop
- добавить processor на InsightFace + DBSCAN
- добавить запись clusters, faces, previews и job events
- добавить heartbeat update на idle/running/completed шагах

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

## T007. Auth and onboarding

- реализовать `/login` с email magic link
- добавить `/auth/confirm`
- добавить middleware для session refresh и защиты приватных routes
- добавить self-serve workspace creation flow

## T008. Real upload and results UI

- убрать mock/demo fallback из `lib/data.ts`
- реализовать upload form с browser-side storage upload
- показать recent clusters и preview images в workspace UI
- показать signed URLs для preview и raw photos на person page
- показать bbox и confidence face detector на person page
- зафиксировать формат фотокарточки `4:5`, чтобы большие фото не ломали сетку

## T009. Production deployment readiness

- обновить `.env.example` под production-only env model
- задокументировать `Supabase + Resend SMTP + Vercel + Railway` rollout
- улучшить `/api/health` для проверки env и Supabase connectivity

## T010. SaaS UX pass

- убрать из ключевых экранов bootstrap/dev wording
- объяснить login, onboarding, upload, processing и result flow человеческим языком
- добавить на главную и внутренние экраны явные next actions и понятные empty/success/error states

## T011. Queue diagnostics and worker startup

- добавить явную проверку worker runtime в `/api/health` по heartbeat, а не только по env
- показать оператору понятную причину, если job застряла в `queued`
- сделать локальный запуск worker воспроизводимым через один скрипт с fail-fast env validation

## T012. Solarpunk UI redesign

- обновить `spec.md`, `design.md`, `decisions.md` и `README.md` под новый visual system
- добавить brand mark для favicon/tab icon и основного header
- перевести `layout`, home, login и внутренние экраны на единые typography/color/motion tokens
- сохранить текущие маршруты, backend contracts и job lifecycle без продуктовых подмен

## Next Sprint

- retry/cancel UI для jobs
- базовый review и rename flow для clusters
- улучшение error handling и quotas
