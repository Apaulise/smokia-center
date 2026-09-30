-- ═══════════════════════════════════════════════════════════════════════════
-- Bucle de estilo: qué propuso la IA vs qué mandó el vendedor (Plan §1.20.1)
--
-- Columnas en `lead_messages`, no tabla nueva: la relación es 1:1 con la fila
-- que ya se inserta al confirmar. `analysis`, `angle` y `variant` son el
-- precedente de columnas nullable que sólo aplican a cierto tipo de fila.
-- ═══════════════════════════════════════════════════════════════════════════

-- El tipo de mensaje generado. Viaja como etiqueta del ejemplo ("esto era una
-- apertura"), no como criterio de segmentación: el estilo aprendido es uno
-- solo y global (Plan §1.20).
do $do$
begin
  create type lead_message_kind as enum ('APERTURA', 'RESPUESTA', 'SEGUIMIENTO');
exception
  when duplicate_object then null;
end;
$do$;

alter table public.lead_messages add column if not exists kind lead_message_kind;

-- El texto de la IA sobre el que el humano escribió — no siempre el primer
-- borrador: si apretó un botón de tono y después editó, acá va el texto ya
-- reescrito, que es contra lo que se mide la intervención humana real.
alter table public.lead_messages add column if not exists generated_content text;

-- Levenshtein sobre los dos textos normalizados. Se guarda crudo y el umbral
-- se aplica al leer (lib/leads/ai/style/constants.ts): si el umbral queda mal
-- calibrado se retoca una constante en vez de perder los datos.
alter table public.lead_messages add column if not exists edit_distance smallint;

-- "No usar este ejemplo" desde la pantalla de estilo (§1.20.2).
alter table public.lead_messages add column if not exists style_excluded boolean not null default false;

-- Calco de lead_messages_generator_only_ai_vendedor: un borrador sólo existe
-- si el mensaje lo generó la IA.
do $do$
begin
  alter table public.lead_messages
    add constraint lead_messages_generated_only_ai
    check (generated_content is null or generated_by = 'IA');
exception
  when duplicate_object then null;
end;
$do$;

-- Los ejemplos se leen filtrando por estas tres condiciones y ordenando por
-- confirmed_at (CLAUDE.md §4: índice sobre toda columna de filtro frecuente).
create index if not exists lead_messages_style_idx
  on public.lead_messages (owner_id, confirmed_at desc)
  where generated_content is not null and edit_distance > 0 and not style_excluded;
