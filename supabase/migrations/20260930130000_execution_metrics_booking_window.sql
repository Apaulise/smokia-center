-- ═══════════════════════════════════════════════════════════════════════════
-- Cadena de ejecución (Plan §1.22): la cohorte de agenda se CORRE, no se recorta
--
-- La versión de 20260930120000 tomaba los contactos de la ventana y les
-- sacaba los últimos p_booking_lag_days. Con la ventana de 7 días y un margen
-- de 7, la cohorte quedaba siempre vacía. Ahora la cohorte es una ventana del
-- mismo largo desplazada p_booking_lag_days hacia atrás: "7d" mide a los
-- contactados entre hace 14 y hace 7 días, que ya tuvieron tiempo de agendar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.leads_execution_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_booking_lag_days integer default 7
)
returns table (
  contacts bigint,
  human_responses bigint,
  booking_cohort bigint,
  booked bigint,
  meetings_held bigint,
  meetings_no_show bigint,
  held_leads bigint,
  won_from_held bigint,
  won_in_window bigint
)
language sql
stable
set search_path = ''
as $$
  with contacted as (
    select lead_id
    from public.lead_first_contacts
    where first_contact_at >= p_from and first_contact_at < p_to
  ),
  cohort as (
    select lead_id
    from public.lead_first_contacts
    where first_contact_at >= p_from - make_interval(days => p_booking_lag_days)
      and first_contact_at < least(p_to, now()) - make_interval(days => p_booking_lag_days)
  ),
  reached_meeting as (
    select lead_id from public.appointments where lead_id is not null
    union
    select lead_id from public.lead_activities
      where type = 'CAMBIO_ESTADO'
        and to_status in ('REUNION_AGENDADA', 'REUNION_REALIZADA', 'PROPUESTA_ENVIADA', 'CERRADO_GANADO')
    union
    select id from public.leads
      where status in ('REUNION_AGENDADA', 'REUNION_REALIZADA', 'PROPUESTA_ENVIADA', 'CERRADO_GANADO')
  ),
  reached_won as (
    select lead_id from public.lead_activities
      where type = 'CAMBIO_ESTADO' and to_status = 'CERRADO_GANADO'
    union
    select id from public.leads where status = 'CERRADO_GANADO'
  ),
  past_appointments as (
    select lead_id, status
    from public.appointments
    where lead_id is not null
      and starts_at >= p_from and starts_at < least(p_to, now())
  ),
  held as (
    select distinct lead_id from past_appointments where status = 'REALIZADA'
    union
    select lead_id from public.lead_activities
      where type = 'CAMBIO_ESTADO' and to_status = 'REUNION_REALIZADA'
        and occurred_at >= p_from and occurred_at < p_to
  )
  select
    (select count(*) from contacted),
    (select count(distinct m.lead_id) from public.lead_messages m
      join contacted c on c.lead_id = m.lead_id
      where m.sender = 'LEAD' and (m.analysis -> 'analysis' ->> 'response_type') = 'HUMANA'),
    (select count(*) from cohort),
    (select count(*) from cohort c where c.lead_id in (select lead_id from reached_meeting)),
    (select count(*) from past_appointments where status = 'REALIZADA'),
    (select count(*) from past_appointments where status = 'NO_ASISTIO'),
    (select count(*) from held),
    (select count(*) from held h where h.lead_id in (select lead_id from reached_won)),
    (select count(distinct lead_id) from public.lead_activities
      where type = 'CAMBIO_ESTADO' and to_status = 'CERRADO_GANADO'
        and occurred_at >= p_from and occurred_at < p_to);
$$;
