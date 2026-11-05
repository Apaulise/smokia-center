-- Leads que entran por el embudo orgánico de Instagram (ManyChat).
-- Plans/manychat-instagram-leads.md §3. `leads` ya tiene RLS y sus cuatro
-- políticas: no se tocan, sólo se suman dos columnas y dos índices.

alter table public.leads
  add column if not exists acquisition_source text,  -- 'instagram_organico' | null (null = histórico)
  add column if not exists intake jsonb;             -- datos del flujo de ManyChat

-- Para el upsert por ID de ManyChat.
create index if not exists leads_intake_manychat_idx
  on public.leads (owner_id, (intake->>'manychat_id'))
  where intake ? 'manychat_id';

-- Para medir pieza → llamada.
create index if not exists leads_intake_pieza_idx
  on public.leads (owner_id, (intake->>'pieza_origen'))
  where intake ? 'pieza_origen';

-- Para el filtro "Origen" de la lista.
create index if not exists leads_acquisition_source_idx
  on public.leads (owner_id, acquisition_source)
  where acquisition_source is not null;
