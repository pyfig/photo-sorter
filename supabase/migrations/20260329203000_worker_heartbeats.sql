create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  runtime_status text not null check (runtime_status in ('starting', 'idle', 'running')),
  poll_interval_seconds integer not null check (poll_interval_seconds > 0),
  current_job_id uuid references public.processing_jobs(id) on delete set null,
  current_job_started_at timestamptz,
  last_job_id uuid references public.processing_jobs(id) on delete set null,
  last_completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_heartbeats_last_seen_at
  on public.worker_heartbeats(last_seen_at desc);

drop trigger if exists set_worker_heartbeats_updated_at on public.worker_heartbeats;
create trigger set_worker_heartbeats_updated_at
before update on public.worker_heartbeats
for each row execute function public.set_updated_at();

alter table public.worker_heartbeats enable row level security;
