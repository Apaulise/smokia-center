-- ═══════════════════════════════════════════════════════════════════════════
-- Descubrir virales con la API oficial de Meta (Plans/03 §3.17)
--
-- Segunda fuente de brand_trend_posts: `top_media` de la búsqueda por hashtag
-- de la Graph API. Apify se mantiene; cada fila recuerda de cuál vino.
--
-- Meta no devuelve el @usuario del autor en este endpoint, así que username
-- pasa a ser nullable. Las filas existentes (todas de Apify) no cambian.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.trend_source as enum ('APIFY', 'META');

alter table public.brand_trend_searches
  add column source public.trend_source not null default 'APIFY';

alter table public.brand_trend_posts
  add column source public.trend_source not null default 'APIFY',
  alter column username drop not null;

-- El tope de Meta (30 hashtags únicos por 7 días) se cuenta sobre las
-- búsquedas META recientes del usuario: índice para esa consulta exacta.
create index brand_trend_searches_owner_source_created_idx
  on public.brand_trend_searches (owner_id, source, created_at desc);
