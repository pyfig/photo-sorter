do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'processing_jobs'
  ) then
    alter publication supabase_realtime add table public.processing_jobs;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_events'
  ) then
    alter publication supabase_realtime add table public.job_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'person_clusters'
  ) then
    alter publication supabase_realtime add table public.person_clusters;
  end if;
end
$$;
