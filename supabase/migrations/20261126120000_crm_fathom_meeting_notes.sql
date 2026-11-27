create table public.crm_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.crm_clients(id) on delete set null,
  imported_by uuid default auth.uid() references auth.users(id) on delete set null,
  recording_id text not null check (recording_id ~ '^[1-9][0-9]{0,15}$'),
  stage text not null check (stage in ('diagnosis', 'sale')),
  title text not null check (char_length(title) between 1 and 300),
  meeting_at timestamptz not null,
  fathom_url text check (char_length(fathom_url) <= 2048),
  summary text not null check (char_length(summary) between 1 and 200000),
  action_items jsonb not null default '[]' check (jsonb_typeof(action_items) = 'array'),
  unique (lead_id, recording_id),
  unique (client_id, recording_id)
);

alter table public.crm_meeting_notes enable row level security;
revoke all on public.crm_meeting_notes from public, anon, authenticated;
grant select, insert on public.crm_meeting_notes to authenticated;

create policy crm_read_meeting_notes on public.crm_meeting_notes for select to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = (select auth.uid()))
    or exists (select 1 from public.crm_clients c where c.id = client_id)
  );

create policy crm_insert_meeting_notes on public.crm_meeting_notes for insert to authenticated
  with check (
    imported_by = (select auth.uid()) and case
      when client_id is not null then exists (select 1 from public.crm_clients c where c.id = client_id)
      else exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = (select auth.uid()))
    end
  );

-- Importación y conversión se serializan por lead. Se guarda una sola minuta.
create function public.crm_link_meeting_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.lead_id is null) = (new.client_id is null) then
    raise exception 'La minuta requiere un lead o un cliente' using errcode = '23514';
  end if;
  if new.lead_id is not null then
    if not exists(select 1 from public.leads l where l.id = new.lead_id and l.owner_id = auth.uid()) then
      raise exception 'Lead sin acceso' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.lead_id::text, 20261126));
    select id into new.client_id from public.crm_clients
      where source_lead_id = new.lead_id and owner_id = auth.uid();
  else
    select source_lead_id into new.lead_id from public.crm_clients where id = new.client_id;
  end if;
  return new;
end
$$;
revoke all on function public.crm_link_meeting_note() from public, anon, authenticated;
create trigger crm_link_meeting_note before insert on public.crm_meeting_notes
  for each row execute function public.crm_link_meeting_note();

create function public.crm_link_source_meeting_notes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.source_lead_id::text, 20261126));
  update public.crm_meeting_notes set client_id = new.id
    where lead_id = new.source_lead_id and client_id is null;
  return new;
end
$$;
revoke all on function public.crm_link_source_meeting_notes() from public, anon, authenticated;
create trigger crm_link_source_meeting_notes after insert on public.crm_clients
  for each row when (new.source_lead_id is not null)
  execute function public.crm_link_source_meeting_notes();

create function public.crm_prune_unlinked_meeting_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.crm_meeting_notes where id = new.id;
  return new;
end
$$;
revoke all on function public.crm_prune_unlinked_meeting_note() from public, anon, authenticated;
create trigger crm_prune_unlinked_meeting_note after update of lead_id, client_id on public.crm_meeting_notes
  for each row when (new.lead_id is null and new.client_id is null)
  execute function public.crm_prune_unlinked_meeting_note();
