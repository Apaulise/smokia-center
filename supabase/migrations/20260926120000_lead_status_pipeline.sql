-- ═══════════════════════════════════════════════════════════════════════════
-- Pipeline de 17 estados (Plan §1.8)
--
-- El orden de declaración importa: leads_funnel_by_status() usa
-- unnest(enum_range(...)) with ordinality, así que el orden del enum ES el
-- orden del embudo. Por eso no alcanza con ALTER TYPE ... ADD VALUE: hay que
-- recrear el tipo completo, en este orden exacto.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. leads_funnel_by_status() devuelve lead_status en su RETURNS, así que crea
--    una dependencia real: sin dropearla antes, el drop type de más abajo falla.
drop function public.leads_funnel_by_status();

-- 2. El tipo nuevo, con los 17 valores en orden de pipeline.
create type lead_status_new as enum (
  'NUEVO',
  'LISTO',
  'CONTACTADO',
  'AUTORESPUESTA',
  'RESPONDIO',
  'DIAGNOSTICO',
  'CALIFICADO',
  'INTERESADO',
  'REUNION_PROPUESTA',
  'REUNION_AGENDADA',
  'REUNION_REALIZADA',
  'PROPUESTA_ENVIADA',
  'CERRADO_GANADO',
  'AHORA_NO',
  'SEGUIMIENTO',
  'CERRADO_PERDIDO',
  'DESCARTADO'
);

-- 3. Un default no se puede castear.
alter table public.leads alter column status drop default;

-- 4. Castear las tres columnas. AGENDADO migra a REUNION_AGENDADA; el resto
--    conserva el mismo nombre.
alter table public.leads
  alter column status type lead_status_new
  using (case status::text when 'AGENDADO' then 'REUNION_AGENDADA' else status::text end)::lead_status_new;

alter table public.lead_activities
  alter column from_status type lead_status_new
  using (case from_status::text when 'AGENDADO' then 'REUNION_AGENDADA' else from_status::text end)::lead_status_new;

alter table public.lead_activities
  alter column to_status type lead_status_new
  using (case to_status::text when 'AGENDADO' then 'REUNION_AGENDADA' else to_status::text end)::lead_status_new;

-- 5. Swap de nombres.
drop type public.lead_status;
alter type lead_status_new rename to lead_status;

-- 6. Default de vuelta.
alter table public.leads alter column status set default 'NUEVO';

-- 7. leads_dashboard_summary() es `language sql` con el literal 'AGENDADO'
--    dentro del cuerpo, no en su firma: Postgres no registró la dependencia,
--    así que sobrevivió al drop type sin protestar y se habría roto recién en
--    runtime. Pasa a contar las tres etapas de reunión.
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
    count(*) filter (where status in ('REUNION_PROPUESTA', 'REUNION_AGENDADA', 'REUNION_REALIZADA')) as scheduled,
    count(*) filter (where status = 'CERRADO_GANADO') as won,
    round(
      (count(*) filter (where status = 'CERRADO_GANADO'))::numeric
        / nullif(count(*), 0) * 100,
      1
    ) as conversion_rate
  from public.leads;
$$;

-- 8. Recrear leads_funnel_by_status() igual que estaba: el orden lo da el enum.
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
