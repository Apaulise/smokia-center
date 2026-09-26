-- ═══════════════════════════════════════════════════════════════════════════
-- INSTAGRAM como canal de mensaje (Plan §1.9)
--
-- En su propio archivo: un `ADD VALUE` no se puede usar en la misma
-- transacción en que se declara, y la migración siguiente (lead_messages) ya
-- necesita el enum completo.
-- ═══════════════════════════════════════════════════════════════════════════

alter type message_channel add value 'INSTAGRAM';
