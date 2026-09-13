-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 1 — Gestor de Leads: esquema base
--
-- Reglas (ver CLAUDE.md §4):
--   · Toda tabla lleva owner_id con índice
--   · RLS activo con las 4 políticas, escritas (select auth.uid()) = owner_id
--   · WITH CHECK en escrituras, para que nadie reasigne owner_id
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────────────

create type lead_status as enum (
  'NUEVO',
  'CONTACTADO',
  'RESPONDIO',
  'AGENDADO',
  'PROPUESTA_ENVIADA',
  'CERRADO_GANADO',
  'CERRADO_PERDIDO',
  'DESCARTADO'
);

create type lead_source as enum (
  'GOOGLE_MAPS',
  'INSTAGRAM',
  'LINKEDIN',
  'CSV',
  'MANUAL'
);

create type job_status as enum (
  'PENDIENTE',
  'EN_CURSO',
  'COMPLETADO',
  'FALLIDO'
);

create type lead_activity_type as enum (
  'NOTA',
  'WHATSAPP',
  'EMAIL',
  'LLAMADA',
  'CAMBIO_ESTADO',
  'REUNION'
);

create type appointment_status as enum (
  'AGENDADA',
  'CONFIRMADA',
  'REALIZADA',
  'NO_ASISTIO',
  'CANCELADA'
);

create type message_channel as enum ('WHATSAPP', 'EMAIL');

-- ── updated_at automático ──────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ── settings ───────────────────────────────────────────────────────────────
-- Secretos por usuario (token de Apify, actores configurables).
-- value_encrypted viene cifrado con AES-256-GCM desde lib/crypto.ts: RLS impide
-- que otro usuario lea la fila, el cifrado hace que un dump tampoco sirva.

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, key)
);

-- ── industries (rubros) ────────────────────────────────────────────────────

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#18D6E8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

-- ── lead_lists ─────────────────────────────────────────────────────────────

create table public.lead_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source lead_source not null,
  -- rubro, zona y filtros con los que se generó. Se guarda para poder repetir
  -- la búsqueda y para medir qué combinación cierra mejor.
  criteria jsonb not null default '{}'::jsonb,
  status job_status not null default 'PENDIENTE',
  lead_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── leads ──────────────────────────────────────────────────────────────────

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_list_id uuid references public.lead_lists (id) on delete set null,
  industry_id uuid references public.industries (id) on delete set null,

  name text not null,
  phone text,
  email text,
  website text,
  address text,
  city text,
  region text,
  country text,
  latitude double precision,
  longitude double precision,
  rating numeric(2, 1),
  reviews_count integer,
  instagram_url text,
  linkedin_url text,
  source_url text,
  external_id text,
  -- Payload original del scraper. Los actores cambian sus campos sin avisar;
  -- guardarlo entero evita tener que re-scrapear para recuperar un dato.
  raw jsonb,

  status lead_status not null default 'NUEVO',
  notes text,
  last_contacted_at timestamptz,
  next_action_at timestamptz,

  -- Teléfono E.164 → dominio → source_url → slug(nombre+ciudad).
  -- Es lo que hace que reimportar la misma zona enriquezca en vez de duplicar.
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

-- ── lead_activities ────────────────────────────────────────────────────────
-- Timeline. Los cambios de estado se escriben solos, para que el historial no
-- dependa de que uno se acuerde de anotar.

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  type lead_activity_type not null,
  from_status lead_status,
  to_status lead_status,
  content text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── scrape_jobs ────────────────────────────────────────────────────────────

create table public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_list_id uuid not null references public.lead_lists (id) on delete cascade,
  provider lead_source not null,
  actor_id text not null,
  apify_run_id text,
  apify_dataset_id text,
  status job_status not null default 'PENDIENTE',
  input jsonb not null default '{}'::jsonb,
  error text,
  items_imported integer not null default 0,
  -- usageTotalUsd de la corrida. Apify cobra por resultado: saber cuánto salió
  -- cada lista importa tanto como los leads que trajo.
  cost_usd numeric(10, 4),
  -- Va en la URL del webhook. Apify no firma sus webhooks, así que esto es lo
  -- único que distingue un aviso real de uno inventado.
  webhook_secret text not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── appointments ───────────────────────────────────────────────────────────

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,
  status appointment_status not null default 'AGENDADA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ends_after_starts check (ends_at > starts_at)
);

-- ── message_templates ──────────────────────────────────────────────────────

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  channel message_channel not null,
  -- Admite {{nombre}}, {{rubro}}, {{ciudad}}
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────
-- owner_id indexado en TODAS: sin índice, cada política RLS provoca un scan
-- secuencial de la tabla entera.

create index settings_owner_idx on public.settings (owner_id);
create index industries_owner_idx on public.industries (owner_id);
create index lead_lists_owner_idx on public.lead_lists (owner_id);
create index leads_owner_idx on public.leads (owner_id);
create index lead_activities_owner_idx on public.lead_activities (owner_id);
create index scrape_jobs_owner_idx on public.scrape_jobs (owner_id);
create index appointments_owner_idx on public.appointments (owner_id);
create index message_templates_owner_idx on public.message_templates (owner_id);

-- Filtros reales de la UI
create index leads_owner_status_idx on public.leads (owner_id, status);
create index leads_owner_industry_idx on public.leads (owner_id, industry_id);
create index leads_owner_list_idx on public.leads (owner_id, lead_list_id);
create index leads_owner_created_idx on public.leads (owner_id, created_at desc);
create index leads_owner_next_action_idx on public.leads (owner_id, next_action_at)
  where next_action_at is not null;

create index lead_activities_lead_idx
  on public.lead_activities (owner_id, lead_id, occurred_at desc);

create index appointments_owner_starts_idx
  on public.appointments (owner_id, starts_at);

create index scrape_jobs_owner_status_idx on public.scrape_jobs (owner_id, status);
-- El webhook busca por run id; también evita procesar dos veces la misma corrida.
create unique index scrape_jobs_apify_run_idx on public.scrape_jobs (apify_run_id)
  where apify_run_id is not null;

-- ── Triggers de updated_at ─────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array[
    'settings', 'industries', 'lead_lists', 'leads',
    'scrape_jobs', 'appointments', 'message_templates'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      target, target
    );
  end loop;
end;
$do$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Las cuatro políticas, idénticas en todas las tablas. Se aplican en loop para
-- que sea imposible que una tabla quede con una política distinta a las demás.
--
-- (select auth.uid()) va envuelto en select a propósito: habilita la
-- optimización de initPlan de Postgres. Sin el select, la función se evalúa
-- una vez POR FILA.
--
-- drop + create en vez de IF NOT EXISTS: CREATE POLICY no lo soporta, y así la
-- migración se puede reejecutar sin romperse.

do $do$
declare
  target text;
begin
  foreach target in array array[
    'settings', 'industries', 'lead_lists', 'leads', 'lead_activities',
    'scrape_jobs', 'appointments', 'message_templates'
  ]
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
