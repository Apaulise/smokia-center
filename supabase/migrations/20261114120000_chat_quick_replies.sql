-- §1.26 sub-paso 2 — Respuestas rápidas del inbox (Plans/01-chats-seguimiento-y-workflows.md)
--
-- Textos y audios guardados que se mandan con un toque desde el compositor de
-- Chats. Son de cada usuario: el socio tiene las suyas (no se comparten por
-- equipo, a diferencia del inbox).
--
-- Los audios viven en el bucket PRIVADO `chat-audio`, en `<owner_id>/<uuid>.<ext>`.
-- Para mandarlos, el servidor firma una URL que vence en una hora y se la pasa
-- a Zernio, que la descarga y la entrega a Instagram. Nada queda público.

-- ── chat_quick_replies ─────────────────────────────────────────────────────

create table if not exists public.chat_quick_replies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('TEXTO', 'AUDIO')),
  title text not null check (char_length(title) between 1 and 60),
  -- Texto: el mensaje (admite {{nombre}}). Audio: una nota opcional.
  body text check (body is null or char_length(body) <= 1000),
  audio_path text,
  audio_mime text,
  audio_duration_ms integer check (audio_duration_ms is null or audio_duration_ms between 0 and 600000),
  sort_order integer not null default 0,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un texto tiene cuerpo; un audio tiene archivo.
  constraint chat_quick_replies_content check (
    (kind = 'TEXTO' and body is not null and audio_path is null)
    or (kind = 'AUDIO' and audio_path is not null)
  ),
  -- El archivo tiene que estar en la carpeta del dueño (la política de Storage dice lo mismo).
  constraint chat_quick_replies_audio_folder check (audio_path is null or audio_path like owner_id::text || '/%')
);

create index if not exists chat_quick_replies_owner_idx on public.chat_quick_replies (owner_id);
create index if not exists chat_quick_replies_owner_order_idx on public.chat_quick_replies (owner_id, sort_order);

drop trigger if exists chat_quick_replies_set_updated_at on public.chat_quick_replies;
create trigger chat_quick_replies_set_updated_at before update on public.chat_quick_replies
  for each row execute function public.set_updated_at();

-- ── RLS (CLAUDE.md §10) ────────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['chat_quick_replies']
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

-- ── Storage: bucket privado de audios ──────────────────────────────────────
-- 8 MB, sólo formatos que Instagram acepta como audio. Cada usuario lee y
-- escribe únicamente su carpeta (la primera parte de la ruta es su uid).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-audio',
  'chat-audio',
  false,
  8388608,
  array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_audio_owner_select on storage.objects;
create policy chat_audio_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_audio_owner_insert on storage.objects;
create policy chat_audio_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_audio_owner_update on storage.objects;
create policy chat_audio_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_audio_owner_delete on storage.objects;
create policy chat_audio_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
