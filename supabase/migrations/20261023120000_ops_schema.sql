-- Gestor de Operaciones.
--
-- Mr. Pou y los agentes escriben el estado, los borradores y los hallazgos
-- del Auditor por /api/automation/ops (service role, owner explícito).
-- La UI sólo lee y, en la cola, cambia `decision`: no manda WhatsApp ni mail.
--
-- Las tres tablas son por owner, con el mismo molde de RLS que el resto
-- (CLAUDE.md §4 y §10). Reejecutable: enums con guarda, tablas IF NOT EXISTS,
-- políticas con DROP + CREATE.

do $do$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_area') then
    create type public.ops_area as enum (
      'prospeccion',
      'ventas',
      'instagram',
      'youtube',
      'operaciones',
      'auditor'
    );
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_estado') then
    create type public.ops_estado as enum ('hecho', 'pendiente', 'bloqueo');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_decision') then
    create type public.ops_decision as enum ('pending', 'approved', 'edited', 'skipped');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_improvement_status') then
    create type public.ops_improvement_status as enum ('abierta', 'aplicada', 'descartada');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_impact') then
    create type public.ops_impact as enum ('alto', 'medio', 'bajo');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'ops_channel') then
    create type public.ops_channel as enum ('whatsapp', 'email', 'instagram');
  end if;
end;
$do$;

create table if not exists public.ops_status (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  area public.ops_area not null,
  agent text not null,
  title text not null,
  detail text not null default '',
  estado public.ops_estado not null,
  needs_ok boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_status_external_id_len check (char_length(external_id) between 1 and 120),
  constraint ops_status_agent_len check (char_length(agent) between 1 and 80),
  constraint ops_status_title_len check (char_length(title) between 1 and 200),
  constraint ops_status_detail_len check (char_length(detail) <= 500),
  constraint ops_status_work_area check (
    area in (
      'prospeccion'::public.ops_area,
      'ventas'::public.ops_area,
      'instagram'::public.ops_area,
      'youtube'::public.ops_area
    )
  )
);

create unique index if not exists ops_status_owner_external_idx on public.ops_status (owner_id, external_id);
create index if not exists ops_status_owner_idx on public.ops_status (owner_id);
create index if not exists ops_status_owner_occurred_idx on public.ops_status (owner_id, occurred_at desc);
create index if not exists ops_status_owner_area_idx on public.ops_status (owner_id, area);

drop trigger if exists ops_status_set_updated_at on public.ops_status;
create trigger ops_status_set_updated_at before update on public.ops_status
  for each row execute function public.set_updated_at();

create table if not exists public.ops_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  lead_id uuid references public.leads (id) on delete set null,
  lead_name text not null,
  channel public.ops_channel not null default 'whatsapp',
  draft_body text not null,
  reason text not null default '',
  agent text not null,
  decision public.ops_decision not null default 'pending',
  final_body text,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  -- Cada aprobar / editar / saltar / reabrir queda acá, aunque después se deshaga.
  history jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_approvals_external_id_len check (char_length(external_id) between 1 and 120),
  constraint ops_approvals_lead_name_len check (char_length(lead_name) between 1 and 200),
  constraint ops_approvals_agent_len check (char_length(agent) between 1 and 80),
  constraint ops_approvals_reason_len check (char_length(reason) <= 500),
  constraint ops_approvals_draft_len check (char_length(draft_body) between 1 and 4000),
  constraint ops_approvals_final_len check (final_body is null or char_length(final_body) <= 4000)
);

create unique index if not exists ops_approvals_owner_external_idx on public.ops_approvals (owner_id, external_id);
create index if not exists ops_approvals_owner_idx on public.ops_approvals (owner_id);
create index if not exists ops_approvals_owner_occurred_idx on public.ops_approvals (owner_id, occurred_at desc);
create index if not exists ops_approvals_pending_idx on public.ops_approvals (owner_id) where decision = 'pending';
create index if not exists ops_approvals_lead_idx on public.ops_approvals (lead_id);

drop trigger if exists ops_approvals_set_updated_at on public.ops_approvals;
create trigger ops_approvals_set_updated_at before update on public.ops_approvals
  for each row execute function public.set_updated_at();

create table if not exists public.ops_improvements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  area public.ops_area not null,
  title text not null,
  body text not null,
  impact public.ops_impact not null,
  impact_score smallint,
  status public.ops_improvement_status not null default 'abierta',
  week_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_improvements_external_id_len check (char_length(external_id) between 1 and 120),
  constraint ops_improvements_title_len check (char_length(title) between 1 and 200),
  constraint ops_improvements_body_len check (char_length(body) between 1 and 2000),
  constraint ops_improvements_week_len check (week_label is null or char_length(week_label) <= 40),
  constraint ops_improvements_score_check check (impact_score is null or impact_score between 0 and 100)
);

create unique index if not exists ops_improvements_owner_external_idx on public.ops_improvements (owner_id, external_id);
create index if not exists ops_improvements_owner_idx on public.ops_improvements (owner_id);
create index if not exists ops_improvements_owner_created_idx on public.ops_improvements (owner_id, created_at desc);
create index if not exists ops_improvements_owner_status_idx on public.ops_improvements (owner_id, status);

drop trigger if exists ops_improvements_set_updated_at on public.ops_improvements;
create trigger ops_improvements_set_updated_at before update on public.ops_improvements
  for each row execute function public.set_updated_at();

do $do$
declare
  target text;
begin
  foreach target in array array['ops_status', 'ops_approvals', 'ops_improvements']
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

-- Realtime: la cola y el contador del sidebar se refrescan sin recargar.
-- REPLICA IDENTITY FULL para que el filtro por owner_id llegue también en UPDATE.
alter table public.ops_status replica identity full;
alter table public.ops_approvals replica identity full;
alter table public.ops_improvements replica identity full;

do $do$
declare
  target text;
begin
  foreach target in array array['ops_status', 'ops_approvals', 'ops_improvements']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end;
$do$;
