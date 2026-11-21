create table public.crm_task_assignees (
  task_id uuid not null references public.crm_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (task_id, user_id)
);
create index crm_task_assignees_user on public.crm_task_assignees(user_id, task_id);

insert into public.crm_task_assignees(task_id, user_id)
select id, assignee_id from public.crm_tasks;

drop function public.crm_assigned_tasks();
drop trigger crm_check_task_assignment on public.crm_tasks;
alter table public.crm_tasks drop column assignee_id;
alter table public.crm_task_assignees enable row level security;
revoke all on public.crm_task_assignees from public, anon, authenticated;
grant select, insert, delete on public.crm_task_assignees to authenticated;
create policy crm_visible_task on public.crm_task_assignees for all to authenticated
  using (exists (select 1 from public.crm_tasks t where t.id = task_id))
  with check (exists (select 1 from public.crm_tasks t where t.id = task_id));

create function public.crm_same_team(p_left uuid, p_right uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_left = p_right or exists (
    select 1 from public.team_members l join public.team_members r using (team_id)
    where l.owner_id = p_left and r.owner_id = p_right
  )
$$;
revoke all on function public.crm_same_team(uuid, uuid) from public, anon, authenticated;

create function public.crm_validate_task_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.crm_tasks t where t.id = new.task_id
      and public.crm_same_team(t.owner_id, new.user_id)
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.crm_validate_task_assignee() from public, anon, authenticated;
create trigger crm_validate_task_assignee before insert on public.crm_task_assignees
for each row execute function public.crm_validate_task_assignee();

create function public.crm_save_task(p_id uuid, p_task jsonb, p_assignees uuid[])
returns uuid language plpgsql set search_path = '' as $$
declare
  input public.crm_tasks;
  saved uuid;
begin
  input := jsonb_populate_record(null::public.crm_tasks, p_task);
  if p_id is null then
    insert into public.crm_tasks(title, description, priority, due_date, lead_id, client_id, conversation_id)
    values (input.title, input.description, input.priority, input.due_date, input.lead_id, input.client_id, input.conversation_id)
    returning id into saved;
  else
    update public.crm_tasks t
    set title = input.title, description = input.description, priority = input.priority, due_date = input.due_date,
        lead_id = case when p_task ? 'lead_id' then input.lead_id else t.lead_id end,
        client_id = case when p_task ? 'client_id' then input.client_id else t.client_id end,
        conversation_id = case when p_task ? 'conversation_id' then input.conversation_id else t.conversation_id end
    where t.id = p_id returning t.id into saved;
  end if;
  if saved is null then return null; end if;
  delete from public.crm_task_assignees where task_id = saved;
  insert into public.crm_task_assignees(task_id, user_id)
  select distinct saved, member from unnest(p_assignees) member;
  return saved;
end
$$;
revoke all on function public.crm_save_task(uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_save_task(uuid, jsonb, uuid[]) to authenticated;

alter table public.crm_client_contacts add column job_title text check (char_length(job_title) <= 120);
grant update (job_title) on public.crm_client_contacts to authenticated;

drop function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text, uuid);
create function public.crm_create_client(
  p_name text, p_status public.crm_client_status, p_source uuid default null,
  p_notes text default null, p_contact_name text default null, p_email text default null,
  p_phone text default null, p_assignee uuid default auth.uid(), p_job_title text default null
)
returns uuid language plpgsql set search_path = '' as $$
declare client uuid;
begin
  if p_source is not null then
    select id into client from public.crm_clients where source_lead_id = p_source and owner_id = (select auth.uid());
    if found then return client; end if;
  end if;
  insert into public.crm_clients(source_lead_id, name, status, notes, assignee_id)
  values (p_source, p_name, p_status, p_notes, p_assignee)
  on conflict (source_lead_id) do nothing returning id into client;

  if client is null then
    select id into strict client from public.crm_clients where source_lead_id = p_source and owner_id = (select auth.uid());
  elsif p_contact_name is not null then
    insert into public.crm_client_contacts(client_id, name, email, phone, job_title)
    values (client, p_contact_name, p_email, p_phone, p_job_title);
  end if;
  return client;
end
$$;
revoke all on function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text, uuid, text)
  to authenticated;

create table public.crm_board_colors (
  team_id uuid not null references public.teams(id) on delete cascade,
  status public.crm_task_status not null,
  color text not null check (color in ('gray', 'amber', 'green', 'blue', 'purple', 'rose')),
  primary key (team_id, status)
);
alter table public.crm_board_colors enable row level security;
revoke all on public.crm_board_colors from public, anon, authenticated;
grant select, insert, update on public.crm_board_colors to authenticated;
create policy crm_board_team on public.crm_board_colors for all to authenticated
  using (team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  with check (team_id = (select team_id from public.team_members where owner_id = (select auth.uid())));
