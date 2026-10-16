-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo y dashboard de equipo (Plan §1.23)
--
-- Los dos socios operan como un solo negocio: una meta en común y métricas
-- globales, pero cada uno conserva sus leads aislados por RLS. Esta migración
-- agrega la capa de equipo SIN aflojar el aislamiento de las tablas de leads:
--
-- · teams / team_members: quién es del equipo. La membresía se siembra a mano
--   una vez (SETUP.md): no hay políticas de escritura, así que la app no puede
--   tocarla. team_members sólo deja leer la propia fila.
-- · team_goals: la meta compartida. Es la única tabla con RLS por equipo y no
--   por owner_id (owner_id = quién la definió).
-- · team_*: funciones SECURITY DEFINER, las primeras del repo y la segunda
--   excepción al aislamiento (CLAUDE.md §4). Cruzan owners, pero SÓLO devuelven
--   conteos agregados de un miembro del equipo del que llama — nunca filas de
--   leads, mensajes ni notas — y su primera condición es team_can_see().
--
-- Las funciones personales (leads_execution_metrics, etc.) no se tocan: las de
-- equipo son una copia con filtro explícito por owner. Se verifican por
-- equivalencia contra las originales (Plans/01 §1.23).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Equipo y membresía ─────────────────────────────────────────────────────

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  -- Quién lo creó; no da ningún permiso especial.
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'SmokIA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teams_owner_idx on public.teams (owner_id);

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  -- El miembro. Un usuario pertenece a un solo equipo.
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists team_members_owner_key on public.team_members (owner_id);
create index if not exists team_members_team_idx on public.team_members (team_id);

-- ── Meta compartida ────────────────────────────────────────────────────────

create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Quién la definió (autor). La puede editar cualquiera del equipo.
  owner_id uuid not null references auth.users (id) on delete cascade,
  monthly_revenue_target numeric(12, 2) not null check (monthly_revenue_target > 0),
  avg_ticket numeric(12, 2) not null check (avg_ticket > 0),
  currency text not null default 'USD',
  booking_rate numeric(5, 4) not null check (booking_rate > 0 and booking_rate <= 1),
  show_rate numeric(5, 4) not null check (show_rate > 0 and show_rate <= 1),
  close_rate numeric(5, 4) not null check (close_rate > 0 and close_rate <= 1),
  working_days_per_month smallint not null check (working_days_per_month between 1 and 31),
  working_days_per_week smallint not null check (working_days_per_week between 1 and 7),
  status public.sales_goal_status not null default 'ACTIVA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_goals_owner_idx on public.team_goals (owner_id);
create index if not exists team_goals_team_idx on public.team_goals (team_id);
-- Una sola meta activa por equipo.
create unique index if not exists team_goals_one_active_idx
  on public.team_goals (team_id)
  where status = 'ACTIVA';

drop trigger if exists team_goals_set_updated_at on public.team_goals;
create trigger team_goals_set_updated_at before update on public.team_goals
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- team_members: sólo la propia fila (sin recursión: es lo que consultan las
-- demás políticas). teams y team_goals: por pertenencia al equipo.
-- Sin políticas de escritura en teams ni team_members, y sin delete en
-- team_goals (el historial de metas se conserva): default correcto, inaccesible.

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_goals enable row level security;

drop policy if exists owner_select on public.team_members;
create policy owner_select on public.team_members for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists member_select on public.teams;
create policy member_select on public.teams for select to authenticated
  using (id = (select team_id from public.team_members where owner_id = (select auth.uid())));

drop policy if exists member_select on public.team_goals;
create policy member_select on public.team_goals for select to authenticated
  using (team_id = (select team_id from public.team_members where owner_id = (select auth.uid())));

drop policy if exists member_insert on public.team_goals;
create policy member_insert on public.team_goals for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))
  );

