-- ═══════════════════════════════════════════════════════════════════════════
-- Inbox omnicanal vía Zernio (Plans/01-inbox-omnicanal-zernio.md, §1.25)
--
-- Los mensajes de cada canal (hoy sólo Instagram) se espejan acá desde Zernio
-- y se leen por RLS como el resto de la app:
--
-- · channel_accounts: una cuenta conectada de Zernio (Instagram, y a futuro
--   WhatsApp / TikTok / Email). `zernio_account_id` es único: el webhook
--   resuelve el owner con esa columna, nunca con el body.
-- · channel_secrets: la API key de Zernio y el secreto del webhook, cifrados
--   (lib/crypto.ts). Tabla aparte para que un `select *` de la cuenta no los
--   arrastre a una pantalla por error.
-- · conversations / messages: el hilo. `messages` es idempotente por
--   (conversation_id, platform_message_id): el webhook y la sincronización
--   pueden pisarse sin duplicar nada.
--
-- Esta migración deja todo aislado por owner_id. Compartir el inbox con el
-- socio es opt-in y vive en 20261113130000_chats_team.sql: las columnas
-- `team_id` de acá quedan en null hasta que el dueño lo active.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- null = sólo del dueño. Lo pone el dueño al compartir (chats_team.sql).
  team_id uuid references public.teams (id) on delete set null,
  channel text not null check (channel in ('INSTAGRAM', 'WHATSAPP', 'TIKTOK', 'EMAIL')),
  zernio_account_id text not null,
  handle text,
  display_name text,
  login_method text,
  status text not null default 'ACTIVA' check (status in ('ACTIVA', 'ERROR', 'DESCONECTADA')),
  status_detail text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists channel_accounts_zernio_account_key
  on public.channel_accounts (zernio_account_id);
create index if not exists channel_accounts_owner_idx on public.channel_accounts (owner_id);
create index if not exists channel_accounts_team_idx on public.channel_accounts (team_id)
  where team_id is not null;

create table if not exists public.channel_secrets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  api_key_encrypted text not null,
  webhook_secret_encrypted text not null,
  -- Id del webhook en Zernio, para poder borrarlo al desconectar.
  webhook_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists channel_secrets_account_key
  on public.channel_secrets (channel_account_id);
create index if not exists channel_secrets_owner_idx on public.channel_secrets (owner_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  channel_account_id uuid not null references public.channel_accounts (id) on delete cascade,
  channel text not null check (channel in ('INSTAGRAM', 'WHATSAPP', 'TIKTOK', 'EMAIL')),
  -- `conversation.platformConversationId` del webhook = `id` del listado de Zernio.
  zernio_conversation_id text not null,
  participant_external_id text,
  participant_handle text,
  participant_name text,
  participant_picture text,
  lead_id uuid references public.leads (id) on delete set null,
  status text not null default 'ACTIVA' check (status in ('ACTIVA', 'ARCHIVADA')),
  last_message_at timestamptz,
  last_message_preview text,
  -- Último mensaje del cliente: de acá sale la ventana de 24 h / 7 días.
  last_inbound_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  -- 'app' = responde Zernio; 'other' = otra app (ManyChat, Instagram Inbox) es dueña del hilo.
  thread_owner text,
  -- instagramProfile: isFollower, isFollowing, followerCount, isVerified.
  participant_profile jsonb,
  -- Cuándo la sincronización trajo el historial de Zernio. Null = sólo hay lo
  -- que llegó por webhook desde que se conectó la cuenta.
  history_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists conversations_account_zernio_key
  on public.conversations (channel_account_id, zernio_conversation_id);
create index if not exists conversations_owner_idx on public.conversations (owner_id);
create index if not exists conversations_owner_recent_idx
  on public.conversations (owner_id, last_message_at desc nulls last);
create index if not exists conversations_team_recent_idx
  on public.conversations (team_id, last_message_at desc nulls last)
  where team_id is not null;
create index if not exists conversations_lead_idx on public.conversations (lead_id)
  where lead_id is not null;
create index if not exists conversations_handle_idx
  on public.conversations (owner_id, participant_handle)
  where participant_handle is not null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- `message.platformMessageId` del webhook = `id` de cada mensaje del listado.
  platform_message_id text not null,
  direction text not null check (direction in ('IN', 'OUT')),
  -- CLIENTE (entrante) · CRM (se mandó desde SmokIA) · APP (desde la app de
  -- Instagram) · ZERNIO (dashboard de Zernio) · AUTOMATIZACION (workflow,
  -- comment-to-DM, secuencia) · HISTORIAL (traído por la sincronización).
  origin text not null check (origin in ('CLIENTE', 'CRM', 'APP', 'ZERNIO', 'AUTOMATIZACION', 'HISTORIAL')),
  -- Quién lo escribió en el CRM. Sólo con origin = CRM.
  sent_by uuid references auth.users (id) on delete set null,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  delivery_status text check (delivery_status in ('sent', 'delivered', 'read', 'played', 'failed')),
  -- Llegó por la vía standby: otra app es dueña del hilo.
  standby boolean not null default false,
  edited boolean not null default false,
  deleted boolean not null default false,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists messages_conversation_platform_key
  on public.messages (conversation_id, platform_message_id);
create index if not exists messages_owner_idx on public.messages (owner_id);
create index if not exists messages_conversation_time_idx
  on public.messages (conversation_id, occurred_at);
create index if not exists messages_team_idx on public.messages (team_id)
  where team_id is not null;
create index if not exists messages_sent_by_idx on public.messages (sent_by)
  where sent_by is not null;

-- ── Triggers ───────────────────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['channel_accounts', 'channel_secrets', 'conversations', 'messages']
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      target, target
    );
  end loop;
end;
$do$;

-- El dueño de una fila no cambia nunca: con las políticas de equipo (migración
-- siguiente) un compañero puede editar una conversación ajena, y sin esto
-- podría reasignarla a su propio owner_id.
create or replace function public.chats_lock_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id no se puede cambiar';
  end if;
  return new;
end;
$$;

do $do$
declare
  target text;
begin
  foreach target in array array['channel_accounts', 'channel_secrets', 'conversations', 'messages']
  loop
    execute format('drop trigger if exists %I_lock_owner on public.%I', target, target);
    execute format(
      'create trigger %I_lock_owner before update on public.%I
       for each row execute function public.chats_lock_owner()',
      target, target
    );
  end loop;
end;
$do$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Las cuatro políticas, idénticas en las cuatro tablas (CLAUDE.md §10).

do $do$
declare
  target text;
begin
  foreach target in array array['channel_accounts', 'channel_secrets', 'conversations', 'messages']
  loop
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

-- ── Realtime ───────────────────────────────────────────────────────────────
-- La bandeja se suscribe a conversations y messages para que un mensaje nuevo
-- aparezca sin recargar. Realtime respeta RLS: cada usuario recibe sólo lo suyo.

do $do$
declare
  target text;
begin
  foreach target in array array['conversations', 'messages']
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
