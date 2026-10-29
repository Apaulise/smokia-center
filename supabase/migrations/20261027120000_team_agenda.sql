-- Agenda compartida: lectura acotada a los miembros del mismo equipo.
-- No abre las políticas RLS de appointments/leads; la app sólo recibe las
-- columnas necesarias para dibujar el calendario. Notas y link de reunión
-- siguen siendo privados y sólo se devuelven para turnos propios.

create or replace function public.team_appointments(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_list boolean default false,
  p_limit integer default 500
)
returns table (
  id uuid,
  owner_id uuid,
  lead_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  meeting_url text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  lead_name text,
  lead_status public.lead_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.owner_id,
    a.lead_id,
    a.title,
    a.starts_at,
    a.ends_at,
    a.status,
    case when a.owner_id = (select auth.uid()) then a.meeting_url else null end,
    case when a.owner_id = (select auth.uid()) then a.notes else null end,
    a.created_at,
    a.updated_at,
    l.name,
    l.status
  from public.appointments a
  join public.team_members me
    on me.owner_id = (select auth.uid())
  join public.team_members teammate
    on teammate.team_id = me.team_id
   and teammate.owner_id = a.owner_id
  left join public.leads l
    on l.id = a.lead_id
   and l.owner_id = a.owner_id
  where
    (
      p_list
      and (a.starts_at >= now() or a.status in ('AGENDADA', 'CONFIRMADA'))
    )
    or
    (
      not p_list
      and (p_from is null or a.starts_at >= p_from)
      and (p_to is null or a.starts_at < p_to)
    )
  order by a.starts_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.team_appointments(timestamptz, timestamptz, boolean, integer) from public, anon;
grant execute on function public.team_appointments(timestamptz, timestamptz, boolean, integer) to authenticated;
