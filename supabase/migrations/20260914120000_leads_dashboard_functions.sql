-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard del Gestor de Leads (Plan §1.4)
--
-- "Los agregados pesados se resuelven con funciones Postgres, en vez de traer
-- filas al servidor para contarlas." SECURITY INVOKER (default): corren con el
-- rol del usuario logueado, así que RLS filtra igual que en cualquier query.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Resumen: StatTiles del tope de la pantalla ────────────────────────────

create or replace function public.leads_dashboard_summary()
returns table (
  total_leads bigint,
  contacted bigint,
  scheduled bigint,
  won bigint,
  conversion_rate numeric
)
language sql
stable
as $$
  select
    count(*) as total_leads,
    count(*) filter (where last_contacted_at is not null) as contacted,
    count(*) filter (where status = 'AGENDADO') as scheduled,
    count(*) filter (where status = 'CERRADO_GANADO') as won,
    round(
      (count(*) filter (where status = 'CERRADO_GANADO'))::numeric
        / nullif(count(*), 0) * 100,
      1
    ) as conversion_rate
  from public.leads;
$$;

-- ── Embudo por estado ──────────────────────────────────────────────────────
-- unnest ... with ordinality preserva el orden de declaración del enum
-- (NUEVO → ... → DESCARTADO), que es el orden del pipeline.

create or replace function public.leads_funnel_by_status()
returns table (
  status lead_status,
  lead_count bigint
)
language sql
stable
as $$
  select s.status, count(l.id) as lead_count
  from unnest(enum_range(null::lead_status)) with ordinality as s(status, ord)
  left join public.leads l on l.status = s.status
  group by s.status, s.ord
  order by s.ord;
$$;

-- ── Evolución de contactos y cierres ───────────────────────────────────────
-- Se lee de lead_activities, no de un contador aparte: es la misma fuente de
-- verdad que ya alimenta el timeline de la ficha del lead.

create or replace function public.leads_activity_timeline(days integer default 30)
returns table (
  day date,
  contacted bigint,
  won bigint
)
language sql
stable
as $$
  select
    d::date as day,
    coalesce(c.contacted, 0) as contacted,
    coalesce(w.won, 0) as won
  from generate_series(
    date_trunc('day', now()) - ((least(greatest(days, 7), 180) - 1) || ' days')::interval,
    date_trunc('day', now()),
    interval '1 day'
  ) as d
  left join (
    select date_trunc('day', occurred_at) as day, count(*) as contacted
    from public.lead_activities
    where type in ('WHATSAPP', 'EMAIL', 'LLAMADA')
    group by 1
  ) c on c.day = d
  left join (
    select date_trunc('day', occurred_at) as day, count(*) as won
    from public.lead_activities
    where type = 'CAMBIO_ESTADO' and to_status = 'CERRADO_GANADO'
    group by 1
  ) w on w.day = d
  order by d;
$$;

-- ── Distribución por rubro ─────────────────────────────────────────────────

create or replace function public.leads_by_industry()
returns table (
  industry_id uuid,
  name text,
  color text,
  lead_count bigint
)
language sql
stable
as $$
  select
    i.id as industry_id,
    coalesce(i.name, 'Sin rubro') as name,
    coalesce(i.color, '#AAB8D4') as color,
    count(l.id) as lead_count
  from public.leads l
  left join public.industries i on i.id = l.industry_id
  group by i.id, i.name, i.color
  order by lead_count desc;
$$;

-- ── Rendimiento por lista de origen ────────────────────────────────────────
-- Qué combinación de rubro+zona cierra mejor, para justificar en qué gastar
-- crédito de Apify. Sólo listas con al menos un lead importado.

create or replace function public.leads_performance_by_list()
returns table (
  list_id uuid,
  name text,
  source lead_source,
  criteria jsonb,
  industry_name text,
  industry_color text,
  lead_count bigint,
  won_count bigint,
  win_rate numeric
)
language sql
stable
as $$
  select
    ll.id as list_id,
    ll.name,
    ll.source,
    ll.criteria,
    i.name as industry_name,
    i.color as industry_color,
    count(l.id) as lead_count,
    count(l.id) filter (where l.status = 'CERRADO_GANADO') as won_count,
    round(
      (count(l.id) filter (where l.status = 'CERRADO_GANADO'))::numeric
        / nullif(count(l.id), 0) * 100,
      1
    ) as win_rate
  from public.lead_lists ll
  left join public.leads l on l.lead_list_id = ll.id
  left join public.industries i on i.id = ll.industry_id
  group by ll.id, ll.name, ll.source, ll.criteria, i.name, i.color
  having count(l.id) > 0
  order by win_rate desc nulls last, lead_count desc
  limit 8;
$$;
