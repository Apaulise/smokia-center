import type { Database } from "@/lib/supabase/database.types";

/**
 * `next-best-action` del SPA §13 (Plan §1.14): un árbol de decisión en
 * TypeScript, no una pregunta al modelo. La condición para pedir reunión es
 * literal (SPA §14): dolor CONFIRMADO + respuesta humana + interés ≥ 5, las
 * tres a la vez. Un umbral que el modelo puede reinterpretar no es un umbral.
 */

export type LeadNextAction = Database["public"]["Enums"]["lead_next_action"];

/** El umbral de SPA §14. */
const MEETING_INTEREST_THRESHOLD = 5;
/** SPA §11: 9 es "quiere una llamada o una propuesta" — ya no hace falta pedir la reunión, hay que cerrar. */
const CLOSE_INTEREST_THRESHOLD = 9;

export interface NextActionSignals {
  responseType: "AUTORESPUESTA" | "HUMANA";
  /** 0–10, SPA §11. */
  interestLevel: number;
  /** Hay un `lead_signals` de kind=DOLOR en status=CONFIRMADO (§1.13). */
  painConfirmed: boolean;
  disqualify: boolean;
  notNow: boolean;
}

export interface NextBestAction {
  action: LeadNextAction;
  reason: string;
}

/**
 * Acciones que implican escribirle algo al prospecto ahora (§1.12). Quedan
 * afuera `WAIT` (esperar respuesta humana), `DISQUALIFY` (no se responde) y
 * `FOLLOW_UP` (espera a la fecha de retomar — SeguimientoComposer se encarga
 * cuando llega, §1.16). Se usa como respaldo cuando el analizador vuelve
 * `suggested_reply.has_reply = false` a pesar de que esta acción sí corresponde.
 */
const REPLY_WORTHY_ACTIONS = new Set<LeadNextAction>(["ASK_QUESTION", "EXPLAIN_SERVICE", "ASK_FOR_MEETING", "CLOSE_LEAD"]);

export function isReplyWorthyAction(action: LeadNextAction): boolean {
  return REPLY_WORTHY_ACTIONS.has(action);
}

/**
 * `SEND_INFORMATION` no sale de acá: es casi siempre una salida cortés (SPA
 * §12, "mandame información") y decidir mandarla es una lectura de contexto
 * que este árbol no tiene forma confiable de automatizar. Queda como opción
 * manual en la ficha, no como algo que el motor elija solo.
 */
export function computeNextBestAction(signals: NextActionSignals): NextBestAction {
  if (signals.disqualify) {
    return { action: "DISQUALIFY", reason: "El negocio no es un cliente viable para lo que resolvemos (SPA §13)." };
  }

  if (signals.notNow) {
    return {
      action: "FOLLOW_UP",
      reason: "\"Ahora no\" con fecha para retomar (SPA §16) — no es un lead perdido, es un lead con fecha.",
    };
  }

  if (signals.responseType === "AUTORESPUESTA") {
    return { action: "WAIT", reason: "Es una autorespuesta, no una respuesta humana todavía (SPA §10)." };
  }

  const meetingReady = signals.painConfirmed && signals.interestLevel >= MEETING_INTEREST_THRESHOLD;

  if (meetingReady && signals.interestLevel >= CLOSE_INTEREST_THRESHOLD) {
    return {
      action: "CLOSE_LEAD",
      reason: `Dolor confirmado e interés en ${signals.interestLevel}/10: ya está pidiendo una llamada o una propuesta (SPA §11), no hace falta seguir calificando.`,
    };
  }

  if (meetingReady) {
    return {
      action: "ASK_FOR_MEETING",
      reason: "Se cumplen las tres condiciones del SPA §14 al mismo tiempo: dolor confirmado, respuesta humana e interés ≥ 5.",
    };
  }

  if (signals.painConfirmed) {
    return {
      action: "EXPLAIN_SERVICE",
      reason: "Hay un dolor confirmado — corresponde explicar quién sos si todavía no se explicó (SPA §13); el interés no llegó a 5 para pedir reunión.",
    };
  }

  return {
    action: "ASK_QUESTION",
    reason: "Todavía no hay un dolor confirmado: seguí el orden de descubrimiento (SPA §3) con una pregunta a la vez (SPA §9).",
  };
}
