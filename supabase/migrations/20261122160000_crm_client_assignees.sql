alter type public.crm_client_status add value 'renewal';
alter type public.crm_client_status add value 'completed';
alter type public.crm_client_status add value 'archived';

-- Keep the original assignee as the primary contact for older deployments.
create table public.crm_client_additional_assignees (
  client_id uuid not null references public.crm_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (client_id, user_id)
);
create index crm_client_additional_assignees_user
  on public.crm_client_additional_assignees(user_id, client_id);
alter table public.crm_client_additional_assignees enable row level security;
revoke all on public.crm_client_additional_assignees from public, anon, authenticated;
grant select, insert, delete on public.crm_client_additional_assignees to authenticated;
create policy crm_visible_client on public.crm_client_additional_assignees for all to authenticated
  using (exists (select 1 from public.crm_clients c where c.id = client_id))
  with check (exists (select 1 from public.crm_clients c where c.id = client_id));

create function public.crm_validate_client_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.crm_clients c where c.id = new.client_id
      and public.crm_same_team(c.owner_id, new.user_id)
  ) then
    raise exception 'Responsable fuera del equipo' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.crm_validate_client_assignee() from public, anon, authenticated;
create trigger crm_validate_client_assignee before insert on public.crm_client_additional_assignees
for each row execute function public.crm_validate_client_assignee();

create function public.crm_write_client(
  p_id uuid, p_name text, p_status public.crm_client_status, p_assignees uuid[],
  p_notes text default null, p_source uuid default null, p_contact_name text default null,
  p_email text default null, p_phone text default null, p_job_title text default null
)
returns uuid language plpgsql set search_path = '' as $$
declare
  saved uuid;
  primary_assignee uuid := p_assignees[1];
begin
  if p_id is null then
    insert into public.crm_clients(source_lead_id, name, status, notes, assignee_id)
    values (p_source, p_name, p_status, p_notes, primary_assignee)
    on conflict (source_lead_id) do nothing returning id into saved;
    if saved is null then
      select id into strict saved from public.crm_clients
        where source_lead_id = p_source and owner_id = (select auth.uid());
      return saved;
    end if;
    if p_contact_name is not null then
      insert into public.crm_client_contacts(client_id, name, email, phone, job_title)
      values (saved, p_contact_name, p_email, p_phone, p_job_title);
    end if;
  else
    update public.crm_clients
      set name = p_name, status = p_status, notes = p_notes, assignee_id = primary_assignee
      where id = p_id returning id into saved;
    if saved is null then return null; end if;
  end if;

  delete from public.crm_client_additional_assignees where client_id = saved;
  insert into public.crm_client_additional_assignees(client_id, user_id)
    select distinct saved, member from unnest(p_assignees) as member
    where member is distinct from primary_assignee;
  return saved;
end
$$;
revoke all on function public.crm_write_client(uuid, text, public.crm_client_status, uuid[], text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.crm_write_client(uuid, text, public.crm_client_status, uuid[], text, uuid, text, text, text, text)
  to authenticated;
