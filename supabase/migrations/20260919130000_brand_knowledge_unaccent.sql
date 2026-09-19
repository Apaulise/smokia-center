-- ═══════════════════════════════════════════════════════════════════════════
-- La búsqueda de la base de conocimiento ignora los acentos (Plans/03 §3.12)
--
-- La configuración 'spanish' de Postgres hace stemming pero no quita tildes:
-- buscar "automatizacion" no encuentra "automatización". En español se
-- escribe sin tilde todo el tiempo (teclado, apuro, el propio modelo), así
-- que una búsqueda que distingue "sesión" de "sesion" devuelve vacío y
-- parece que la nota no existe.
--
-- Se arma una configuración propia: la de 'spanish' con `unaccent` delante
-- del stemmer. La columna generada se recrea con ella; la tabla acaba de
-- nacer en la migración anterior, así que no hay filas que perder y el
-- valor se recalcula solo.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists unaccent with schema extensions;

drop text search configuration if exists public.spanish_unaccent;
create text search configuration public.spanish_unaccent (copy = pg_catalog.spanish);
alter text search configuration public.spanish_unaccent
  alter mapping for hword, hword_part, word
  with extensions.unaccent, spanish_stem;

drop index if exists public.brand_knowledge_search_idx;
alter table public.brand_knowledge drop column search;
alter table public.brand_knowledge add column search tsvector generated always as (
  to_tsvector('public.spanish_unaccent', title || ' ' || coalesce(body, ''))
) stored;
create index brand_knowledge_search_idx on public.brand_knowledge using gin (search);
