-- ═══════════════════════════════════════════════════════════════════════════
-- Competencia accionable (Plans/03 §3.14)
--
-- §3.8 dejó la pantalla de competencia en sólo lectura: marcaba outliers y ahí
-- terminaba. Este paso la hace terminar en una acción — descartar lo que no
-- sirve, y convertir lo que sí en una pieza del planificador.
--
-- Son sólo columnas sobre tablas que ya existen: RLS, las cuatro políticas y
-- los triggers de updated_at ya están vigentes y las cubren (la receta de
-- CLAUDE.md §10 es para tablas nuevas).
--
-- Nada de esto se pisa al actualizar una cuenta: el upsert de
-- reconcileCompetitor no manda estas columnas, y ON CONFLICT DO UPDATE sólo
-- escribe las que vienen en el payload.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brand_competitors
  -- La foto del perfil, tal como la devolvió Apify. Las URLs del CDN de
  -- Instagram caducan, así que la UI cae a un avatar con la inicial.
  add column profile_pic_url text;

alter table public.brand_competitor_posts
  -- La ✕ de la tarjeta. No se borra la fila: la próxima corrida la volvería a
  -- traer y el descarte se perdería.
  add column dismissed_at timestamptz,
  -- Qué tan aprovechable es la pieza para ESTA marca (0-100), según el
  -- clasificador gratuito. null = todavía sin clasificar, y se muestra igual:
  -- sin dato no se esconde nada.
  add column relevance_score smallint check (relevance_score between 0 and 100),
  add column relevance_reason text,
  add column relevance_checked_at timestamptz;

alter table public.brand_content_items
  -- De qué outlier ajeno salió la idea. on delete set null: dejar de seguir la
  -- cuenta no puede borrar una pieza propia.
  add column source_competitor_post_id uuid
    references public.brand_competitor_posts (id) on delete set null,
  -- El permalink copiado. Sobrevive al borrado de la fila de origen, que es
  -- justamente cuando el link sigue haciendo falta.
  add column source_url text;

-- Para la búsqueda inversa de la pantalla de competencia ("¿este outlier ya lo usé?").
create index brand_content_items_source_competitor_post_idx
  on public.brand_content_items (source_competitor_post_id);

-- Los candidatos a clasificar son los no descartados sin clasificar: índice parcial
-- porque es exactamente la fila que busca classifyPendingOutliers.
create index brand_competitor_posts_pending_relevance_idx
  on public.brand_competitor_posts (owner_id, published_at desc)
  where relevance_checked_at is null and dismissed_at is null;
