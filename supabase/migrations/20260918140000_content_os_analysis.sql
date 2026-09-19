-- ═══════════════════════════════════════════════════════════════════════════
-- Sistema Operativo de Contenido — ampliación de §3.5 (Plans/03 §3.10)
--
-- El prompt canónico (Awareness_AI_Sistema_de_Contenido.md) reemplaza al
-- system prompt improvisado de §3.5, y eso trae dos cambios de datos:
--
-- 1. `objective` en brand_recommendations: el SOC §16 es explícito en que no
--    se optimiza todo para lo mismo (alcance / autoridad / conversión), así
--    que una recomendación sin objetivo declarado no se puede evaluar
--    después. Nullable: las recomendaciones generadas antes de este cambio
--    no tienen forma de saber a qué objetivo apuntaban.
--
-- 2. brand_analysis_notes: el SOC §29 pide responder también "qué sabemos"
--    (respaldado por datos), "qué sospechamos" (hipótesis razonable) y "qué
--    no sabemos todavía" — narrativa del análisis completo, no de una
--    recomendación puntual, así que no encaja como columna de
--    brand_recommendations. Una fila por corrida de "Generar análisis"; la
--    pantalla usa la más reciente por plataforma.
-- ═══════════════════════════════════════════════════════════════════════════

create type brand_recommendation_objective as enum ('ALCANCE', 'AUTORIDAD', 'CONVERSION');

alter table public.brand_recommendations
  add column objective brand_recommendation_objective;

create table public.brand_analysis_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  knowns text not null,
  hypotheses text not null,
  unknowns text not null,
  period_from date,
  period_to date,
  created_at timestamptz not null default now()
);

create index brand_analysis_notes_owner_idx on public.brand_analysis_notes (owner_id);
create index brand_analysis_notes_owner_platform_created_idx
  on public.brand_analysis_notes (owner_id, platform, created_at desc);

do $do$
declare
  target text;
begin
  foreach target in array array['brand_analysis_notes']
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
