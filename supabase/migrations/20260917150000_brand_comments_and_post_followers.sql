-- ═══════════════════════════════════════════════════════════════════════════
-- Biblioteca de contenido (Plans/03 §3.4)
-- ═══════════════════════════════════════════════════════════════════════════

-- "Seguidores ganados" por pieza (media_follows en Windsor) — no estaba en el
-- corte inicial de §3.2, lo pide el orden de la biblioteca de contenido.
alter table public.brand_post_metrics add column new_followers integer;

-- ── brand_post_comments ────────────────────────────────────────────────────
-- comment_username viene null salvo cuando el autor es el dueño de la cuenta
-- respondiendo su propio post — restricción de privacidad de Meta, no un bug
-- de mapeo (probado contra la cuenta real).

create table public.brand_post_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.brand_posts (id) on delete cascade,
  external_id text not null,
  username text,
  body text,
  like_count integer,
  commented_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, post_id, external_id)
);

create index brand_post_comments_owner_idx on public.brand_post_comments (owner_id);
create index brand_post_comments_post_idx on public.brand_post_comments (owner_id, post_id);

do $do$
declare
  target text;
begin
  foreach target in array array['brand_post_comments']
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
