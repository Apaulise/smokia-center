-- ═══════════════════════════════════════════════════════════════════════════
-- Experimentación de aperturas (Plan §1.19, SPA §7/§27)
--
-- Agrupa por ángulo y variante (Plan §1.11: la variante balancea tres
-- encuadres del primer mensaje) y devuelve n + tasa de respuesta humana, de
-- calificación y de agenda. Todo en SQL, como el resto del proyecto.
-- SECURITY INVOKER (default), como las demás funciones de agregados.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.lead_angle_variant_performance()
returns table (
  angle lead_sales_angle,
  variant smallint,
  n bigint,
  human_response_rate numeric,
  qualification_rate numeric,
  meeting_rate numeric
)
language sql
stable
as $$
  with openings as (
    -- angle/variant sólo los pone confirmLeadOpening (§1.11): toda fila con
    -- angle no nulo es, por construcción, una apertura confirmada.
    select lead_id, angle, variant
    from public.lead_messages
    where sender = 'VENDEDOR' and generated_by = 'IA' and angle is not null and variant is not null
  ),
  human_responses as (
    select distinct lead_id
    from public.lead_messages
    where sender = 'LEAD' and (analysis -> 'analysis' ->> 'response_type') = 'HUMANA'
  )
  select
    o.angle,
    o.variant,
    count(distinct o.lead_id) as n,
    (count(distinct o.lead_id) filter (where hr.lead_id is not null))::numeric
      / nullif(count(distinct o.lead_id), 0) as human_response_rate,
    (count(distinct o.lead_id) filter (
      where l.status in ('CALIFICADO','INTERESADO','REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')
    ))::numeric / nullif(count(distinct o.lead_id), 0) as qualification_rate,
    (count(distinct o.lead_id) filter (
      where l.status in ('REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')
    ))::numeric / nullif(count(distinct o.lead_id), 0) as meeting_rate
  from openings o
  left join human_responses hr on hr.lead_id = o.lead_id
  left join public.leads l on l.id = o.lead_id
  group by o.angle, o.variant
  order by o.angle, o.variant;
$$;
