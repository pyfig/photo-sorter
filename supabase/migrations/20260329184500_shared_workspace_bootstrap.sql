alter table public.workspaces
add column if not exists is_shared boolean not null default false;

create unique index if not exists idx_workspaces_single_shared
on public.workspaces ((is_shared))
where is_shared = true;

create or replace function public.ensure_shared_workspace_membership(
  shared_workspace_name text,
  shared_workspace_slug text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  shared_workspace public.workspaces;
begin
  if current_user_id is null then
    raise exception 'auth.uid() is required';
  end if;

  select *
  into shared_workspace
  from public.workspaces
  where is_shared = true
  limit 1;

  if shared_workspace.id is null then
    begin
      insert into public.workspaces (name, slug, owner_id, is_shared)
      values (shared_workspace_name, shared_workspace_slug, current_user_id, true)
      returning * into shared_workspace;

      insert into public.workspace_members (workspace_id, user_id, role)
      values (shared_workspace.id, current_user_id, 'owner')
      on conflict (workspace_id, user_id) do update
      set role = excluded.role;
    exception
      when unique_violation then
        select *
        into shared_workspace
        from public.workspaces
        where is_shared = true
           or slug = shared_workspace_slug
        order by is_shared desc, created_at asc
        limit 1;
    end;
  end if;

  if shared_workspace.id is null then
    select *
    into shared_workspace
    from public.workspaces
    where slug = shared_workspace_slug
    limit 1;
  end if;

  if shared_workspace.id is null then
    raise exception 'shared workspace bootstrap failed';
  end if;

  update public.workspaces
  set is_shared = true,
      updated_at = now()
  where id = shared_workspace.id
    and is_shared is distinct from true
  returning * into shared_workspace;

  if shared_workspace.id is null then
    select *
    into shared_workspace
    from public.workspaces
    where slug = shared_workspace_slug
    limit 1;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (
    shared_workspace.id,
    current_user_id,
    case
      when shared_workspace.owner_id = current_user_id then 'owner'::public.workspace_role
      else 'member'::public.workspace_role
    end
  )
  on conflict (workspace_id, user_id) do nothing;

  return shared_workspace;
end;
$$;

grant execute on function public.ensure_shared_workspace_membership(text, text) to authenticated;
