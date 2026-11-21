-- §1.26 — Respuestas rápidas: documentos e imágenes
-- (Plans/01-chats-seguimiento-y-workflows.md, ajuste del 2026-11-16)
--
-- Las respuestas rápidas pasan a tener tres secciones: textos, audios y
-- documentos/imágenes. La tercera es un tipo nuevo, `ARCHIVO`: una imagen
-- (png, jpeg, gif — hasta 8 MB) o un PDF (hasta 25 MB), que son los formatos y
-- tamaños que Instagram acepta por mensaje directo. Como los audios, viven en
-- un bucket PRIVADO (`chat-files`), en `<owner_id>/<uuid>.<ext>`: para mandarlos
-- el servidor firma una URL de una hora y se la pasa a Zernio.
--
-- Sólo agrega: columnas nuevas (nulas en las filas que ya existen) y los checks
-- se reemplazan por otros que las filas actuales ya cumplen. No borra nada.

alter table public.chat_quick_replies
  add column if not exists file_path text,
  add column if not exists file_mime text,
  add column if not exists file_name text,
  add column if not exists file_size integer;

alter table public.chat_quick_replies drop constraint if exists chat_quick_replies_file_name_len;
alter table public.chat_quick_replies add constraint chat_quick_replies_file_name_len
  check (file_name is null or char_length(file_name) <= 120);

alter table public.chat_quick_replies drop constraint if exists chat_quick_replies_file_size_range;
alter table public.chat_quick_replies add constraint chat_quick_replies_file_size_range
  check (file_size is null or file_size between 1 and 26214400);

-- `kind` suma ARCHIVO. El check original es el automático de la columna: se
-- busca por su definición (`kind = ANY (...)`) y no por el nombre, para no
-- depender de cómo lo bautizó Postgres. Si quedara uno viejo, ARCHIVO seguiría bloqueado.
do $do$
declare
  existing text;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'public.chat_quick_replies'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind = ANY%'
  loop
    execute format('alter table public.chat_quick_replies drop constraint %I', existing);
  end loop;
end;
$do$;
alter table public.chat_quick_replies add constraint chat_quick_replies_kind_check
  check (kind in ('TEXTO', 'AUDIO', 'ARCHIVO'));

-- Un texto tiene cuerpo; un audio tiene su audio; un archivo tiene su archivo. Nunca dos a la vez.
alter table public.chat_quick_replies drop constraint if exists chat_quick_replies_content;
alter table public.chat_quick_replies add constraint chat_quick_replies_content check (
  (kind = 'TEXTO' and body is not null and audio_path is null and file_path is null)
  or (kind = 'AUDIO' and audio_path is not null and file_path is null)
  or (kind = 'ARCHIVO' and file_path is not null and file_mime is not null and audio_path is null)
);

-- El archivo tiene que estar en la carpeta del dueño (la política de Storage dice lo mismo).
alter table public.chat_quick_replies drop constraint if exists chat_quick_replies_file_folder;
alter table public.chat_quick_replies add constraint chat_quick_replies_file_folder
  check (file_path is null or file_path like owner_id::text || '/%');

-- ── Storage: bucket privado de documentos e imágenes ───────────────────────
-- 25 MB (el tope de Instagram para un PDF; el de 8 MB de las imágenes lo valida
-- la app). Cada usuario lee y escribe únicamente su carpeta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  26214400,
  array['image/png', 'image/jpeg', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_files_owner_select on storage.objects;
create policy chat_files_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_files_owner_insert on storage.objects;
create policy chat_files_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_files_owner_update on storage.objects;
create policy chat_files_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists chat_files_owner_delete on storage.objects;
create policy chat_files_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
