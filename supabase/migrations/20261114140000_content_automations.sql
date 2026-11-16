-- §1.26 sub-paso 4 — Modelos TOFU/MOFU y automatización por pieza
-- (Plans/01-chats-seguimiento-y-workflows.md)
--
-- El embudo corre en Zernio como el PAR automatización de comentario +
-- workflow (el patrón de MANOS):
--   · la automatización de comentario lleva la palabra clave, el post, el
--     "seguime primero", el DM y un botón postback `zernio:workflow:<id>`;
--   · el workflow manda el recurso, hace el seguimiento y pone las etiquetas.
--
-- `chat_automation_templates`: qué par de la cuenta es el molde TOFU y cuál el
-- MOFU. `content_automations`: el par que SmokIA clonó para cada pieza.
-- `automation_runs`: las ejecuciones del workflow de cada pieza (webhooks
-- `workflow.run.*`), para medir qué pieza trae conversaciones.
--
-- Todo es del dueño de la cuenta (las automatizaciones las crea su API key):
-- no hay políticas de equipo.

create table if not exists public.chat_automation_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  stage text not null check (stage in ('TOFU', 'MOFU')),
  zernio_comment_automation_id text not null,
  -- El workflow al que apunta el botón postback del molde (null si el molde no tiene).
  zernio_workflow_id text,
  name text not null,
  -- Las etiquetas que pone el workflow del molde (sus nodos add_tag), para mostrarlas.
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel_account_id, stage)
);

create index if not exists chat_automation_templates_owner_idx on public.chat_automation_templates (owner_id);
create index if not exists chat_automation_templates_account_idx on public.chat_automation_templates (channel_account_id);

create table if not exists public.content_automations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  template_id uuid references public.chat_automation_templates (id) on delete set null,
  stage text not null check (stage in ('TOFU', 'MOFU')),
  platform_post_id text not null,
  post_caption text,
  permalink text,
  keywords text[] not null check (cardinality(keywords) between 1 and 10),
  resource_url text not null check (resource_url ~ '^https://'),
  resource_title text not null check (char_length(resource_title) between 1 and 80),
  zernio_comment_automation_id text,
  zernio_workflow_id text,
  status text not null default 'ACTIVA' check (status in ('ACTIVA', 'PAUSADA', 'ERROR')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una automatización por pieza: dos sobre el mismo post responderían dos veces.
  unique (owner_id, platform_post_id)
);

create index if not exists content_automations_owner_idx on public.content_automations (owner_id);
create index if not exists content_automations_account_idx on public.content_automations (channel_account_id);
create index if not exists content_automations_template_idx on public.content_automations (template_id);
create index if not exists content_automations_workflow_idx on public.content_automations (zernio_workflow_id)
  where zernio_workflow_id is not null;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  automation_id uuid not null references public.content_automations (id) on delete cascade,
  zernio_execution_id text not null,
  conversation_id uuid references public.conversations (id) on delete set null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Zernio reintenta los webhooks: la ejecución entra una sola vez.
  unique (owner_id, zernio_execution_id)
);

create index if not exists automation_runs_owner_idx on public.automation_runs (owner_id);
create index if not exists automation_runs_automation_idx on public.automation_runs (automation_id);
create index if not exists automation_runs_conversation_idx on public.automation_runs (conversation_id)
  where conversation_id is not null;

-- La pieza que trajo a cada persona ("Llegó por" en el panel del contacto).
alter table public.conversations
  add column if not exists source_automation_id uuid references public.content_automations (id) on delete set null;
create index if not exists conversations_source_automation_idx on public.conversations (source_automation_id)
  where source_automation_id is not null;

do $do$
declare
  target text;
begin
  foreach target in array array['chat_automation_templates', 'content_automations', 'automation_runs']
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      target, target
    );

    execute format('alter table public.%I enable row level security', target);

    execute format('drop policy if exists owner_select on public.%I', target);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
       using ((select auth.uid()) = owner_id)',
      target
    );

    execute format('drop policy if exists owner_insert on public.%I', target);
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
       with check ((select auth.uid()) = owner_id)',
      target
    );

    execute format('drop policy if exists owner_update on public.%I', target);
    execute format(
      'create policy owner_update on public.%I for update to authenticated
       using ((select auth.uid()) = owner_id)
       with check ((select auth.uid()) = owner_id)',
      target
    );

    execute format('drop policy if exists owner_delete on public.%I', target);
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
       using ((select auth.uid()) = owner_id)',
      target
    );
  end loop;
end;
$do$;
