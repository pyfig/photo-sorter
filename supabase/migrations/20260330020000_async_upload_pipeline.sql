do $$
begin
  if not exists (select 1 from pg_type where typname = 'processing_phase') then
    create type public.processing_phase as enum ('preprocessing', 'finalizing');
  end if;

  if not exists (select 1 from pg_type where typname = 'photo_task_status') then
    create type public.photo_task_status as enum ('queued', 'running', 'completed', 'failed');
  end if;
end $$;

alter table public.photo_uploads
  add column if not exists sealed_at timestamptz;

alter table public.processing_jobs
  add column if not exists phase public.processing_phase not null default 'preprocessing',
  add column if not exists total_photos integer not null default 0 check (total_photos >= 0),
  add column if not exists processed_photos integer not null default 0 check (processed_photos >= 0 and processed_photos <= total_photos);

create table if not exists public.photo_processing_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  upload_id uuid not null references public.photo_uploads(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  status public.photo_task_status not null default 'queued',
  worker_id text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photo_id, job_id)
);

create table if not exists public.staged_faces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  upload_id uuid not null references public.photo_uploads(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  storage_path text not null,
  bbox jsonb not null,
  confidence numeric(6, 5),
  embedding jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_processing_tasks_job_id
  on public.photo_processing_tasks(job_id);

create index if not exists idx_photo_processing_tasks_status
  on public.photo_processing_tasks(status, created_at);

create index if not exists idx_photo_processing_tasks_upload_id
  on public.photo_processing_tasks(upload_id);

create index if not exists idx_staged_faces_job_id
  on public.staged_faces(job_id);

create index if not exists idx_staged_faces_photo_id
  on public.staged_faces(photo_id);

drop trigger if exists set_photo_processing_tasks_updated_at on public.photo_processing_tasks;
create trigger set_photo_processing_tasks_updated_at
before update on public.photo_processing_tasks
for each row execute function public.set_updated_at();

alter table public.photo_processing_tasks enable row level security;
alter table public.staged_faces enable row level security;

drop policy if exists "photo_processing_tasks_rw" on public.photo_processing_tasks;
create policy "photo_processing_tasks_rw" on public.photo_processing_tasks
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "staged_faces_rw" on public.staged_faces;
create policy "staged_faces_rw" on public.staged_faces
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create or replace function public.claim_next_photo_processing_task(worker_name text)
returns public.photo_processing_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_task public.photo_processing_tasks;
begin
  update public.photo_processing_tasks
  set
    status = 'running',
    worker_id = worker_name,
    claimed_at = now(),
    started_at = coalesce(started_at, now()),
    attempt_count = attempt_count + 1,
    error_message = null,
    updated_at = now()
  where id = (
    select task.id
    from public.photo_processing_tasks task
    join public.processing_jobs job
      on job.id = task.job_id
    where task.status = 'queued'
      and job.status = 'running'
      and job.phase = 'preprocessing'
    order by task.created_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed_task;

  return claimed_task;
end;
$$;

create or replace function public.claim_next_finalizable_processing_job(worker_name text)
returns public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job public.processing_jobs;
begin
  update public.processing_jobs
  set
    phase = 'finalizing',
    worker_id = worker_name,
    claimed_at = coalesce(claimed_at, now()),
    progress_percent = greatest(progress_percent, 85),
    updated_at = now()
  where id = (
    select job.id
    from public.processing_jobs job
    join public.photo_uploads upload_batch
      on upload_batch.id = job.input_batch_id
    where job.status = 'running'
      and job.phase = 'preprocessing'
      and upload_batch.sealed_at is not null
      and not exists (
        select 1
        from public.photo_processing_tasks task
        where task.job_id = job.id
          and task.status in ('queued', 'running')
      )
    order by job.created_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed_job;

  return claimed_job;
end;
$$;
