-- ═══════════════════════════════════════════════════════════════════════════
-- Cadena de ejecución (Plan §1.22, reabre §1.6)
--
-- sales_goals guarda el objetivo de facturación mensual y los supuestos de la
-- cadena (ticket, tasas de agenda / asistencia / cierre, días hábiles). Igual
-- que brand_goals (Plans/03 §3.13): UNA sola meta activa por usuario (índice
-- único parcial), y redefinirla archiva la anterior en una transacción, así
-- queda el historial para comparar meses.
--
-- Las tasas reales salen de tres funciones de agregados, todo en SQL y
-- SECURITY INVOKER como el resto: RLS filtra igual que en cualquier query.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.sales_goal_status as enum ('ACTIVA', 'ARCHIVADA');

create table public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  monthly_revenue_target numeric(12, 2) not null check (monthly_revenue_target > 0),
  -- A ojo hasta que exista el Gestor de Facturación (Fase 2): lib/leads/goals.ts.
  avg_ticket numeric(12, 2) not null check (avg_ticket > 0),
  currency text not null default 'USD',
  -- Fracciones (0.15 = 15 %). Las supuestas por el usuario; las observadas se
  -- calculan, no se guardan.
  booking_rate numeric(5, 4) not null check (booking_rate > 0 and booking_rate <= 1),
  show_rate numeric(5, 4) not null check (show_rate > 0 and show_rate <= 1),
  close_rate numeric(5, 4) not null check (close_rate > 0 and close_rate <= 1),
  working_days_per_month smallint not null check (working_days_per_month between 1 and 31),
  working_days_per_week smallint not null check (working_days_per_week between 1 and 7),
  status public.sales_goal_status not null default 'ACTIVA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_goals_owner_idx on public.sales_goals (owner_id);
create unique index sales_goals_one_active_idx
  on public.sales_goals (owner_id)
  where status = 'ACTIVA';

create trigger sales_goals_set_updated_at before update on public.sales_goals
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['sales_goals']
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

-- ── Redefinir el objetivo ──────────────────────────────────────────────────

create or replace function public.sales_define_goal(
  p_revenue numeric,
  p_ticket numeric,
  p_booking_rate numeric,
  p_show_rate numeric,
  p_close_rate numeric,
  p_days_per_month smallint,
  p_days_per_week smallint
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.sales_goals
     set status = 'ARCHIVADA'
   where owner_id = (select auth.uid())
     and status = 'ACTIVA';

  insert into public.sales_goals (
    owner_id, monthly_revenue_target, avg_ticket, booking_rate, show_rate, close_rate,
    working_days_per_month, working_days_per_week
  )
  values (
    (select auth.uid()), p_revenue, p_ticket, p_booking_rate, p_show_rate, p_close_rate,
    p_days_per_month, p_days_per_week
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.sales_define_goal(numeric, numeric, numeric, numeric, numeric, smallint, smallint) from public, anon;
grant execute on function public.sales_define_goal(numeric, numeric, numeric, numeric, numeric, smallint, smallint) to authenticated;

-- ── Primer contacto de cada lead ───────────────────────────────────────────
-- Un contacto de la cadena es el PRIMER toque saliente a un lead, venga de
-- donde venga: un mensaje confirmado del copiloto o manual (§1.11), una
-- actividad de WhatsApp / email / llamada (§1.3), o un cambio de estado que
-- lo saca de NUEVO/LISTO (alta manual en CONTACTADO de §1.21, cambios a mano).
-- security_invoker: la vista respeta el RLS de las tablas de abajo.

create or replace view public.lead_first_contacts
with (security_invoker = true)
as
select lead_id, min(contacted_at) as first_contact_at
from (
  select lead_id, occurred_at as contacted_at
  from public.lead_messages
  where sender = 'VENDEDOR' and confirmed
  union all
  select lead_id, occurred_at
  from public.lead_activities
  where type in ('WHATSAPP', 'EMAIL', 'LLAMADA')
  union all
  select lead_id, occurred_at
  from public.lead_activities
  where type = 'CAMBIO_ESTADO'
    and from_status in ('NUEVO', 'LISTO')
    and to_status not in ('NUEVO', 'LISTO', 'DESCARTADO')
) touches
group by lead_id;

grant select on public.lead_first_contacts to authenticated;

-- ── Métricas de la cadena en una ventana ───────────────────────────────────
-- Tres tasas, cada una como cohorte (numerador ⊆ denominador):
--
-- · agenda:     de los leads con 1er contacto en la ventana — sin los últimos
--               p_booking_lag_days, que todavía no tuvieron tiempo de agendar —
--               cuántos llegaron a una reunión (turno cargado, o estado de
--               reunión en adelante alguna vez).
-- · asistencia: turnos colgados de un lead, de la ventana y ya pasados:
--               REALIZADA / (REALIZADA + NO_ASISTIO). Los agendados sin marcar
--               no cuentan para ningún lado.
-- · cierre:     de los leads con reunión realizada en la ventana, cuántos
--               llegaron a CERRADO_GANADO.

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
    select lead_id, first_contact_at
    from public.lead_first_contacts
    where first_contact_at >= p_from and first_contact_at < p_to
  ),
  cohort as (
    select lead_id
    from contacted
    where first_contact_at < least(p_to, now() - make_interval(days => p_booking_lag_days))
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

-- ── Primeros contactos por día ─────────────────────────────────────────────
-- En la zona horaria del usuario: "hoy" es el día de Buenos Aires, no el UTC.

create or replace function public.leads_daily_contacts(
  p_from date,
  p_to date,
  p_tz text default 'America/Argentina/Buenos_Aires'
)
returns table (
  day date,
  contacts bigint
)
language sql
stable
set search_path = ''
as $$
  select
    d::date as day,
    coalesce(c.contacts, 0) as contacts
  from generate_series(p_from, p_to, interval '1 day') as d
  left join (
    select (first_contact_at at time zone p_tz)::date as day, count(*) as contacts
    from public.lead_first_contacts
    where first_contact_at >= (p_from::timestamp at time zone p_tz)
      and first_contact_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1
  ) c on c.day = d::date
  order by d;
$$;
