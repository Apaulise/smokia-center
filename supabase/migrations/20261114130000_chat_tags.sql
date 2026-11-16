-- §1.26 sub-paso 3 — Etiquetas de Zernio y seguimiento en el inbox
-- (Plans/01-chats-seguimiento-y-workflows.md)
--
-- Las etiquetas viven en Zernio (fuente de verdad: las ponen los workflows con
-- `add_tag`/`remove_tag`). Acá se espejan en `conversations.tags` para filtrar
-- y mostrar sin llamar a Zernio en cada pantalla. Entran por el webhook
-- (`contact.tag_added`/`contact.tag_removed`, tratado como señal: se vuelve a
-- pedir el contacto entero) y por la sincronización; las que se editan en
-- SmokIA se escriben primero en Zernio.
--
-- Columnas nuevas de `conversations`: las cubren las políticas que ya tiene la
-- tabla (dueño y, si la cuenta está compartida, el equipo: 20261113130000). No
-- se abre ninguna política nueva.

alter table public.conversations
  add column if not exists zernio_contact_id text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists tags_synced_at timestamptz,
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_note text check (follow_up_note is null or char_length(follow_up_note) <= 280);

-- Filtrar por etiqueta en la bandeja.
create index if not exists conversations_tags_idx on public.conversations using gin (tags);
-- "Seguimientos de hoy".
create index if not exists conversations_follow_up_idx on public.conversations (owner_id, follow_up_at)
  where follow_up_at is not null;
-- El webhook de etiquetas busca la conversación por contacto, dentro de la cuenta.
create index if not exists conversations_contact_idx on public.conversations (channel_account_id, zernio_contact_id)
  where zernio_contact_id is not null;
create index if not exists conversations_participant_idx on public.conversations (channel_account_id, participant_external_id)
  where participant_external_id is not null;

-- ── chat_tag_labels ────────────────────────────────────────────────────────
-- El catálogo: nombre lindo y etapa del embudo de cada etiqueta. Es de cada
-- usuario. Una etiqueta que no está acá se muestra con su texto.

create table if not exists public.chat_tag_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 64),
  label text check (label is null or char_length(label) <= 60),
  stage text check (stage is null or stage in ('TOFU', 'MOFU', 'BOFU')),
  description text check (description is null or char_length(description) <= 280),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, tag)
);

create index if not exists chat_tag_labels_owner_idx on public.chat_tag_labels (owner_id);

drop trigger if exists chat_tag_labels_set_updated_at on public.chat_tag_labels;
create trigger chat_tag_labels_set_updated_at before update on public.chat_tag_labels
  for each row execute function public.set_updated_at();

do $do$
declare
  target text;
begin
  foreach target in array array['chat_tag_labels']
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
