# Spec 001: Face Photo Sorter Cloud

## Summary

Система должна принимать фотографии через web-приложение, аутентифицировать пользователя через Supabase Auth по email и паролю, хранить исходные файлы в Supabase Storage, ставить обработку в очередь через Supabase Postgres и показывать результат кластеризации лиц в Next.js интерфейсе на Vercel.

## Scope

Этот spec описывает текущий v1:

- web-first flow
- multi-user workspaces
- Supabase Auth, Postgres и Storage
- асинхронные jobs через таблицу `processing_jobs`
- Python worker с InsightFace и DBSCAN
- просмотр jobs и person clusters в UI
- production-only runtime без demo/mock fallback

Вне scope:

- ручной merge/split кластеров
- облачные ML API
- CLI как основной entrypoint
- мобильные клиенты

## User Scenarios

### Scenario 1. Upload and process

Пользователь регистрируется или входит в приложение по email и паролю, создает workspace, создает upload batch и загружает фото.
Сервис параллельно отправляет файлы в storage, регистрирует каждое успешно загруженное фото в проекте и сразу ставит его в preprocessing.
После завершения upload batch сервис автоматически завершает финальную кластеризацию без ручного запуска отдельной кнопкой.

### Scenario 2. Review results

Пользователь открывает job details и видит статус, прогресс и журнал событий.

### Scenario 3. Browse people

После завершения job пользователь открывает person cluster и просматривает связанные фотографии.
На странице человека сервис показывает рамку детектированного лица поверх фотографии, а в футере карточки выводит метрики по каждому bbox: confidence детектора в процентах и относительный размер лица в кадре.

### Scenario 4. Multi-face image

Если на одном фото несколько людей, один и тот же `photo_id` должен быть связан с несколькими `person_clusters`.

### Scenario 5. Name a result folder

После завершения job пользователь может задать человеку понятное имя.
Это имя отображается в UI как основное название группы и становится базой для будущего имени папки при экспорте результатов.

## Public Contracts

### Web Routes

