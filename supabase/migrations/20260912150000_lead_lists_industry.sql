-- El rubro se elige al generar/importar la lista (Plan §1.2/§1.3) y de ahí se
-- propaga a cada lead que entra por esa lista, en vez de quedar sin asignar
-- hasta que alguien lo cargue a mano fila por fila.

alter table public.lead_lists
  add column if not exists industry_id uuid references public.industries (id) on delete set null;

create index if not exists lead_lists_owner_industry_idx
  on public.lead_lists (owner_id, industry_id);
