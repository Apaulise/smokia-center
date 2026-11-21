create type public.crm_client_status as enum ('onboarding', 'active', 'paused');
create type public.crm_task_priority as enum ('high', 'normal', 'low');

create table public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_lead_id uuid unique references public.leads(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status public.crm_client_status not null default 'onboarding',
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.crm_client_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 80),
  foreign key (client_id, owner_id) references public.crm_clients(id, owner_id) on delete cascade
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assignee_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (char_length(description) <= 3000),
  priority public.crm_task_priority not null default 'normal',
  due_date date,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.crm_clients(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(lead_id, client_id, conversation_id) <= 1),
  check ((completed_at is null) = (completed_by is null))
);

create index crm_clients_owner_status on public.crm_clients(owner_id, status);
create index crm_contacts_owner_client on public.crm_client_contacts(owner_id, client_id);
create index crm_contacts_client on public.crm_client_contacts(client_id);
create index crm_tasks_owner_due on public.crm_tasks(owner_id, completed_at, due_date);
create index crm_tasks_assignee_due on public.crm_tasks(assignee_id, completed_at, due_date);
create index crm_tasks_lead on public.crm_tasks(lead_id);
create index crm_tasks_client on public.crm_tasks(client_id);
create index crm_tasks_conversation on public.crm_tasks(conversation_id);

do $$
declare relation text;
begin
  foreach relation in array array['crm_clients', 'crm_client_contacts', 'crm_tasks']
  loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('grant select, insert, update, delete on public.%I to authenticated', relation);
    execute format('create policy crm_select on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', relation);
    execute format('create policy crm_insert on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)', relation);
    execute format('create policy crm_update on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)', relation);
    execute format('create policy crm_delete on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)', relation);
  end loop;
end $$;

-- Las marcas de finalización las escribe exclusivamente crm_set_task_done.
revoke insert, update on public.crm_tasks from authenticated;
grant insert (id, owner_id, assignee_id, title, description, priority, due_date, lead_id, client_id, conversation_id)
  on public.crm_tasks to authenticated;
grant update (assignee_id, title, description, priority, due_date, lead_id, client_id, conversation_id)
  on public.crm_tasks to authenticated;

create function public.crm_check_client_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id = new.source_lead_id and l.owner_id = new.owner_id and l.status = 'CERRADO_GANADO'
  ) then
    raise exception 'Lead de origen inválido' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crm_check_client_source
before insert or update of source_lead_id, owner_id on public.crm_clients
for each row execute function public.crm_check_client_source();

-- Las referencias se comprueban con RLS de quien escribe, incluso desde la Data API.
create function public.crm_check_task_context()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.lead_id is not null and not exists (
    select 1 from public.leads where id = new.lead_id and owner_id = new.owner_id
  )) or (new.client_id is not null and not exists (
    select 1 from public.crm_clients where id = new.client_id and owner_id = new.owner_id
  )) or (new.conversation_id is not null and not exists (
    select 1 from public.conversations c where c.id = new.conversation_id and (
      c.owner_id = new.owner_id or c.team_id = (select team_id from public.team_members where owner_id = new.owner_id)
    )
  )) then
    raise exception 'Contexto de tarea inválido' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crm_check_task_context
before insert or update of lead_id, client_id, conversation_id, owner_id on public.crm_tasks
for each row execute function public.crm_check_task_context();

-- La lectura de membresía ajena se limita al predicado existente del equipo.
create function public.crm_check_task_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id <> new.owner_id and (
    new.owner_id is distinct from (select auth.uid()) or not public.team_can_see(new.assignee_id)
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger crm_check_task_assignment
before insert or update of assignee_id, owner_id on public.crm_tasks
for each row execute function public.crm_check_task_assignment();

create function public.crm_create_client(
  p_name text, p_status public.crm_client_status, p_source uuid default null,
  p_notes text default null, p_contact_name text default null,
  p_email text default null, p_phone text default null
)
returns uuid language plpgsql set search_path = '' as $$
declare client uuid;
begin
  if p_source is not null then
    select id into client from public.crm_clients where source_lead_id = p_source and owner_id = (select auth.uid());
    if found then return client; end if;
  end if;

  insert into public.crm_clients(source_lead_id, name, status, notes)
  values (p_source, p_name, p_status, p_notes)
  on conflict (source_lead_id) do nothing returning id into client;

  if client is null then
    select id into strict client from public.crm_clients where source_lead_id = p_source and owner_id = (select auth.uid());
  elsif p_contact_name is not null then
    insert into public.crm_client_contacts(client_id, name, email, phone)
    values (client, p_contact_name, p_email, p_phone);
  end if;
  return client;
end $$;

-- Sólo filas asignadas al usuario con membresía vigente. Los leads y clientes
-- del creador son privados. La conversación se devuelve si el socio puede verla.
create function public.crm_assigned_tasks()
returns table (
  id uuid, owner_id uuid, assignee_id uuid, title text, description text,
  priority public.crm_task_priority, due_date date, lead_id uuid, client_id uuid, conversation_id uuid,
  completed_at timestamptz, completed_by uuid, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.owner_id, t.assignee_id, t.title, t.description,
    t.priority, t.due_date, null::uuid, null::uuid, c.id,
    t.completed_at, t.completed_by, t.created_at
  from public.crm_tasks t
  left join public.conversations c on c.id = t.conversation_id and (
    c.owner_id = (select auth.uid()) or c.team_id = (
      select team_id from public.team_members where owner_id = (select auth.uid())
    )
  )
  where t.assignee_id = (select auth.uid()) and t.owner_id <> t.assignee_id
    and public.team_can_see(t.owner_id);
$$;

create function public.crm_set_task_done(p_id uuid, p_done boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.crm_tasks t
  set completed_at = case when p_done then coalesce(t.completed_at, now()) end,
      completed_by = case when p_done then coalesce(t.completed_by, (select auth.uid())) end
  where t.id = p_id and p_done is not null and (
    t.owner_id = (select auth.uid()) or (
      t.assignee_id = (select auth.uid()) and public.team_can_see(t.owner_id)
    )
  );
  return found;
end $$;

revoke all on function public.crm_check_client_source(), public.crm_check_task_context(), public.crm_check_task_assignment() from public, anon, authenticated;
revoke all on function public.crm_create_client(text,public.crm_client_status,uuid,text,text,text,text), public.crm_assigned_tasks(), public.crm_set_task_done(uuid,boolean) from public, anon;
grant execute on function public.crm_create_client(text,public.crm_client_status,uuid,text,text,text,text), public.crm_assigned_tasks(), public.crm_set_task_done(uuid,boolean) to authenticated;
