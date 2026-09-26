-- ═══════════════════════════════════════════════════════════════════════════
-- Antisesgo de ángulo (Plan §1.11, SPA §6: "evitar usar siempre el mismo")
--
-- El conteo de aperturas por ángulo de los últimos 30 días, calculado en SQL:
-- el modelo no hace aritmética (mismo criterio que el resto del proyecto).
-- SECURITY INVOKER (default), como las demás funciones de agregados.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.lead_angle_counts_30d()
returns table (
  angle lead_sales_angle,
  message_count bigint
)
language sql
stable
as $$
  select angle, count(*) as message_count
  from public.lead_messages
  where sender = 'VENDEDOR'
    and generated_by = 'IA'
    and angle is not null
    and occurred_at >= now() - interval '30 days'
  group by angle;
$$;
