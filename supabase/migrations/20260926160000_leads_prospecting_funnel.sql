-- ═══════════════════════════════════════════════════════════════════════════
-- Métricas de prospección (Plan §1.17)
--
-- Los siete escalones del embudo: leads totales, contactados, respuestas
-- humanas, calificados, interesados, con reunión y cerrados ganados — más el
-- total de respuestas (autorespuestas incluidas), que se muestra aparte y
-- marcado como no evaluativo (SPA §20). Todo se calcula acá, nada se le pide
-- al modelo. SECURITY INVOKER (default), como las demás funciones de
-- agregados: RLS filtra igual que en cualquier otra query.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.leads_prospecting_funnel()
returns table (
  total_leads bigint,
  contacts_sent bigint,
  human_responses bigint,
  qualified bigint,
  interested bigint,
  meetings bigint,
  won bigint,
  total_responses bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.leads) as total_leads,
    -- Un lead cuenta una sola vez, aunque se le haya mandado más de un mensaje.
    (select count(distinct lead_id) from public.lead_messages where sender = 'VENDEDOR') as contacts_sent,
    -- AUTORESPUESTA nunca cuenta como respuesta humana (SPA §10, §17). El
    -- análisis guarda { analysis: { response_type, ... }, ... } (schemas.ts).
    (select count(distinct lead_id) from public.lead_messages
      where sender = 'LEAD' and (analysis -> 'analysis' ->> 'response_type') = 'HUMANA') as human_responses,
    -- Cumulativo por posición en el pipeline: un lead que saltó CALIFICADO
    -- pero llegó a INTERESADO igual cuenta acá (Plan §1.8, el orden es del enum).
    (select count(*) from public.leads
      where status in ('CALIFICADO','INTERESADO','REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')) as qualified,
    (select count(*) from public.leads
      where status in ('INTERESADO','REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')) as interested,
    (select count(*) from public.leads
      where status in ('REUNION_PROPUESTA','REUNION_AGENDADA','REUNION_REALIZADA','PROPUESTA_ENVIADA','CERRADO_GANADO')) as meetings,
    (select count(*) from public.leads where status = 'CERRADO_GANADO') as won,
    -- Mezcla autorespuestas: sirve para saber si los mensajes llegan, no si son buenos (SPA §20).
    (select count(distinct lead_id) from public.lead_messages where sender = 'LEAD') as total_responses;
$$;
