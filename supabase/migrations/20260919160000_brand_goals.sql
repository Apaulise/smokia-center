-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo de seguidores y publicación manual (Plans/03 §3.13)
--
-- brand_goals guarda la meta de seguidores. Tres cosas que el esquema fuerza
-- en vez de dejarlas al código:
--
-- · UNA sola meta activa por plataforma (índice único parcial). Redefinir la
--   meta archiva la anterior, y `brand_define_goal` hace las dos cosas en una
--   transacción: con dos llamadas separadas, un fallo entre ellas dejaría al
--   usuario sin meta activa.
-- · Una pieza por post: un índice único parcial sobre brand_content_items.post_id.
--   Un empalme equivocado le pone a una hipótesis las métricas de otra pieza, y
--   sin esto dos piezas podrían apuntar al mismo post.
-- · Una sola sincronización EN_CURSO por cuenta: el "candado" que hace que dos
--   pestañas abiertas a la vez no disparen dos corridas contra Windsor.
--
-- `baseline_followers` y `baseline_date` son la foto al momento de definir la
-- meta (fecha UTC, igual que `captured_on`): el avance se mide contra lo que
-- había, no contra cero.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.brand_goal_status as enum ('ACTIVA', 'CUMPLIDA', 'ARCHIVADA');

create table public.brand_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  target_followers integer not null check (target_followers > 0),
  baseline_followers integer not null check (baseline_followers >= 0),
  baseline_date date not null,
  -- Opcional. Sin plazo no hay "ritmo necesario", sólo el real y la proyección.
  -- Que sea futura se valida al definirla (en horario de Argentina), no acá:
  -- baseline_date es UTC y un check entre las dos fallaría de noche.
  deadline date,
  status public.brand_goal_status not null default 'ACTIVA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_goals_target_above_baseline check (target_followers > baseline_followers)
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index brand_goals_owner_idx on public.brand_goals (owner_id);
create index brand_goals_owner_platform_idx on public.brand_goals (owner_id, platform);
create unique index brand_goals_one_active_idx
  on public.brand_goals (owner_id, platform)
  where status = 'ACTIVA';

-- Las corridas que quedaron "en curso" de verdad (el proceso murió a la mitad)
-- se cierran antes de crear el índice único, que si no rebotaría por ellas.
update public.brand_sync_jobs
   set status = 'FALLIDO',
       error = coalesce(error, 'Interrumpida: quedó en curso sin terminar.'),
       finished_at = coalesce(finished_at, now())
 where status = 'EN_CURSO'
   and coalesce(started_at, created_at) < now() - interval '10 minutes';

create unique index brand_sync_jobs_one_running_idx
  on public.brand_sync_jobs (owner_id, platform)
  where status = 'EN_CURSO';

-- El índice único cubre la misma columna que el común que había desde §3.7.
drop index if exists public.brand_content_items_post_idx;
create unique index brand_content_items_post_unique_idx
  on public.brand_content_items (post_id)
  where post_id is not null;

-- ── Trigger de updated_at ──────────────────────────────────────────────────

create trigger brand_goals_set_updated_at before update on public.brand_goals
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['brand_goals']
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

-- ── Redefinir la meta ──────────────────────────────────────────────────────
-- SECURITY INVOKER (el default): corre con la sesión del usuario, así que RLS
-- filtra y el WITH CHECK impide escribir un owner_id ajeno. Archivar la activa
-- y crear la nueva pasa en una sola transacción.

create or replace function public.brand_define_goal(
  p_platform brand_platform,
  p_target integer,
  p_baseline integer,
  p_baseline_date date,
  p_deadline date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.brand_goals
     set status = 'ARCHIVADA'
   where owner_id = (select auth.uid())
     and platform = p_platform
     and status = 'ACTIVA';

  insert into public.brand_goals (owner_id, platform, target_followers, baseline_followers, baseline_date, deadline)
  values ((select auth.uid()), p_platform, p_target, p_baseline, p_baseline_date, p_deadline)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.brand_define_goal(brand_platform, integer, integer, date, date) from public, anon;
grant execute on function public.brand_define_goal(brand_platform, integer, integer, date, date) to authenticated;
