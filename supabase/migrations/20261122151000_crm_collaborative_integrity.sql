-- Client-bound tasks follow the company's team even if their creator leaves it.
create function public.crm_can_access_task(p_owner uuid, p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_client is null then public.crm_can_access(p_owner)
  else exists (
    select 1 from public.crm_clients c where c.id = p_client and public.crm_can_access(c.owner_id)
  ) end
$$;
revoke all on function public.crm_can_access_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_can_access_task(uuid, uuid) to authenticated;

alter policy crm_select on public.crm_tasks using (public.crm_can_access_task(owner_id, client_id));
alter policy crm_insert on public.crm_tasks with check (
  (select auth.uid()) = owner_id and public.crm_can_access_task(owner_id, client_id)
);
alter policy crm_update on public.crm_tasks
  using (public.crm_can_access_task(owner_id, client_id))
  with check (public.crm_can_access_task(owner_id, client_id));
alter policy crm_delete on public.crm_tasks using (
  (select auth.uid()) = owner_id and public.crm_can_access_task(owner_id, client_id)
);

create or replace function public.crm_validate_task_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.crm_tasks t left join public.crm_clients c on c.id = t.client_id
    where t.id = new.task_id and public.crm_same_team(coalesce(c.owner_id, t.owner_id), new.user_id)
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function public.crm_set_task_status(p_id uuid, p_status public.crm_task_status)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.crm_tasks t
  set status = p_status,
      completed_at = case when p_status = 'done' then coalesce(t.completed_at, now()) end,
      completed_by = case when p_status = 'done' then coalesce(t.completed_by, (select auth.uid())) end
  where t.id = p_id and p_status is not null and public.crm_can_access_task(t.owner_id, t.client_id);
  return found;
end
$$;

alter table public.crm_tasks add column edit_version uuid not null default gen_random_uuid();
alter table public.crm_projects add column edit_version uuid not null default gen_random_uuid();

create function public.crm_advance_edit_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.edit_version := gen_random_uuid();
  return new;
end
$$;
revoke all on function public.crm_advance_edit_version() from public, anon, authenticated;
create trigger crm_task_edit_version
before update of title, description, priority, due_date, lead_id, client_id, conversation_id, project_id
on public.crm_tasks for each row execute function public.crm_advance_edit_version();
create trigger crm_project_edit_version
before update on public.crm_projects for each row execute function public.crm_advance_edit_version();

create or replace function public.crm_save_task(p_id uuid, p_task jsonb, p_assignees uuid[])
returns uuid language plpgsql set search_path = '' as $$
declare
  input public.crm_tasks;
  saved uuid;
begin
  input := jsonb_populate_record(null::public.crm_tasks, p_task);
  if p_id is null then
    insert into public.crm_tasks(title, description, priority, due_date, lead_id, client_id, conversation_id, project_id)
    values (input.title, input.description, input.priority, input.due_date, input.lead_id, input.client_id, input.conversation_id, input.project_id)
    returning id into saved;
  else
    update public.crm_tasks t
    set title = input.title, description = input.description, priority = input.priority, due_date = input.due_date,
        lead_id = case when p_task ? 'lead_id' then input.lead_id else t.lead_id end,
        client_id = case
          when p_task ? 'client_id' then input.client_id
          when input.project_id is not null and t.project_id is distinct from input.project_id then null
          else t.client_id
        end,
        conversation_id = case when p_task ? 'conversation_id' then input.conversation_id else t.conversation_id end,
        project_id = case when p_task ? 'project_id' then input.project_id else t.project_id end
    where t.id = p_id and (not (p_task ? 'edit_version') or t.edit_version = input.edit_version)
    returning t.id into saved;
    if saved is null and exists (select 1 from public.crm_tasks where id = p_id) then
      raise exception 'La tarea cambió desde que abriste el formulario' using errcode = 'PT409';
    end if;
  end if;
  if saved is null then return null; end if;
  delete from public.crm_task_assignees where task_id = saved;
  insert into public.crm_task_assignees(task_id, user_id)
  select distinct saved, member from unnest(p_assignees) member;
  return saved;
end
$$;

create or replace function public.crm_save_project(p_id uuid, p_project jsonb, p_stages jsonb, p_assignees uuid[])
returns uuid language plpgsql set search_path = '' as $$
declare
  input public.crm_projects;
  saved uuid;
begin
  input := jsonb_populate_record(null::public.crm_projects, p_project);
  if p_id is null then
    insert into public.crm_projects(client_id, name, status, starts_on, due_on)
    values (input.client_id, input.name, input.status, input.starts_on, input.due_on) returning id into saved;
  else
    update public.crm_projects p
    set client_id = input.client_id, name = input.name, status = input.status,
        starts_on = input.starts_on, due_on = input.due_on
    where p.id = p_id and p.edit_version = input.edit_version returning p.id into saved;
    if saved is null and exists (select 1 from public.crm_projects where id = p_id) then
      raise exception 'El proyecto cambió desde que abriste el formulario' using errcode = 'PT409';
    end if;
  end if;
  if saved is null then return null; end if;

  insert into public.crm_project_stages(id, project_id, name, position)
  select stage.id, saved, stage.name, stage.position
  from jsonb_to_recordset(p_stages) as stage(id uuid, name text, position integer)
  on conflict (id) do update set name = excluded.name, position = excluded.position
    where crm_project_stages.project_id = saved;
  if exists (
    select 1 from jsonb_to_recordset(p_stages) as stage(id uuid)
    where not exists (select 1 from public.crm_project_stages s where s.id = stage.id and s.project_id = saved)
  ) then
    raise exception 'Etapa de otro proyecto' using errcode = '23514';
  end if;
  delete from public.crm_project_stages s where s.project_id = saved
    and not exists (select 1 from jsonb_to_recordset(p_stages) as stage(id uuid) where stage.id = s.id);
  update public.crm_projects set current_stage_id = input.current_stage_id where id = saved;

  delete from public.crm_project_assignees where project_id = saved;
  insert into public.crm_project_assignees(project_id, user_id)
  select distinct saved, member from unnest(p_assignees) member;
  return saved;
end
$$;
