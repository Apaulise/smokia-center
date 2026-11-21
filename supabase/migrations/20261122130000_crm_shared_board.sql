create type public.crm_task_status as enum ('pending', 'in_progress', 'done');

alter table public.crm_tasks add column status public.crm_task_status;
update public.crm_tasks set status = case when completed_at is null then 'pending' else 'done' end::public.crm_task_status;
alter table public.crm_tasks
  alter column status set default 'pending',
  alter column status set not null,
  add constraint crm_task_completion_matches_status check ((status = 'done') = (completed_at is not null));

alter table public.crm_clients add column assignee_id uuid references auth.users(id) on delete set null;
update public.crm_clients set assignee_id = owner_id;
alter table public.crm_clients alter column assignee_id set default auth.uid();
create index crm_clients_assignee on public.crm_clients(assignee_id);

create function public.crm_can_access(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = p_owner or public.team_can_see(p_owner)
$$;

revoke all on function public.crm_can_access(uuid) from public, anon, authenticated;
grant execute on function public.crm_can_access(uuid) to authenticated;

do $$
declare relation text;
begin
  foreach relation in array array['crm_clients', 'crm_client_contacts', 'crm_tasks']
  loop
    execute format('alter policy crm_select on public.%I using (public.crm_can_access(owner_id))', relation);
    execute format('alter policy crm_update on public.%I using (public.crm_can_access(owner_id)) with check (public.crm_can_access(owner_id))', relation);
  end loop;
end $$;

alter policy crm_insert on public.crm_client_contacts with check (public.crm_can_access(owner_id));
revoke update on public.crm_clients, public.crm_client_contacts from authenticated;
grant update (name, status, notes, assignee_id) on public.crm_clients to authenticated;
grant update (name, email, phone) on public.crm_client_contacts to authenticated;

-- El contacto hereda el dueño de la empresa, inclusive al crearlo un compañero.
create function public.crm_contact_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  select owner_id into new.owner_id from public.crm_clients where id = new.client_id;
  if not found then
    raise exception 'Cliente no disponible' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger crm_contact_owner before insert on public.crm_client_contacts
for each row execute function public.crm_contact_owner();
revoke all on function public.crm_contact_owner() from public, anon, authenticated;

create or replace function public.crm_check_task_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id
    and new.owner_id = old.owner_id then
    return new;
  end if;
  if new.assignee_id is not null and new.assignee_id <> new.owner_id and not exists (
    select 1
    from public.team_members owner_member
    join public.team_members assignee_member using (team_id)
    where owner_member.owner_id = new.owner_id and assignee_member.owner_id = new.assignee_id
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger crm_check_client_assignment
before insert or update of assignee_id, owner_id on public.crm_clients
for each row execute function public.crm_check_task_assignment();

create or replace function public.crm_check_task_context()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.lead_id, new.client_id, new.conversation_id)
    is not distinct from (old.lead_id, old.client_id, old.conversation_id) and new.owner_id = old.owner_id then
    return new;
  end if;
  if (new.lead_id is not null and not exists (select 1 from public.leads where id = new.lead_id))
    or (new.client_id is not null and not exists (select 1 from public.crm_clients where id = new.client_id))
    or (new.conversation_id is not null and not exists (select 1 from public.conversations where id = new.conversation_id)) then
    raise exception 'Contexto de tarea inválido' using errcode = '23514';
  end if;
  return new;
end
$$;

drop function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text);
create function public.crm_create_client(
  p_name text, p_status public.crm_client_status, p_source uuid default null,
  p_notes text default null, p_contact_name text default null,
  p_email text default null, p_phone text default null, p_assignee uuid default auth.uid()
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
    insert into public.crm_client_contacts(client_id, name, email, phone)
    values (client, p_contact_name, p_email, p_phone);
  end if;
  return client;
end
$$;

create function public.crm_set_task_status(p_id uuid, p_status public.crm_task_status)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.crm_tasks t
  set status = p_status,
      completed_at = case when p_status = 'done' then coalesce(t.completed_at, now()) end,
      completed_by = case when p_status = 'done' then coalesce(t.completed_by, (select auth.uid())) end
  where t.id = p_id and p_status is not null and public.crm_can_access(t.owner_id);
  return found;
end
$$;

create or replace function public.crm_set_task_done(p_id uuid, p_done boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select public.crm_set_task_status(p_id, case p_done when true then 'done'::public.crm_task_status
    when false then 'pending'::public.crm_task_status end)
$$;

revoke all on function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text, uuid),
  public.crm_set_task_status(uuid, public.crm_task_status) from public, anon, authenticated;
grant execute on function public.crm_create_client(text, public.crm_client_status, uuid, text, text, text, text, uuid),
  public.crm_set_task_status(uuid, public.crm_task_status) to authenticated;
