-- ═══════════════════════════════════════════════════════════════════════════
-- Esquema del copiloto de prospección (Plan §1.9)
--
-- Cuatro tablas nuevas — lead_intel (1:1), lead_messages y lead_signals (N por
-- lead), sales_knowledge (global del usuario) — con owner_id, RLS y las
-- cuatro políticas de siempre. Sumar sus nombres al array del loop es todo lo
-- que hace falta (CLAUDE.md §10).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────────────

create type lead_message_sender as enum ('VENDEDOR', 'LEAD');

-- Sólo tiene sentido en mensajes del VENDEDOR: uno del LEAD siempre lo escribió el lead.
create type lead_message_generator as enum ('IA', 'HUMANO');

-- Los nueve ángulos comerciales (Plan §1.7, tabla "Reparto de modelos" / SPA §7).
create type lead_sales_angle as enum (
  'FOLLOWUP', 'BOOKING', 'NOSHOW', 'REBOOKING', 'REACTIVATION',
  'RESPONSE_TIME', 'OPERATIONS', 'CRM', 'REVIEWS'
);

create type lead_signal_kind as enum ('DOLOR', 'OBJECION', 'SENAL_COMPRA');

-- HIPOTESIS: el enriquecimiento lo propuso. SOSPECHADO: el lead dijo algo
-- compatible. CONFIRMADO: hay una cita textual (Plan §1.13).
create type lead_signal_status as enum ('HIPOTESIS', 'SOSPECHADO', 'CONFIRMADO');

create type lead_next_action as enum (
  'ASK_QUESTION', 'EXPLAIN_SERVICE', 'ASK_FOR_MEETING', 'SEND_INFORMATION',
  'FOLLOW_UP', 'WAIT', 'DISQUALIFY', 'CLOSE_LEAD'
);

-- Copia de brand_knowledge_origin (Plan §1.9): PROPIO/MERCADO/HIPOTESIS es la
-- misma decisión de diseño, pero en un enum propio — leads y marca son módulos
-- independientes (CLAUDE.md §2) y no deberían compartir un tipo de Postgres.
create type lead_knowledge_origin as enum ('PROPIO', 'MERCADO', 'HIPOTESIS');

-- Las seis colecciones de la memoria global de ventas (Plan §1.18).
create type lead_knowledge_collection as enum (
  'OBJECIONES', 'DOLORES', 'ANGULOS', 'SEGMENTOS', 'MENSAJES', 'APRENDIZAJES'
);

-- ── leads: dos columnas nuevas ───────────────────────────────────────────────
-- Van en `leads` y no en `lead_intel` para que la tabla y el Kanban puedan
-- ordenar y filtrar sin join (Plan §1.9). `next_action_at`, que ya existe,
-- pasa a ser también la follow_up_date del SPA §18: no hace falta otra columna.

alter table public.leads add column interest_level smallint check (interest_level between 0 and 10);
alter table public.leads add column sales_angle lead_sales_angle;

-- ── lead_intel (1:1 con leads) ───────────────────────────────────────────────
-- Enriquecimiento (SPA §4), memoria del lead (SPA §25) y próxima acción (SPA §13).

create table public.lead_intel (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- business_summary, detected_services, possible_decision_maker,
  -- operation_signals, technology_signals, possible_pains,
  -- recommended_sales_angle, confidence (§1.10).
  enrichment jsonb,
  -- business_context, current_process, pain_points, objections,
  -- buying_signals, tools_used, key_quotes, timing, next_action (§1.14).
  memory jsonb,
  next_best_action lead_next_action,
  next_best_action_reason text,
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

-- ── lead_messages (N por lead) ───────────────────────────────────────────────
-- La conversación (SPA §7). `angle` y `variant` desde el día 1 (§1.9): agregarlas
-- después impediría comparar nada de lo ya mandado (§1.19).

create table public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  sender lead_message_sender not null,
  channel message_channel not null default 'WHATSAPP',
  content text not null,
  -- Sólo se usa en mensajes del VENDEDOR generados por IA (§1.11); un mensaje del LEAD nunca lo lleva.
  generated_by lead_message_generator,
  angle lead_sales_angle,
  variant smallint,
  -- Sólo en mensajes del LEAD: la salida completa de analyzeLeadResponse() (§1.12).
  analysis jsonb,
  -- Un mensaje generado por IA no se marca enviado hasta que el usuario confirma (§1.11, SPA §24).
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint lead_messages_generator_only_ai_vendedor
    check (generated_by is null or sender = 'VENDEDOR')
);

-- ── lead_signals (N por lead) ────────────────────────────────────────────────
-- Ciclo de vida de dolores, objeciones y señales de compra (§1.13). La
-- exigencia de evidencia para llegar a CONFIRMADO se valida en TypeScript, no
-- acá: el modelo no tiene forma de saltearla porque el chequeo vive en el código.

create table public.lead_signals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind lead_signal_kind not null,
  status lead_signal_status not null default 'HIPOTESIS',
  title text not null,
  description text,
  -- La cita textual que sube el status a CONFIRMADO.
  evidence text,
  business_impact text,
  trigger_event text,
  timing text,
  -- "Ya lo tienen resuelto" (§1.13): saber qué NO es un dolor vale tanto como saber qué sí.
  already_solved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── sales_knowledge (global del usuario) ────────────────────────────────────
-- Memoria global de ventas (§1.18), calco de brand_knowledge: origin
-- obligatorio, search como columna generada (PostgREST filtra por columnas,
-- no por expresiones), sin herramienta de borrado para el modelo.

create table public.sales_knowledge (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  collection lead_knowledge_collection not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  origin lead_knowledge_origin not null,
  tags text[] not null default '{}',
  -- Trazabilidad, no ownership: borrar el lead no debe borrar lo que se aprendió de él.
  lead_id uuid references public.leads (id) on delete set null,
  search tsvector generated always as (
    to_tsvector('public.spanish_unaccent', title || ' ' || coalesce(body, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index leads_owner_interest_idx on public.leads (owner_id, interest_level);
create index leads_owner_angle_idx on public.leads (owner_id, sales_angle);

create index lead_intel_owner_idx on public.lead_intel (owner_id);
create index lead_intel_lead_idx on public.lead_intel (lead_id);

create index lead_messages_owner_idx on public.lead_messages (owner_id);
create index lead_messages_lead_idx on public.lead_messages (owner_id, lead_id, occurred_at);
create index lead_messages_angle_idx on public.lead_messages (owner_id, angle, variant) where angle is not null;

create index lead_signals_owner_idx on public.lead_signals (owner_id);
create index lead_signals_lead_idx on public.lead_signals (owner_id, lead_id);
create index lead_signals_status_idx on public.lead_signals (owner_id, status);

create index sales_knowledge_owner_idx on public.sales_knowledge (owner_id);
create index sales_knowledge_owner_collection_idx on public.sales_knowledge (owner_id, collection);
create index sales_knowledge_lead_idx on public.sales_knowledge (lead_id) where lead_id is not null;
create index sales_knowledge_search_idx on public.sales_knowledge using gin (search);

-- ── Triggers de updated_at ─────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['lead_intel', 'lead_signals', 'sales_knowledge']
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      target, target
    );
  end loop;
end;
$do$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mismo loop que la migración inicial (CLAUDE.md §10): sumar el nombre de la
-- tabla nueva al array es todo lo que hace falta para que quede con las
-- cuatro políticas idénticas al resto.

do $do$
declare
  target text;
begin
  foreach target in array array['lead_intel', 'lead_messages', 'lead_signals', 'sales_knowledge']
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
