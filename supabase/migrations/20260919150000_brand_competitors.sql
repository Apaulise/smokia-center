-- ═══════════════════════════════════════════════════════════════════════════
-- Competencia (Plans/03 §3.8)
--
-- brand_competitors son las cuentas que se eligen seguir; brand_competitor_posts
-- guarda lo público de cada una de sus publicaciones (likes, comentarios,
-- views, caption): alcance, guardados, watch time y skip rate son privados del
-- dueño de la cuenta y ninguna herramienta los tiene, así que NO hay columnas
-- para ellos — confundir las dos listas haría que las comparaciones mientan.
--
-- El estado de la corrida de Apify vive en la fila del competidor (run id,
-- estado, costo, error) en vez de una tabla de jobs aparte: hay una corrida
-- por cuenta y no se necesita el historial. Se reconcilia con la sesión del
-- usuario (RLS), sin webhook y sin service role: cada actualización la dispara
-- una persona, porque Apify cobra por resultado.
--
-- Las métricas de una publicación ajena son un snapshot: se pisan al
-- actualizar. Guardar el historial diario (como brand_post_metrics) pide una
-- corrida por día y por cuenta, que es plata; no se pide en este paso.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.brand_competitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  username text not null,
  display_name text,
  -- Cuántas publicaciones recientes trae cada corrida. Es lo que fija el costo.
  results_limit integer not null default 30 check (results_limit between 1 and 100),
  status job_status not null default 'PENDIENTE',
  apify_run_id text,
  last_run_started_at timestamptz,
  last_cost_usd numeric(10, 4),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, username)
);

create table public.brand_competitor_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  competitor_id uuid not null references public.brand_competitors (id) on delete cascade,
  external_id text not null,
  kind brand_post_kind not null,
  permalink text,
  caption text,
  thumbnail_url text,
  published_at timestamptz,
  -- null = la cuenta ocultó el dato (Apify devuelve -1) o el formato no lo tiene
  likes bigint,
  comments bigint,
  views bigint,
  is_pinned boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, competitor_id, external_id)
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index brand_competitors_owner_idx on public.brand_competitors (owner_id);
create index brand_competitors_owner_platform_idx on public.brand_competitors (owner_id, platform);
create index brand_competitor_posts_owner_idx on public.brand_competitor_posts (owner_id);
create index brand_competitor_posts_competitor_published_idx
  on public.brand_competitor_posts (competitor_id, published_at desc);

-- ── Triggers de updated_at ─────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['brand_competitors', 'brand_competitor_posts']
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

do $do$
declare
  target text;
begin
  foreach target in array array['brand_competitors', 'brand_competitor_posts']
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
