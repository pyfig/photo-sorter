# Risks 001: Face Photo Sorter Cloud

## Product Risks

### R001. False merge / false split

Описание:

- кластеризация может ошибочно объединять или разделять людей

Снижение риска:

- настраиваемые параметры worker
- review UI на следующей фазе
- job events и preview images для ручной диагностики

## Platform Risks

### R101. Missing auth on web actions

Описание:

- upload/job endpoints без корректной auth-check логически опасны

Снижение риска:

- использовать Supabase session context в route handlers
- опираться на RLS

### R102. Storage policy drift

Описание:

- несогласованность bucket path contract и SQL policies сломает upload/download

Снижение риска:

- строго держать path format `<workspace_id>/<upload_id>/file`
- не менять структуру без migration и spec update

### R103. Worker dependency weight

Описание:

- InsightFace и CV dependencies тяжелые для cold start и локальной установки

Снижение риска:

- отдельный container runtime
- явный Dockerfile
- фиксированные версии зависимостей

## Operational Risks

### R201. Stuck jobs

Описание:

- worker может упасть после claim и оставить job в `running`

Снижение риска:

- heartbeat публикуется в `worker_heartbeats` уже в текущей фазе
- health-check должен показывать stale heartbeat отдельно от очереди
- reaper/retry остаются следующим шагом
- использовать `claimed_at` для обнаружения зависших jobs

### R202. Service role leakage

Описание:

- утечка service-role ключа даст полный доступ к данным

Снижение риска:

- никогда не использовать service-role в браузере
- хранить ключ только в Vercel server env и worker runtime secrets
