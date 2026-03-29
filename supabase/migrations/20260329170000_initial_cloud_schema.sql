create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner', 'member');
  end if;

  if not exists (select 1 from pg_type where typname = 'upload_status') then
    create type public.upload_status as enum ('uploading', 'uploaded', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.photo_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status public.upload_status not null default 'uploading',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  upload_id uuid not null references public.photo_uploads(id) on delete cascade,
  storage_path text not null unique,
  checksum text,
  width integer,
  height integer,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  input_batch_id uuid not null references public.photo_uploads(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status public.job_status not null default 'queued',
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  worker_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  system_label text not null,
  display_name text not null,
  preview_path text,
  photo_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.detected_faces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  cluster_id uuid references public.person_clusters(id) on delete set null,
  bbox jsonb not null,
  confidence numeric(6, 5),
  embedding_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.cluster_photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  cluster_id uuid not null references public.person_clusters(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cluster_id, photo_id)
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);
create index if not exists idx_photo_uploads_workspace_id on public.photo_uploads(workspace_id);
create index if not exists idx_photos_workspace_id on public.photos(workspace_id);
create index if not exists idx_photos_upload_id on public.photos(upload_id);
create index if not exists idx_processing_jobs_workspace_id on public.processing_jobs(workspace_id);
create index if not exists idx_processing_jobs_status on public.processing_jobs(status, created_at);
create index if not exists idx_person_clusters_workspace_id on public.person_clusters(workspace_id);
create index if not exists idx_person_clusters_job_id on public.person_clusters(job_id);
create index if not exists idx_detected_faces_job_id on public.detected_faces(job_id);
create index if not exists idx_detected_faces_photo_id on public.detected_faces(photo_id);
create index if not exists idx_cluster_photos_cluster_id on public.cluster_photos(cluster_id);
create index if not exists idx_job_events_job_id on public.job_events(job_id, created_at desc);

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists set_photo_uploads_updated_at on public.photo_uploads;
create trigger set_photo_uploads_updated_at
before update on public.photo_uploads
for each row execute function public.set_updated_at();

drop trigger if exists set_processing_jobs_updated_at on public.processing_jobs;
create trigger set_processing_jobs_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace
      and w.owner_id = auth.uid()
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.photo_uploads enable row level security;
alter table public.photos enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.person_clusters enable row level security;
alter table public.detected_faces enable row level security;
alter table public.cluster_photos enable row level security;
alter table public.job_events enable row level security;

drop policy if exists "workspaces_select" on public.workspaces;
create policy "workspaces_select" on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists "workspaces_insert" on public.workspaces;
create policy "workspaces_insert" on public.workspaces
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "workspaces_update" on public.workspaces;
create policy "workspaces_update" on public.workspaces
for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert" on public.workspace_members
for insert to authenticated
with check (public.is_workspace_owner(workspace_id));

drop policy if exists "workspace_members_update" on public.workspace_members;
create policy "workspace_members_update" on public.workspace_members
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

drop policy if exists "workspace_members_delete" on public.workspace_members;
create policy "workspace_members_delete" on public.workspace_members
for delete to authenticated
using (public.is_workspace_owner(workspace_id));

drop policy if exists "photo_uploads_rw" on public.photo_uploads;
create policy "photo_uploads_rw" on public.photo_uploads
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "photos_rw" on public.photos;
create policy "photos_rw" on public.photos
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "processing_jobs_rw" on public.processing_jobs;
create policy "processing_jobs_rw" on public.processing_jobs
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "person_clusters_rw" on public.person_clusters;
create policy "person_clusters_rw" on public.person_clusters
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "detected_faces_rw" on public.detected_faces;
create policy "detected_faces_rw" on public.detected_faces
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "cluster_photos_rw" on public.cluster_photos;
create policy "cluster_photos_rw" on public.cluster_photos
for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "job_events_select" on public.job_events;
create policy "job_events_select" on public.job_events
for select to authenticated
using (
  exists (
    select 1
    from public.processing_jobs j
    where j.id = job_id
      and public.is_workspace_member(j.workspace_id)
  )
);

drop policy if exists "job_events_insert" on public.job_events;
create policy "job_events_insert" on public.job_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.processing_jobs j
    where j.id = job_id
      and public.is_workspace_member(j.workspace_id)
  )
);

insert into storage.buckets (id, name, public)
values
  ('raw-photos', 'raw-photos', false),
  ('face-previews', 'face-previews', false),
  ('derived-artifacts', 'derived-artifacts', false)
on conflict (id) do nothing;

drop policy if exists "raw_photos_select" on storage.objects;
create policy "raw_photos_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'raw-photos'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "raw_photos_insert" on storage.objects;
create policy "raw_photos_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'raw-photos'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "raw_photos_update" on storage.objects;
create policy "raw_photos_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'raw-photos'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'raw-photos'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "face_previews_select" on storage.objects;
create policy "face_previews_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'face-previews'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "face_previews_insert" on storage.objects;
create policy "face_previews_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'face-previews'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "derived_artifacts_select" on storage.objects;
create policy "derived_artifacts_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'derived-artifacts'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "derived_artifacts_insert" on storage.objects;
create policy "derived_artifacts_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'derived-artifacts'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

create or replace function public.claim_next_processing_job(worker_name text)
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
    status = 'running',
    worker_id = worker_name,
    claimed_at = now(),
    started_at = coalesce(started_at, now()),
    progress_percent = greatest(progress_percent, 1),
    updated_at = now()
  where id = (
    select id
    from public.processing_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed_job;

  return claimed_job;
end;
$$;

create or replace function public.bootstrap_workspace(
  workspace_name text,
  workspace_slug text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  created_workspace public.workspaces;
begin
  insert into public.workspaces (name, slug, owner_id)
  values (workspace_name, workspace_slug, auth.uid())
  returning * into created_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace.id, auth.uid(), 'owner');

  return created_workspace;
end;
$$;

grant execute on function public.bootstrap_workspace(text, text) to authenticated;

