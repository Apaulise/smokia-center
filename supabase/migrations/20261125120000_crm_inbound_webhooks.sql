-- Webhooks de calificación (Zernio) y de reservas (Cal.com).
--
-- No abre datos entre owners: la API sigue con service role y filtra por
-- AUTOMATION_OWNER_ID. Esta migración sólo agrega el rastro para que un
-- reintento no duplique y para guardar la reserva que no entra en las
-- columnas que ya tenía `appointments`.
--
-- `automation_runs.automation_id` pasa a ser opcional: los workflows de
-- calificación (TOFU/MOFU) no son una pieza de `content_automations`, y sin
-- esta columna nullable la corrida no se podía insertar.

alter table public.automation_runs
  alter column automation_id drop not null;

alter table public.automation_runs
  add column if not exists zernio_workflow_id text;

create index if not exists automation_runs_workflow_idx
  on public.automation_runs (owner_id, zernio_workflow_id)
  where zernio_workflow_id is not null;

alter table public.appointments
  add column if not exists external_provider text,
  add column if not exists external_uid text,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text;

create unique index if not exists appointments_external_uid_key
  on public.appointments (owner_id, external_provider, external_uid)
  where external_uid is not null;

create index if not exists leads_owner_email_idx
  on public.leads (owner_id, email)
  where email is not null;

create index if not exists leads_owner_phone_idx
  on public.leads (owner_id, phone)
  where phone is not null;

-- Entregas ya aceptadas. La fila se inserta al empezar y se borra si el
-- procesamiento falla, así un reintento vuelve a entrar.
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('zernio', 'cal')),
  event_id text not null,
  event_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, event_id)
);

create index if not exists webhook_deliveries_owner_idx
  on public.webhook_deliveries (owner_id);

drop trigger if exists webhook_deliveries_set_updated_at on public.webhook_deliveries;
create trigger webhook_deliveries_set_updated_at
  before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

alter table public.webhook_deliveries enable row level security;

drop policy if exists owner_select on public.webhook_deliveries;
create policy owner_select on public.webhook_deliveries
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists owner_insert on public.webhook_deliveries;
create policy owner_insert on public.webhook_deliveries
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists owner_update on public.webhook_deliveries;
create policy owner_update on public.webhook_deliveries
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists owner_delete on public.webhook_deliveries;
create policy owner_delete on public.webhook_deliveries
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
