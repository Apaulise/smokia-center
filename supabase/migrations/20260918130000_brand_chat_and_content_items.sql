-- ═══════════════════════════════════════════════════════════════════════════
-- Generación de contenido — el chat (Plans/03 §3.6)
--
-- brand_chat_threads/brand_chat_messages guardan la conversación completa.
-- El content de cada fila no es sólo texto: es un array de "wire turns" con
-- la forma exacta que espera la API de Anthropic (incluye bloques tool_use/
-- tool_result cuando el modelo usó una herramienta), para poder reenviar el
-- historial tal cual en el próximo mensaje sin reconstruirlo a mano.
--
-- status reusa job_status (igual que brand_sync_jobs): EN_CURSO mientras el
-- modelo todavía está respondiendo, COMPLETADO al terminar, FALLIDO si se
-- corta. La UI se suscribe por Realtime a esta tabla y ve el contenido crecer
-- en updates sucesivos — mismo patrón que brand_sync_jobs, pero acá quien
-- escribe es un after() de la propia Server Action, no un tercero (Windsor
-- es pull; esto es aún más nuestro).
--
-- brand_content_items nace acá con lo mínimo que pide "Guardar como idea"
-- (§3.6): plataforma, tipo, título, idea, guion, caption, hashtags. El resto
-- de las columnas del pipeline completo (scheduled_for, ruta de archivo,
-- brand_post_id) se suman en §3.7 cuando exista el planificador — mismo
-- criterio que brand_post_metrics.new_followers en la migración anterior.
-- ═══════════════════════════════════════════════════════════════════════════

create type brand_chat_role as enum ('USUARIO', 'ASISTENTE');

create type brand_content_status as enum ('IDEA', 'GUION', 'GRABADO', 'EDITADO', 'LISTO', 'PUBLICADO');

-- ── brand_chat_threads ────────────────────────────────────────────────────

create table public.brand_chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── brand_chat_messages ───────────────────────────────────────────────────

create table public.brand_chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.brand_chat_threads (id) on delete cascade,
  role brand_chat_role not null,
  status job_status not null default 'COMPLETADO',
  content jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── brand_content_items ───────────────────────────────────────────────────
-- source_thread_id es trazabilidad ("de qué charla salió esta idea"), no
-- ownership: on delete set null, borrar el hilo no debe borrar la idea.

create table public.brand_content_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform brand_platform not null,
  kind brand_post_kind not null,
  status brand_content_status not null default 'IDEA',
  title text not null,
  idea text,
  script text,
  caption text,
  hashtags text[] not null default '{}',
  source_thread_id uuid references public.brand_chat_threads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index brand_chat_threads_owner_idx on public.brand_chat_threads (owner_id);
create index brand_chat_messages_owner_idx on public.brand_chat_messages (owner_id);
create index brand_chat_messages_thread_idx on public.brand_chat_messages (owner_id, thread_id);
create index brand_content_items_owner_idx on public.brand_content_items (owner_id);
create index brand_content_items_owner_status_idx on public.brand_content_items (owner_id, status);

-- ── Triggers de updated_at ─────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['brand_chat_threads', 'brand_chat_messages', 'brand_content_items']
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

do $do$
declare
  target text;
begin
  foreach target in array array['brand_chat_threads', 'brand_chat_messages', 'brand_content_items']
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

-- ── Realtime ───────────────────────────────────────────────────────────────
-- La UI sigue el mensaje del asistente mientras se escribe (Plans/03 §3.6).

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brand_chat_messages'
  ) then
    alter publication supabase_realtime add table public.brand_chat_messages;
  end if;
end;
$do$;
