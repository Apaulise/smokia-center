-- ═══════════════════════════════════════════════════════════════════════════
-- La base de conocimiento (Plans/03 §3.12, SOC §26)
--
-- Nueve colecciones —WINNERS, LOSERS, HOOKS, FORMATOS, TEMAS, AUDIENCIA,
-- RADAR, EXPERIMENTOS, APRENDIZAJES— en UNA tabla. Las nueve tienen la misma
-- forma (una nota con campos flexibles, de un usuario, buscable por texto);
-- nueve tablas serían nueve migraciones, nueve juegos de políticas y nueve
-- tools. `data` absorbe lo que cada colección tiene de propio, igual que
-- brand_posts.raw.
--
-- `origin` es obligatorio a propósito: el modelo escribe acá, y una
-- conclusión apresurada guardada hoy se lee en tres semanas como un hecho.
-- Con el origen a la vista (SOC §18: una nota de mercado no pesa como una
-- métrica propia) esa diferencia sobrevive a la conversación.
--
-- `search` es una columna generada y no un índice sobre la expresión que
-- sugería el plan: PostgREST filtra por columnas, no por expresiones, así
-- que un GIN sobre to_tsvector(...) suelto no lo puede usar nadie desde
-- supabase-js. Misma idea, mismo índice, pero alcanzable con .textSearch().
-- ═══════════════════════════════════════════════════════════════════════════

create type brand_knowledge_collection as enum (
  'WINNERS', 'LOSERS', 'HOOKS', 'FORMATOS', 'TEMAS',
  'AUDIENCIA', 'RADAR', 'EXPERIMENTOS', 'APRENDIZAJES'
);

-- PROPIO: sale de métricas de Agus. MERCADO: se vio afuera. HIPOTESIS: todavía no se probó.
create type brand_knowledge_origin as enum ('PROPIO', 'MERCADO', 'HIPOTESIS');

create type brand_knowledge_status as enum ('PENDIENTE', 'ACTIVO', 'CONCLUIDO');

create table public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  collection brand_knowledge_collection not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  origin brand_knowledge_origin not null,
  -- Sólo tiene sentido en EXPERIMENTOS, y ahí es obligatorio.
  status brand_knowledge_status,
  -- El vínculo con la pieza propia, cuando existe. Es trazabilidad, no
  -- ownership: borrar la pieza no debe borrar lo que se aprendió de ella.
  post_id uuid references public.brand_posts (id) on delete set null,
  content_item_id uuid references public.brand_content_items (id) on delete set null,
  tags text[] not null default '{}',
  search tsvector generated always as (
    to_tsvector('spanish', title || ' ' || coalesce(body, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_knowledge_status_only_experiments
    check ((collection = 'EXPERIMENTOS') = (status is not null))
);

-- ── Índices ────────────────────────────────────────────────────────────────

create index brand_knowledge_owner_idx on public.brand_knowledge (owner_id);
create index brand_knowledge_owner_collection_idx on public.brand_knowledge (owner_id, collection);
create index brand_knowledge_owner_status_idx on public.brand_knowledge (owner_id, status) where status is not null;
create index brand_knowledge_post_idx on public.brand_knowledge (post_id) where post_id is not null;
create index brand_knowledge_content_item_idx on public.brand_knowledge (content_item_id) where content_item_id is not null;
create index brand_knowledge_search_idx on public.brand_knowledge using gin (search);

-- ── Trigger de updated_at ──────────────────────────────────────────────────

create trigger brand_knowledge_set_updated_at before update on public.brand_knowledge
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────

do $do$
declare
  target text;
begin
  foreach target in array array['brand_knowledge']
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
