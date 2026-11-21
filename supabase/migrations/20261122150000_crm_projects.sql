create type public.crm_project_status as enum ('planned', 'in_progress', 'paused', 'done');

create table public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.crm_clients(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status public.crm_project_status not null default 'planned',
  starts_on date,
  due_on date,
  current_stage_id uuid,
  created_at timestamptz not null default now(),
  unique (id, client_id),
  constraint crm_project_dates check (starts_on <= due_on)
);
create index crm_projects_client on public.crm_projects(client_id, id);

create table public.crm_project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position integer not null check (position >= 0),
  unique (project_id, id)
);
create index crm_project_stages_order on public.crm_project_stages(project_id, position, id);

alter table public.crm_projects add constraint crm_project_current_stage
  foreign key (id, current_stage_id) references public.crm_project_stages(project_id, id)
  on delete set null (current_stage_id);

create table public.crm_project_assignees (
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (project_id, user_id)
);
create index crm_project_assignees_user on public.crm_project_assignees(user_id, project_id);

alter table public.crm_projects enable row level security;
alter table public.crm_project_stages enable row level security;
alter table public.crm_project_assignees enable row level security;
revoke all on public.crm_projects, public.crm_project_stages, public.crm_project_assignees from public, anon, authenticated;
grant select, insert on public.crm_projects to authenticated;
grant update (client_id, name, status, starts_on, due_on, current_stage_id) on public.crm_projects to authenticated;
grant select, insert, delete on public.crm_project_stages to authenticated;
grant update (name, position) on public.crm_project_stages to authenticated;
grant select, insert, delete on public.crm_project_assignees to authenticated;

create policy crm_project_company on public.crm_projects for all to authenticated
  using (exists (select 1 from public.crm_clients c where c.id = client_id))
  with check (exists (select 1 from public.crm_clients c where c.id = client_id));
create policy crm_stage_project on public.crm_project_stages for all to authenticated
  using (exists (select 1 from public.crm_projects p where p.id = project_id))
  with check (exists (select 1 from public.crm_projects p where p.id = project_id));
create policy crm_assignee_project on public.crm_project_assignees for all to authenticated
  using (exists (select 1 from public.crm_projects p where p.id = project_id))
  with check (exists (select 1 from public.crm_projects p where p.id = project_id));

create function public.crm_validate_project_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.crm_projects p join public.crm_clients c on c.id = p.client_id
    where p.id = new.project_id and public.crm_same_team(c.owner_id, new.user_id)
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.crm_validate_project_assignee() from public, anon, authenticated;
create trigger crm_validate_project_assignee before insert on public.crm_project_assignees
for each row execute function public.crm_validate_project_assignee();

alter table public.crm_tasks drop constraint crm_tasks_check,
  add column project_id uuid,
  add constraint crm_task_one_origin check (num_nonnulls(lead_id, conversation_id) <= 1),
  add constraint crm_task_project_has_client check (project_id is null or client_id is not null),
  add constraint crm_task_project_client foreign key (project_id, client_id)
    references public.crm_projects(id, client_id) on delete set null (project_id);
create index crm_tasks_project on public.crm_tasks(project_id, client_id);
grant insert (project_id), update (project_id) on public.crm_tasks to authenticated;

drop trigger crm_check_task_context on public.crm_tasks;
create or replace function public.crm_check_task_context()
returns trigger language plpgsql set search_path = '' as $$
declare project_client uuid;
begin
  if new.project_id is not null and
    (TG_OP = 'INSERT' or new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id) then
    select client_id into project_client from public.crm_projects where id = new.project_id;
    if not found or (new.client_id is not null and new.client_id <> project_client) then
      raise exception 'El proyecto no está disponible para ese cliente' using errcode = '23514';
    end if;
    new.client_id := project_client;
  end if;
  if new.lead_id is not null and (TG_OP = 'INSERT' or new.lead_id is distinct from old.lead_id)
    and not exists (select 1 from public.leads where id = new.lead_id) then
    raise exception 'Prospecto de origen no disponible' using errcode = '23514';
  end if;
  if new.client_id is not null and (TG_OP = 'INSERT' or new.client_id is distinct from old.client_id)
    and not exists (select 1 from public.crm_clients where id = new.client_id) then
    raise exception 'Cliente no disponible' using errcode = '23514';
  end if;
  if new.conversation_id is not null and (TG_OP = 'INSERT' or new.conversation_id is distinct from old.conversation_id)
    and not exists (select 1 from public.conversations where id = new.conversation_id) then
    raise exception 'Chat de origen no disponible' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger crm_check_task_context
before insert or update of lead_id, client_id, conversation_id, project_id on public.crm_tasks
for each row execute function public.crm_check_task_context();

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
    where t.id = p_id returning t.id into saved;
  end if;
  if saved is null then return null; end if;
  delete from public.crm_task_assignees where task_id = saved;
  insert into public.crm_task_assignees(task_id, user_id)
  select distinct saved, member from unnest(p_assignees) member;
  return saved;
end
$$;

create function public.crm_save_project(p_id uuid, p_project jsonb, p_stages jsonb, p_assignees uuid[])
returns uuid language plpgsql set search_path = '' as $$
declare
  input public.crm_projects;
  saved uuid;
begin
  input := jsonb_populate_record(null::public.crm_projects, p_project);
  -- Existe una dependencia en ambos sentidos entre proyecto y etapa actual.
  -- Se sincroniza la colección antes de fijar la etapa, en la misma transacción.
  if p_id is null then
    insert into public.crm_projects(client_id, name, status, starts_on, due_on)
    values (input.client_id, input.name, input.status, input.starts_on, input.due_on) returning id into saved;
  else
    update public.crm_projects
    set client_id = input.client_id, name = input.name, status = input.status,
        starts_on = input.starts_on, due_on = input.due_on
    where id = p_id returning id into saved;
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
revoke all on function public.crm_save_project(uuid, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_save_project(uuid, jsonb, jsonb, uuid[]) to authenticated;
