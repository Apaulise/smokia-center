import type { LeadWithRelations } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Columna "Próxima acción" de la tabla de leads (Design System §04 "Detalle
 * de lista"). `computeNextBestAction()` (§1.14) sólo corre cuando se analiza
 * una respuesta y queda guardado en `lead_intel.next_best_action` — la
 * mayoría de los leads de una lista recién scrapeada todavía no pasaron por
 * ahí, así que acá abajo hay una segunda capa de reglas, más simples, para
 * cuando no hay intel todavía: sin teléfono, sin contactar, o venciendo el
 * seguimiento.
 */

type LeadNextAction = Database["public"]["Enums"]["lead_next_action"];

const NEXT_ACTION_LABEL: Record<LeadNextAction, string> = {
  ASK_QUESTION: "Seguir preguntando",
  EXPLAIN_SERVICE: "Explicar el servicio",
  ASK_FOR_MEETING: "Pedir reunión",
  SEND_INFORMATION: "Mandar información",
  FOLLOW_UP: "Hacer seguimiento",
  WAIT: "Esperar respuesta",
  DISQUALIFY: "Descalificar",
  CLOSE_LEAD: "Cerrar",
};

/** Sin respuesta humana después de este tiempo, el seguimiento se considera vencido. */
const FOLLOW_UP_OVERDUE_DAYS = 5;

const WAITING_STATUSES: LeadStatus[] = ["CONTACTADO", "AUTORESPUESTA"];

export interface NextActionDisplay {
  label: string;
  reason: string | null;
  /** Para resaltar en rojo/ámbar como el mock hace con "Seguimiento vencido". */
  urgent: boolean;
}

export function describeNextAction(lead: LeadWithRelations): NextActionDisplay {
  const intel = lead.lead_intel;
  if (intel?.next_best_action) {
    return { label: NEXT_ACTION_LABEL[intel.next_best_action], reason: intel.next_best_action_reason, urgent: false };
  }

  if (!lead.phone) {
    return { label: "Falta teléfono", reason: "No hay forma de escribirle todavía.", urgent: false };
  }

  if (!lead.last_contacted_at) {
    return { label: "Generar apertura", reason: "Todavía no se le mandó un primer mensaje.", urgent: false };
  }

  if (WAITING_STATUSES.includes(lead.status)) {
    const daysSinceContact = Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86_400_000);
    if (daysSinceContact >= FOLLOW_UP_OVERDUE_DAYS) {
      return { label: "Seguimiento vencido", reason: `${daysSinceContact} días sin respuesta.`, urgent: true };
    }
    return { label: "Esperar respuesta", reason: null, urgent: false };
  }

  return { label: "—", reason: null, urgent: false };
}
