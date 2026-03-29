# Roadmap

## Phase 0. Spec And Cloud Foundation

Цель:

- привести спецификацию к `Supabase + Vercel`
- подготовить web app skeleton
- подготовить schema migrations
- подготовить worker skeleton

## Phase 1. End-To-End Upload And Jobs

Цель:

- загрузка фото в Supabase Storage
- создание processing jobs
- polling worker и запись статусов
- страницы workspace и job details

## Phase 2. Face Processing And Clusters

Цель:

- запуск реального InsightFace pipeline
- запись detected faces
- создание person clusters и preview images
- вывод результатов в UI

## Phase 3. Naming And Review

Цель:

- переименование person clusters
- базовый review результатов
- улучшение UX around failed and unmatched cases

## Phase 4. Production Hardening

Цель:

- observability
- retry strategy
- rate limiting и quotas
- deploy safety, rollback и smoke checks