- `/`
- `/login`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/uploads`
- `/workspaces/[workspaceId]/jobs/[jobId]`
- `/workspaces/[workspaceId]/people/[personId]`

### API Routes

- `GET /api/health`
- `GET /api/workspaces/[workspaceId]`
- `GET /api/workspaces/[workspaceId]/jobs/[jobId]`
- `PATCH /api/workspaces/[workspaceId]/people/[personId]`
- `GET /api/workspaces/[workspaceId]/people/[personId]/photos/[photoId]`
- `POST /api/workspaces/[workspaceId]/uploads`
- `POST /api/workspaces/[workspaceId]/uploads/[uploadId]/photos`
- `POST /api/workspaces/[workspaceId]/uploads/[uploadId]/complete`
- `POST /api/workspaces/[workspaceId]/jobs`

### Storage Buckets

- `raw-photos`
- `face-previews`
- `derived-artifacts`

### Job Statuses

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

## Data Model

Обязательные сущности:

- `workspaces`
- `workspace_members`
- `photo_uploads`
- `photos`
- `processing_jobs`
- `photo_processing_tasks`
- `staged_faces`
- `worker_heartbeats`
- `person_clusters`
- `detected_faces`
- `cluster_photos`
- `job_events`

### Output Contract

Результат обработки считается успешным, если:

- в `person_clusters` созданы записи по найденным людям
- в `detected_faces` записаны face bounding boxes
- в `cluster_photos` отражена связь cluster -> photo
- превью загружены в `face-previews`
- `processing_jobs.status = completed`
- UI получает доступ к preview через signed URLs, а к raw photos через приватный auth-aware app route с browser cache, а не через public buckets

## Behavioral Requirements

- При отсутствии обязательных env web app не должен показывать demo/mock данные.
- Web app не выполняет тяжелый ML pipeline.
- Неаутентифицированный пользователь перенаправляется на `/login`.
- Пользователь без workspace видит onboarding и может создать workspace из UI.
- Login реализован через Supabase Auth email + password без magic link callback.
- Регистрация по email + password при отключенном email confirmation должна сразу создавать session и пускать пользователя в приложение.
- Upload flow должен использовать bounded parallel upload, а не последовательную передачу файлов по одному.
- Каждое успешно загруженное фото должно быть зарегистрировано в `photos` сразу после storage upload, без ожидания конца всего batch.
- Для активного upload batch должен существовать один upload-level `processing_job`, который создается автоматически на первом успешно зарегистрированном фото.
- Worker должен забирать photo preprocessing tasks и финализацию upload job атомарно через SQL queue functions.
- Финальная кластеризация upload batch может стартовать только после `photo_uploads.sealed_at` и после завершения всех связанных photo preprocessing tasks.
- Worker должен публиковать heartbeat в `worker_heartbeats` на старте, при idle-poll и во время активной job.
- Фото без лиц не должны ломать весь job.
- Ошибка одного файла не должна прерывать всю обработку без записи события в `job_events`.
- Один `photo_id` может принадлежать нескольким кластерам.
- Доступ к данным workspace должен быть изолирован через Auth + RLS.
- Buckets `raw-photos`, `face-previews`, `derived-artifacts` остаются приватными.
- UI должен отображать реальные progress/error/empty states для login, workspace creation, upload и job lifecycle.
- Job details и workspace overview должны обновлять progress/status/results без ручного `F5`, используя live-подписки и fallback polling только при деградации realtime-канала.
- На странице person cluster фотокарточки должны иметь фиксированный формат и не разрастаться из-за больших исходных изображений.
- Пользователь должен иметь возможность переименовать person cluster через UI, не меняя системный `system_label`.
- `display_name` person cluster должен считаться основным человекочитаемым именем результата и базой для будущего имени экспортируемой папки.
- Если для фотографии есть `detected_faces` текущего `cluster_id`, UI должен поверх изображения показывать face bounding box, а в футере карточки выводить список метрик по каждому bbox.
- Raw photos на странице person cluster должны открываться по стабильному приватному URL внутри web app, чтобы повторный переход в того же человека использовал браузерный cache вместо новой полной загрузки.
- Ключевые пользовательские экраны должны объяснять текущий статус и следующий шаг без внешней документации.
- Пользовательский интерфейс должен использовать продуктовый SaaS-язык, а не внутренние инфраструктурные термины по умолчанию.
- Web app должен использовать единый бренд-знак как favicon/tab icon и как знак в основном header.
- Кириллица и латиница должны отображаться согласованно: UI использует шрифты с поддержкой `latin` и `cyrillic`, без визуального рассинхрона между русским и английским текстом.
- Визуальная система web app должна быть цельной для `/`, `/login` и внутренних экранов workspace/upload/job/person, а не только для одного landing-экрана.
- Редизайн может использовать мягкие природные мотивы и тёплый визуальный тон, но тексты и названия секций должны оставаться прямыми и продуктовыми, без лишнего lore и без ожидания несуществующих product capabilities.
- Крупные заголовки, бейджи и карточки не должны обрезать текст из-за слишком плотного `line-height`, жёстких `max-width` или декоративного `overflow`.
- Система должна явно диагностировать ситуацию, когда jobs остаются в `queued` из-за отсутствующего, stale или неготового worker runtime.
- `/api/health` не должен считать worker готовым только по наличию env у web runtime; readiness worker определяется по свежему heartbeat.
- `/api/health` должен показывать backlog `photo_processing_tasks` и jobs в фазах `preprocessing` / `finalizing`, чтобы было видно, где возник bottleneck.

## Acceptance Criteria

- Пользователь может зарегистрироваться по email и паролю и сразу получить session в web app.
- Пользователь может повторно войти по email и паролю без дополнительного email-callback flow.
- Аутентифицированный пользователь без workspace может создать workspace из UI.
- Аутентифицированный пользователь может создать upload batch для своего workspace.
- Пользователь может загрузить фотографии в `raw-photos/<workspace_id>/<upload_id>/...`, а web app регистрирует каждое успешно загруженное фото в `photos` сразу, без ожидания конца всего batch.
- Для upload batch автоматически создается один upload-level `processing_job`, который отражает общий pipeline по подборке.
- Worker обрабатывает photo preprocessing tasks по мере появления новых фото, пишет progress в upload-level job и завершает его как `completed` или `failed`.
- После завершения job UI показывает список job events.
- Job details показывает изменения `status`, `progress_percent` и новые `job_events` без ручного refresh страницы.
- Job details начинает показывать движение по обработке до завершения последнего upload, если первые фото уже зарегистрированы и взяты в preprocessing.
- После завершения обработки person cluster содержит `display_name`, `preview_path`, `photo_count` и отображается в UI вместе с preview.
- Workspace показывает новые person clusters и обновлённые recent jobs без ручного refresh страницы.
- Пользователь может задать person cluster непустое имя, и UI показывает его как новое название группы после сохранения.
- На странице человека фотографии отображаются в фиксированных карточках `4:5`, а футер карточки показывает для каждого bbox номер лица, confidence в процентах и относительный размер лица в кадре.
- Повторное открытие уже просмотренного person cluster в том же браузере не должно заново скачивать все raw photos с нуля, если cache TTL ещё не истёк.
- Пользователь из другого workspace не может читать чужие jobs, photos и clusters.
- `/api/health` отражает готовность web/admin/worker runtime, доступность Supabase и базовое состояние очереди без demo fallback.
- `/api/health` показывает `last_seen_at`, `worker_id`, freshness threshold и причину деградации, если heartbeat worker отсутствует или устарел.
- Пользователь без гайдов понимает из интерфейса, как войти, создать проект, загрузить фотографии и открыть результат без ручного шага запуска обработки.
- Favicon/tab icon отображается в браузере, а тот же бренд-знак используется в header приложения.
- Основные экраны выглядят как единая продуктовая среда: согласованные цвета, типографика, карточки, empty states, progress blocks и навигационные элементы.
- Русский и английский текст в одном интерфейсе выглядит согласованно по гарнитуре и не ломает визуальный тон продукта.
- На desktop и mobile длинные русские заголовки и подписи целиком читаются внутри своих контейнеров без визуального clipping.

## Future Extensions

- review спорных кластеров
- retry strategy и cancellation UI
- ограничения по quota и batch size
