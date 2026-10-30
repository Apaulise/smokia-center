-- Análisis semanal por área.
--
-- El CRM calcula los números que ya tiene (mensajes, seguimientos, Marca).
-- Lo que no está en el CRM —conclusiones, cambios propuestos y métricas
-- que informa el agente— vive acá. La UI edita el estado de cada cambio;
-- la API de automatización publica el texto, idempotente por
-- (owner_id, area, week_start).
--
-- Misma aislación que el resto de Operaciones: owner_id, RLS con
-- (select auth.uid()) y WITH CHECK. La API usa service role y escribe
-- el owner explícito (CLAUDE.md §4).

do $do$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'weekly_area') then
    create type public.weekly_area as enum (
      'whatsapp',
      'email',
      'seguimientos',
      'instagram',
      'youtube',
      'x_threads'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'weekly_change_status') then
    create type public.weekly_change_status as enum (
      'pendiente',
      'aprobado',
      'en_prueba',
      'descartado',
      'medido'
    );
  end if;
end;
$do$;

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  area public.weekly_area not null,
  -- Lunes calendario (Argentina). La semana es ese día y los seis siguientes.
  week_start date not null,
  conclusions text not null default '',
  conclusion_status public.weekly_change_status not null default 'pendiente',
  conclusion_result text,
  -- Métricas que el agente informa y el CRM no puede calcular.
  metrics jsonb not null default '[]'::jsonb,
  -- Desglose por tipo de mensaje cuando el área no lo tiene en el CRM.
  message_stats jsonb not null default '[]'::jsonb,
  -- Puntos por día que informa el agente (áreas sin serie en el CRM).
  series jsonb not null default '[]'::jsonb,
  -- { key, title, detail, status, result }
  changes jsonb not null default '[]'::jsonb,
  agent text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reports_week_monday check (extract(isodow from week_start) = 1),
  constraint weekly_reports_conclusions_len check (char_length(conclusions) <= 8000),
  constraint weekly_reports_result_len check (conclusion_result is null or char_length(conclusion_result) <= 2000),
  constraint weekly_reports_agent_len check (char_length(agent) between 1 and 40),
  constraint weekly_reports_metrics_array check (jsonb_typeof(metrics) = 'array'),
  constraint weekly_reports_stats_array check (jsonb_typeof(message_stats) = 'array'),
  constraint weekly_reports_series_array check (jsonb_typeof(series) = 'array'),
  constraint weekly_reports_changes_array check (jsonb_typeof(changes) = 'array')
);

create unique index if not exists weekly_reports_owner_area_week_idx
  on public.weekly_reports (owner_id, area, week_start);
create index if not exists weekly_reports_owner_idx on public.weekly_reports (owner_id);
create index if not exists weekly_reports_owner_week_idx on public.weekly_reports (owner_id, week_start desc);

drop trigger if exists weekly_reports_set_updated_at on public.weekly_reports;
create trigger weekly_reports_set_updated_at before update on public.weekly_reports
  for each row execute function public.set_updated_at();

do $do$
declare
  target text;
begin
  foreach target in array array['weekly_reports']
  loop
    execute format('alter table public.%I enable row level security', target);

    execute format('drop policy if exists owner_select on public.%I', target);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
       using ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_insert on public.%I', target);
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
       with check ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_update on public.%I', target);
    execute format(
      'create policy owner_update on public.%I for update to authenticated
       using ((select auth.uid()) = owner_id)
       with check ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_delete on public.%I', target);
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
       using ((select auth.uid()) = owner_id)', target
    );
  end loop;
end;
$do$;
