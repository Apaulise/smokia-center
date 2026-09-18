-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 3 — Gestor de Marca Personal: esquema base (Plans/03 §3.2)
--
-- Mismas reglas que el esquema de Leads (CLAUDE.md §4):
--   · Toda tabla lleva owner_id con índice
--   · RLS activo con las 4 políticas, escritas (select auth.uid()) = owner_id
--   · WITH CHECK en escrituras, para que nadie reasigne owner_id
--
-- Las métricas se guardan como snapshot diario (captured_on): la API de
-- Instagram no devuelve historial, así que cada sincronización agrega una fila
-- por día en vez de pisar un único valor "actual" (ver Plans/03 §3.2).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────────────

create type brand_platform as enum ('INSTAGRAM', 'YOUTUBE');

create type brand_post_kind as enum ('REEL', 'POST', 'CARRUSEL', 'HISTORIA', 'VIDEO', 'SHORT');

create type brand_audience_dimension as enum ('EDAD', 'GENERO', 'CIUDAD', 'PAIS');

-- ── brand_accounts ─────────────────────────────────────────────────────────
-- Una fila por cuenta conectada y plataforma. external_id es lo que se manda
-- en select_accounts de Windsor cuando haya más de una cuenta por plataforma.

create table public.brand_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  external_id text not null,
  username text,
  display_name text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, external_id)
);

-- ── brand_posts ────────────────────────────────────────────────────────────
-- Catálogo de contenido. Las métricas del día viven aparte, en
-- brand_post_metrics — acá sólo lo que identifica la pieza.

create table public.brand_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.brand_accounts (id) on delete cascade,
  external_id text not null,
  kind brand_post_kind not null,
  permalink text,
  caption text,
  media_url text,
  thumbnail_url text,
  published_at timestamptz,
  -- Payload original de Windsor. Un conector cambia de forma sin avisar;
  -- guardarlo entero evita tener que re-sincronizar para recuperar un dato.
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, account_id, external_id)
);

-- ── brand_post_metrics ─────────────────────────────────────────────────────
-- Snapshot por pieza y por día. Instagram sólo expone el total "a hoy" de
-- cada pieza (no un histórico), así que la curva la construye la propia app
-- sincronizando todos los días y sin pisar el día anterior.

create table public.brand_post_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.brand_posts (id) on delete cascade,
  captured_on date not null,
  reach integer,
  impressions integer,
  views integer,
  likes integer,
  comments integer,
  shares integer,
  saved integer,
  reel_total_watch_time_ms bigint,
  reel_avg_watch_time_ms integer,
  reel_skip_rate numeric(5, 2),
  created_at timestamptz not null default now(),
  unique (post_id, captured_on)
);

-- ── brand_account_metrics ──────────────────────────────────────────────────
-- Snapshot de la cuenta por día (seguidores, alcance, interacciones, ...).

create table public.brand_account_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.brand_accounts (id) on delete cascade,
  captured_on date not null,
  followers_count integer,
  follows_count integer,
  media_count integer,
  reach integer,
  impressions integer,
  profile_views integer,
  new_followers integer,
  accounts_engaged integer,
  total_interactions integer,
  created_at timestamptz not null default now(),
  unique (account_id, captured_on)
);

-- ── brand_audience ─────────────────────────────────────────────────────────
-- Demografía en formato largo (dimensión, valor, tamaño) en vez de una
-- columna por tramo — así Instagram puede cambiar los cortes de edad/género
-- sin que haga falta una migración (Plans/03 §3.2).

create table public.brand_audience (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.brand_accounts (id) on delete cascade,
  captured_on date not null,
  dimension brand_audience_dimension not null,
  value text not null,
  size integer not null,
  created_at timestamptz not null default now(),
  unique (account_id, captured_on, dimension, value)
);

-- ── brand_sync_jobs ────────────────────────────────────────────────────────
-- Equivalente de scrape_jobs, pero para una corrida de sincronización contra
-- Windsor (pull, no webhook — no hay secreto de webhook que guardar acá).

create table public.brand_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  status job_status not null default 'PENDIENTE',
  date_from date,
  date_to date,
  items_imported integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────
-- owner_id indexado en TODAS: sin índice, cada política RLS provoca un scan
-- secuencial de la tabla entera. Sumado, índice sobre captured_on (Plans/03
-- §3.2) y sobre las columnas que usan los joins de lectura del dashboard.

create index brand_accounts_owner_idx on public.brand_accounts (owner_id);
create index brand_posts_owner_idx on public.brand_posts (owner_id);
create index brand_posts_account_idx on public.brand_posts (owner_id, account_id);
create index brand_post_metrics_owner_idx on public.brand_post_metrics (owner_id);
create index brand_post_metrics_captured_idx on public.brand_post_metrics (owner_id, captured_on);
create index brand_account_metrics_owner_idx on public.brand_account_metrics (owner_id);
create index brand_account_metrics_captured_idx on public.brand_account_metrics (owner_id, captured_on);
create index brand_audience_owner_idx on public.brand_audience (owner_id);
create index brand_audience_captured_idx on public.brand_audience (owner_id, captured_on);
create index brand_sync_jobs_owner_idx on public.brand_sync_jobs (owner_id);
create index brand_sync_jobs_owner_status_idx on public.brand_sync_jobs (owner_id, status);

-- ── Triggers de updated_at ─────────────────────────────────────────────────
-- Sólo en las tablas que se actualizan in place. Las de snapshot diario
-- (*_metrics, brand_audience) son upsert-por-día y sólo llevan created_at,
-- mismo criterio que lead_activities.

do $do$
declare
  target text;
begin
  foreach target in array array['brand_accounts', 'brand_posts', 'brand_sync_jobs']
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
-- Las cuatro políticas, idénticas en todas las tablas, aplicadas en loop
-- (mismo mecanismo que 20260911120000_init_leads.sql).

do $do$
declare
  target text;
begin
  foreach target in array array[
    'brand_accounts', 'brand_posts', 'brand_post_metrics', 'brand_account_metrics',
    'brand_audience', 'brand_sync_jobs'
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

-- ── Realtime ───────────────────────────────────────────────────────────────
-- La UI se va a suscribir a brand_sync_jobs para mostrar el progreso de una
-- sincronización sin polling, mismo patrón que scrape_jobs (Plans/03 §3.2).

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brand_sync_jobs'
  ) then
    alter publication supabase_realtime add table public.brand_sync_jobs;
  end if;
end;
$do$;
