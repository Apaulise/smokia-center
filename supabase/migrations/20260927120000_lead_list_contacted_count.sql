-- Agrega contacted_count a leads_performance_by_list (Design System §04,
-- panel "LISTAS PARECIDAS": "20 leads · 4 contact."). "Contactado" es el
-- mismo criterio que STAGE_GROUP["Sin contactar"] en lib/leads/status.ts:
-- todo lo que no sea NUEVO/LISTO. El cambio de columnas de salida exige
-- dropear la función antes de recrearla (create or replace no alcanza
-- cuando cambia el shape del `returns table`).

drop function if exists public.leads_performance_by_list();

create function public.leads_performance_by_list()
returns table (
  list_id uuid,
  name text,
  source lead_source,
  criteria jsonb,
  industry_name text,
  industry_color text,
  lead_count bigint,
  contacted_count bigint,
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
    count(l.id) filter (where l.status not in ('NUEVO', 'LISTO')) as contacted_count,
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
