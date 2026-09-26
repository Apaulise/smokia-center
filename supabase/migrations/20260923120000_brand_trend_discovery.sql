-- ═══════════════════════════════════════════════════════════════════════════
-- Descubrir virales (Plans/03 §3.15)
--
-- Segunda vía para encontrar outliers, independiente de las cuentas seguidas
-- de §3.8: una búsqueda por hashtag trae reels de CUALQUIER cuenta del nicho,
-- sin necesidad de haberla seguido antes.
--
-- brand_trend_searches es el job de una búsqueda (mismo rol que el estado de
-- corrida en brand_competitors); brand_trend_posts son los reels que trajo,
-- cada uno de una cuenta distinta, por eso guarda su propio username en vez
-- de depender de una fila de cuenta seguida.
--
-- Mismo actor, mismo settings key de Apify y misma ausencia de webhook/service
-- role que brand_competitors: cada búsqueda la dispara una persona y se
-- reconcilia con SU sesión (RLS).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.brand_trend_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Los hashtags tal como se escribieron, para precargar el próximo input.
  query text not null,
  results_limit integer not null check (results_limit between 1 and 100),
  status job_status not null default 'PENDIENTE',
  apify_run_id text,
  last_run_started_at timestamptz,
  last_cost_usd numeric(10, 4),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_trend_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Un reel sobrevive a la búsqueda que lo encontró primero: on delete set null,
  -- misma razón que source_url en brand_content_items.
  search_id uuid references public.brand_trend_searches (id) on delete set null,
  external_id text not null,
  -- La cuenta dueña del reel: acá SÍ importa, porque no hay una fila de
  -- competidor seguido detrás.
  username text not null,
  display_name text,
  profile_pic_url text,
  kind brand_post_kind not null,
  permalink text,
  caption text,
  thumbnail_url text,
  published_at timestamptz,
  -- null = la cuenta ocultó el dato (Apify devuelve -1) o el formato no lo tiene
  likes bigint,
  comments bigint,
  views bigint,
  dismissed_at timestamptz,
  relevance_score smallint check (relevance_score between 0 and 100),
  relevance_reason text,
  relevance_checked_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un reel puede resurgir en otra búsqueda o hashtag: se pisa con upsert, no se duplica.
  unique (owner_id, external_id)
);

alter table public.brand_content_items
  -- De qué reel descubierto salió la idea. on delete set null: mismo criterio
  -- que source_competitor_post_id.
  add column source_trend_post_id uuid
    references public.brand_trend_posts (id) on delete set null;

-- ── Índices ────────────────────────────────────────────────────────────────

create index brand_trend_searches_owner_idx on public.brand_trend_searches (owner_id);
create index brand_trend_posts_owner_idx on public.brand_trend_posts (owner_id);
create index brand_trend_posts_owner_published_idx
  on public.brand_trend_posts (owner_id, published_at desc);

-- Los candidatos a clasificar son los no descartados sin clasificar: índice parcial
-- porque es exactamente la fila que busca collectTrendRelevanceCandidates.
create index brand_trend_posts_pending_relevance_idx
  on public.brand_trend_posts (owner_id, published_at desc)
  where relevance_checked_at is null and dismissed_at is null;

create index brand_content_items_source_trend_post_idx
  on public.brand_content_items (source_trend_post_id);

-- ── Triggers de updated_at ─────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['brand_trend_searches', 'brand_trend_posts']
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
  foreach target in array array['brand_trend_searches', 'brand_trend_posts']
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
