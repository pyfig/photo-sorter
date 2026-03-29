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
