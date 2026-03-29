# Decisions 001: Face Photo Sorter Cloud

## D001. Web app runs on Vercel

Статус:

- accepted

Следствие:

- основной пользовательский entrypoint - Next.js приложение

## D002. Database and storage live in Supabase

Статус:

- accepted

Следствие:

- Postgres, Auth и Storage не дублируются в других сервисах на v1

## D003. Heavy face processing does not run on Vercel

Статус:

- accepted

Причина:

- serverless/web runtime не подходит для тяжелого ML pipeline

Следствие:

- worker является отдельным deployable unit

## D004. Python worker uses InsightFace and DBSCAN

Статус:

- accepted

Следствие:

- detection/embedding/clustering реализуются в `worker/`

## D005. Queue is implemented in Supabase tables

Статус:

- accepted

Следствие:

- отдельный брокер не нужен на v1

## D006. Multi-user model is required

Статус:

- accepted

Следствие:

- RLS и workspace isolation обязательны уже в первой версии

## D007. Authentication uses email + password only in v1

Статус:

- accepted

Следствие:

- `/login` обязателен, отдельный magic link callback route не нужен
- регистрация и повторный вход используют `Supabase Auth` password flow
- OAuth провайдеры откладываются за пределы текущей итерации

## D008. No demo fallback in production-oriented runtime

Статус:

- accepted

Причина:

- demo данные маскируют реальные проблемы конфигурации и ломают production acceptance criteria

Следствие:

- отсутствие env должно проявляться как setup/degraded ошибка
- mock данные удаляются из `lib/data.ts` и из пользовательских маршрутов

## D009. Email delivery is not required for the default v1 auth flow

Статус:

- accepted

Следствие:

- production auth rollout не зависит от SMTP для login/signup

## D010. Workspace creation is self-serve from the web UI

Статус:

- accepted

Следствие:

- пользователь без workspace не блокируется ручной админ-подготовкой
- web app использует существующую SQL-функцию `bootstrap_workspace`

## D011. Worker readiness is tracked by database heartbeats

Статус:

- accepted

Причина:

- наличие env у web runtime не доказывает, что отдельный Python worker реально запущен и обслуживает очередь

Следствие:

- worker пишет liveness в `worker_heartbeats`
- `/api/health` и queued-job diagnostics опираются на свежесть heartbeat, а не только на env

## D012. Web UI uses a shared nature-inspired design system without changing product contracts

Статус:

- accepted

Причина:

- нужно заметно улучшить визуальное качество интерфейса, сохранив текущие маршруты, сущности и production-safe поведение

Следствие:

- редизайн выполняется в presentation layer через `layout`, shared components, CSS tokens и icon asset
- иконка для tab bar и знак в header должны быть одним и тем же brand mark
- шрифты выбираются только с гарантированной поддержкой `latin` и `cyrillic`
- тексты интерфейса остаются продуктовыми и прямыми; образный визуальный слой не должен превращаться в naming системы

## D013. Live job and workspace updates use Supabase Realtime

Статус:

- accepted

Причина:

- проект уже хранит источник истины в Supabase, поэтому отдельный websocket backend на Vercel не нужен
- Realtime позволяет обновлять `processing_jobs`, `job_events` и `person_clusters` без ручного refresh страницы

Следствие:

- migration должна подключать нужные таблицы к `supabase_realtime` publication
- UI обязан иметь fallback polling, если realtime-канал деградировал
- realtime rollout не должен менять job lifecycle или worker contracts

## D014. Upload pipeline is split into immediate photo preprocessing and deferred final clustering

Статус:

- accepted

Причина:

- пользователю нужен overlap между загрузкой и обработкой, чтобы время от первого фото до первых результатов не терялось на последовательной batch-передаче
- при этом итоговая кластеризация должна видеть всю подборку, а не только отдельные кадры

Следствие:

- web app грузит фотографии bounded-parallel и регистрирует каждое успешно загруженное фото сразу
- upload-level `processing_job` создаётся автоматически на первом зарегистрированном фото и остаётся единственной публичной сущностью job для UI
- worker использует внутренние `photo_processing_tasks` и `staged_faces`, а финальную кластеризацию запускает только после `photo_uploads.sealed_at`
- `/uploads/[uploadId]/complete` становится обязательной частью upload flow
