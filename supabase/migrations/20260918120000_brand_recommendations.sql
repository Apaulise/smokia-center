-- ═══════════════════════════════════════════════════════════════════════════
-- Análisis y recomendaciones (Plans/03 §3.5)
--
-- Los patrones se calculan en SQL/TypeScript (lib/brand/insights/) y sólo el
-- agregado ya calculado entra al modelo — esta tabla guarda lo que el modelo
-- devuelve, con evidence en jsonb para que cada recomendación se pueda
-- auditar contra los posts reales que la sostienen.
-- ═══════════════════════════════════════════════════════════════════════════

-- "Qué repetir, qué cortar y qué probar" (Plans/03 §3.5) es literal: el
-- enum es esa clasificación, no una categoría temática aparte.
create type brand_recommendation_kind as enum ('REPETIR', 'CORTAR', 'PROBAR');

create type brand_recommendation_status as enum ('NUEVA', 'APLICADA', 'DESCARTADA');

create table public.brand_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  kind brand_recommendation_kind not null,
  status brand_recommendation_status not null default 'NUEVA',
  title text not null,
  body text not null,
  -- { summary: text, postIds: uuid[], metrics: Record<string, number|string> }
  -- Los postIds se validan contra brand_posts real antes de guardarse
  -- (lib/brand/ai/recommendations.ts) — el modelo no puede inventar evidencia.
  evidence jsonb not null default '{}'::jsonb,
  period_from date,
  period_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_recommendations_owner_idx on public.brand_recommendations (owner_id);
create index brand_recommendations_owner_platform_status_idx
  on public.brand_recommendations (owner_id, platform, status);

create trigger brand_recommendations_set_updated_at
  before update on public.brand_recommendations
  for each row execute function public.set_updated_at();

do $do$
declare
  target text;
begin
  foreach target in array array['brand_recommendations']
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