drop policy if exists member_update on public.team_goals;
create policy member_update on public.team_goals for update to authenticated
  using (team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  with check (team_id = (select team_id from public.team_members where owner_id = (select auth.uid())));

-- ── Redefinir la meta del equipo ───────────────────────────────────────────
-- SECURITY INVOKER: RLS decide quién puede archivar e insertar.

create or replace function public.team_define_goal(
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
  v_team uuid;
  v_id uuid;
begin
  select team_id into v_team
    from public.team_members
   where owner_id = (select auth.uid());

  if v_team is null then
    raise exception 'El usuario no pertenece a ningún equipo';
  end if;

  update public.team_goals
     set status = 'ARCHIVADA'
   where team_id = v_team
     and status = 'ACTIVA';

  insert into public.team_goals (
    team_id, owner_id, monthly_revenue_target, avg_ticket, booking_rate, show_rate, close_rate,
    working_days_per_month, working_days_per_week
  )
  values (
    v_team, (select auth.uid()), p_revenue, p_ticket, p_booking_rate, p_show_rate, p_close_rate,
    p_days_per_month, p_days_per_week
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.team_define_goal(numeric, numeric, numeric, numeric, numeric, smallint, smallint) from public, anon;
grant execute on function public.team_define_goal(numeric, numeric, numeric, numeric, numeric, smallint, smallint) to authenticated;

-- ── Lectura cruzada (SECURITY DEFINER) ─────────────────────────────────────
-- Cualquier cambio de acá para abajo se revisa a mano (CLAUDE.md §4).

-- ¿El que llama y p_owner son del mismo equipo? Es la primera condición de todas
-- las funciones de abajo. Sólo la llaman ellas: nadie más tiene EXECUTE.
create or replace function public.team_can_see(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members me
    join public.team_members them on them.team_id = me.team_id
    where me.owner_id = (select auth.uid())
      and them.owner_id = p_owner
  );
$$;

revoke all on function public.team_can_see(uuid) from public, anon, authenticated;

-- Los miembros del equipo del que llama: id, nombre para mostrar y avatar.
-- Mismo criterio de nombre que lib/profile/queries.ts (alias, o la parte local
-- del mail). Es lo único que sale de auth.users, y sólo de compañeros de equipo.
create or replace function public.team_directory()
returns table (
  owner_id uuid,
  name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.owner_id,
    coalesce(p.alias, split_part(u.email, '@', 1), 'Cuenta') as name,
    p.avatar_url
  from public.team_members m
  join auth.users u on u.id = m.owner_id
  left join public.profiles p on p.owner_id = m.owner_id
  where m.team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))
  order by m.created_at, m.owner_id;
$$;

revoke all on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;

-- Copia de leads_execution_metrics (20260930130000) para un owner del equipo.
create or replace function public.team_execution_metrics(
  p_owner uuid,
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
security definer
set search_path = ''
as $$
  with first_contacts as (
    select lead_id, min(contacted_at) as first_contact_at
    from (
      select lead_id, occurred_at as contacted_at
      from public.lead_messages
      where owner_id = p_owner and sender = 'VENDEDOR' and confirmed
      union all
      select lead_id, occurred_at
      from public.lead_activities
      where owner_id = p_owner and type in ('WHATSAPP', 'EMAIL', 'LLAMADA')
      union all
      select lead_id, occurred_at
      from public.lead_activities
      where owner_id = p_owner
        and type = 'CAMBIO_ESTADO'
        and from_status in ('NUEVO', 'LISTO')
        and to_status not in ('NUEVO', 'LISTO', 'DESCARTADO')
    ) touches
    group by lead_id
  ),
  contacted as (
    select lead_id
    from first_contacts
    where first_contact_at >= p_from and first_contact_at < p_to
  ),
  cohort as (
    select lead_id
    from first_contacts
    where first_contact_at >= p_from - make_interval(days => p_booking_lag_days)
      and first_contact_at < least(p_to, now()) - make_interval(days => p_booking_lag_days)
  ),
  reached_meeting as (
    select lead_id from public.appointments where owner_id = p_owner and lead_id is not null
    union
    select lead_id from public.lead_activities
      where owner_id = p_owner
        and type = 'CAMBIO_ESTADO'
        and to_status in ('REUNION_AGENDADA', 'REUNION_REALIZADA', 'PROPUESTA_ENVIADA', 'CERRADO_GANADO')
    union
    select id from public.leads
      where owner_id = p_owner
        and status in ('REUNION_AGENDADA', 'REUNION_REALIZADA', 'PROPUESTA_ENVIADA', 'CERRADO_GANADO')
  ),
  reached_won as (
    select lead_id from public.lead_activities
      where owner_id = p_owner and type = 'CAMBIO_ESTADO' and to_status = 'CERRADO_GANADO'
    union
    select id from public.leads where owner_id = p_owner and status = 'CERRADO_GANADO'
  ),
  past_appointments as (
    select lead_id, status
    from public.appointments
    where owner_id = p_owner
      and lead_id is not null
      and starts_at >= p_from and starts_at < least(p_to, now())
  ),
  held as (
    select distinct lead_id from past_appointments where status = 'REALIZADA'
    union
    select lead_id from public.lead_activities
      where owner_id = p_owner
        and type = 'CAMBIO_ESTADO' and to_status = 'REUNION_REALIZADA'
        and occurred_at >= p_from and occurred_at < p_to
  )
  select
    (select count(*) from contacted),
    (select count(distinct m.lead_id) from public.lead_messages m
      join contacted c on c.lead_id = m.lead_id
      where m.owner_id = p_owner
        and m.sender = 'LEAD' and (m.analysis -> 'analysis' ->> 'response_type') = 'HUMANA'),
    (select count(*) from cohort),
    (select count(*) from cohort c where c.lead_id in (select lead_id from reached_meeting)),
    (select count(*) from past_appointments where status = 'REALIZADA'),
    (select count(*) from past_appointments where status = 'NO_ASISTIO'),
    (select count(*) from held),
    (select count(*) from held h where h.lead_id in (select lead_id from reached_won)),
    (select count(distinct lead_id) from public.lead_activities
      where owner_id = p_owner
        and type = 'CAMBIO_ESTADO' and to_status = 'CERRADO_GANADO'
        and occurred_at >= p_from and occurred_at < p_to)
  where public.team_can_see(p_owner);
$$;

revoke all on function public.team_execution_metrics(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.team_execution_metrics(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Copia de leads_daily_contacts (20260930120000) para un owner del equipo.
-- Devuelve los primeros contactos y los seguimientos por separado: el total del
-- día lo suma el código, igual que getDailyContacts.
create or replace function public.team_daily_contacts(
  p_owner uuid,
  p_from date,
  p_to date,
  p_tz text default 'America/Argentina/Buenos_Aires'
)
returns table (
  day date,
  first_contacts bigint,
  followups bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with touched as (
    select lead_id, min(contacted_at) as first_contact_at
    from (
      select lead_id, occurred_at as contacted_at
      from public.lead_messages
      where owner_id = p_owner and sender = 'VENDEDOR' and confirmed
      union all
      select lead_id, occurred_at
      from public.lead_activities
      where owner_id = p_owner and type in ('WHATSAPP', 'EMAIL', 'LLAMADA')
      union all
      select lead_id, occurred_at
      from public.lead_activities
      where owner_id = p_owner
        and type = 'CAMBIO_ESTADO'
        and from_status in ('NUEVO', 'LISTO')
        and to_status not in ('NUEVO', 'LISTO', 'DESCARTADO')
    ) touches
    group by lead_id
  ),
  firsts as (
    select (first_contact_at at time zone p_tz)::date as day, count(*) as n
    from touched
    where first_contact_at >= (p_from::timestamp at time zone p_tz)
      and first_contact_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1
  ),
  follows as (
    select (occurred_at at time zone p_tz)::date as day, count(*) as n
    from public.lead_messages
    where owner_id = p_owner
      and sender = 'VENDEDOR' and kind = 'SEGUIMIENTO' and confirmed
      and occurred_at >= (p_from::timestamp at time zone p_tz)
      and occurred_at < ((p_to + 1)::timestamp at time zone p_tz)
    group by 1
  )
  select
    d::date as day,
    coalesce(f.n, 0) as first_contacts,
    coalesce(s.n, 0) as followups
  from generate_series(p_from, p_to, interval '1 day') as d
  left join firsts f on f.day = d::date
  left join follows s on s.day = d::date
  where public.team_can_see(p_owner)
  order by d;
$$;

revoke all on function public.team_daily_contacts(uuid, date, date, text) from public, anon;
grant execute on function public.team_daily_contacts(uuid, date, date, text) to authenticated;

-- Copia de leads_prospecting_funnel (20260926160000) para un owner del equipo.
create or replace function public.team_prospecting_funnel(p_owner uuid)
returns table (
  total_leads bigint,
  contacts_sent bigint,
  human_responses bigint,
  qualified bigint,
  interested bigint,
  meetings bigint,
  won bigint,
  total_responses bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.leads where owner_id = p_owner),
    (select count(distinct lead_id) from public.lead_messages
      where owner_id = p_owner and sender = 'VENDEDOR'),
    (select count(distinct lead_id) from public.lead_messages
      where owner_id = p_owner
        and sender = 'LEAD' and (analysis -> 'analysis' ->> 'response_type') = 'HUMANA'),
    (select count(*) from public.leads
      where owner_id = p_owner
        and status in ('CALIFICADO','INTERESADO','REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')),
    (select count(*) from public.leads
      where owner_id = p_owner
        and status in ('INTERESADO','REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')),
    (select count(*) from public.leads
      where owner_id = p_owner
        and status in ('REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')),
    (select count(*) from public.leads where owner_id = p_owner and status = 'CERRADO_GANADO'),
    (select count(distinct lead_id) from public.lead_messages
      where owner_id = p_owner and sender = 'LEAD')
  where public.team_can_see(p_owner);
$$;

revoke all on function public.team_prospecting_funnel(uuid) from public, anon;
grant execute on function public.team_prospecting_funnel(uuid) to authenticated;
