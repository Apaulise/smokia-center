-- ═══════════════════════════════════════════════════════════════════════════
-- Planificador y publicación (Plans/03 §3.7)
--
-- brand_content_items nació en §3.6 con lo mínimo que pide "Guardar como
-- idea". Acá se le suma lo que convierte a la tabla en el pipeline completo:
--
-- · Ampliación del SOC (§3.10): objective, hypothesis, hook, angle,
--   parent_item_id y knowledge_id. Una pieza publicada tiene que dejar
--   información y no sólo un número: sin hipótesis escrita ANTES de grabar no
--   hay contra qué evaluar el resultado.
-- · Planificación y archivos: scheduled_for y media. `media` es un array
--   jsonb porque un carrusel lleva de 2 a 10 archivos; cada elemento guarda la
--   ruta en el bucket y lo que se midió al subirlo (tipo, tamaño, duración,
--   dimensiones), para poder revalidar las reglas de Instagram al publicar.
-- · Publicación: external_id (el id que devolvió Windsor, si devolvió alguno),
--   post_id (el empalme con brand_posts, que resuelve la sincronización),
--   published_at, y dos campos de control — publish_started_at es el "candado"
--   contra el doble clic (publicar dos veces es publicar dos posts) y
--   publish_error guarda por qué falló el último intento.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brand_content_items
  add column objective brand_recommendation_objective,
  add column hypothesis text,
  add column hook text,
  add column angle text,
  add column parent_item_id uuid references public.brand_content_items (id) on delete set null,
  add column knowledge_id uuid references public.brand_knowledge (id) on delete set null,
  add column scheduled_for timestamptz,
  add column media jsonb not null default '[]'::jsonb,
  add column post_id uuid references public.brand_posts (id) on delete set null,
  add column external_id text,
  add column published_at timestamptz,
  add column publish_started_at timestamptz,
  add column publish_error text,
  add constraint brand_content_items_not_own_parent check (parent_item_id is null or parent_item_id <> id);

create index brand_content_items_owner_scheduled_idx
  on public.brand_content_items (owner_id, scheduled_for);
create index brand_content_items_parent_idx on public.brand_content_items (parent_item_id);
create index brand_content_items_knowledge_idx on public.brand_content_items (knowledge_id);
create index brand_content_items_post_idx on public.brand_content_items (post_id);

-- ── Storage: bucket brand-media ────────────────────────────────────────────
-- Instagram no recibe el archivo: recibe una URL y la busca desde sus propios
-- servidores, así que el bucket tiene que ser PÚBLICO (una URL firmada de
-- corta vida no sirve). La lectura queda abierta a quien tenga el link exacto;
-- la escritura se restringe por política, con el owner_id como primer
-- segmento de la ruta ("<owner_id>/<pieza>/<archivo>"). Es la excepción al
-- aislamiento por usuario y está documentada en Plans/03 §3.7.
--
-- El límite de 1 GB es el de Instagram para un video. El tope real lo pone
-- además el plan de Supabase (en Free es de 50 MB por archivo, global).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-media',
  'brand-media',
  true,
  1073741824,
  array['image/jpeg', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists brand_media_owner_select on storage.objects;
create policy brand_media_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists brand_media_owner_insert on storage.objects;
create policy brand_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists brand_media_owner_update on storage.objects;
create policy brand_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'brand-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists brand_media_owner_delete on storage.objects;
create policy brand_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
