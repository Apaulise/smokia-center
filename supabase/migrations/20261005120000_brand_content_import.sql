-- ═══════════════════════════════════════════════════════════════════════════
-- Importar publicados al planificador (Plans/03 §3.16)
--
-- Los reels que se suben a Instagram sin pasar por el planificador ya llegan a
-- brand_posts con cada sincronización, pero no figuran en el calendario. Cada
-- uno pasa a ser una brand_content_items en estado PUBLICADO, en el día en que
-- salió, y se le extrae con Gemini lo que el video dice (transcripción en
-- `script`, más hook, idea, ángulo y título).
--
-- · imported_from_post: distingue una pieza importada de una planificada. Una
--   importada no tiene hipótesis escrita ANTES de grabar, y no se la hace pasar
--   por un experimento (getPublishedHypotheses filtra por hypothesis not null).
-- · analysis_status: PENDIENTE (falta analizar), LISTO o FALLIDO. null = no
--   corresponde analizar (post, carrusel) o la pieza no es importada.
-- · analysis_attempts / analysis_error: un reel que rompe siempre no puede
--   reintentarse para siempre — a los 3 intentos queda FALLIDO con el motivo.
--
-- No hay tabla nueva: las políticas de RLS (con WITH CHECK) de la tabla ya
-- cubren las columnas nuevas.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brand_content_items
  add column imported_from_post boolean not null default false,
  add column analysis_status text,
  add column analysis_error text,
  add column analysis_attempts integer not null default 0,
  add constraint brand_content_items_analysis_status_check
    check (analysis_status is null or analysis_status in ('PENDIENTE', 'LISTO', 'FALLIDO'));

-- Sólo las filas con trabajo pendiente: la consulta de "qué falta analizar" no recorre la tabla entera.
create index brand_content_items_analysis_pending_idx
  on public.brand_content_items (owner_id, published_at desc)
  where analysis_status = 'PENDIENTE';
