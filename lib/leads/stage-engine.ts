import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";

const PIPELINE_INDEX: Record<LeadStatus, number> = Object.fromEntries(
  LEAD_STATUSES.map((status, index) => [status, index]),
) as Record<LeadStatus, number>;

export interface StageSignals {
  responseType: "AUTORESPUESTA" | "HUMANA";
  /** 0–10, SPA §11. */
  interestLevel: number;
  /** Hay un `lead_signals` de kind=DOLOR en status=CONFIRMADO (§1.13). */
  painConfirmed: boolean;
  /** El lead pidió explícitamente hablar o reunirse. */
  wantsMeeting: boolean;
  /** El negocio no es un cliente viable (SPA §13, DISQUALIFY). */
  disqualify: boolean;
  /** "Ahora no" con fecha de retomar (SPA §16) — nunca es un rechazo. */
  notNow: boolean;
}

/**
 * El CRMStateEngine (Plan §1.8/§1.12): dadas las señales de un análisis,
 * decide el próximo estado del pipeline de 17.
 *
 * Reglas duras, no sugerencias:
 * - **Nunca retrocede.** Si ninguna señal justifica avanzar, se queda en el
 *   estado actual — el humano puede seguir forzando cualquier estado a mano.
 * - **Nunca decide un cierre.** CERRADO_GANADO y CERRADO_PERDIDO quedan
 *   siempre en manos humanas: una IA que mueve un lead a CERRADO_PERDIDO sola
 *   es una IA que borra trabajo. Tampoco decide LISTO (lo pone el
 *   enriquecimiento, §1.10) ni REUNION_AGENDADA/REUNION_REALIZADA (los pone
 *   la agenda, §1.5) — son señales de otro flujo, no de leer una respuesta.
 * - **DESCARTADO y AHORA_NO son salidas, no progreso numérico.** Se evalúan
 *   antes que el resto y no compiten por "el candidato más avanzado": un
 *   dolor confirmado con interés alto no le gana a un "ahora no" explícito.
 */
export function nextStage(current: LeadStatus, signals: StageSignals): LeadStatus {
  if (signals.disqualify) return "DESCARTADO";
  if (signals.notNow) return "AHORA_NO";

  const candidates: LeadStatus[] = [];
  if (signals.responseType === "AUTORESPUESTA") {
    candidates.push("AUTORESPUESTA");
  } else {
    candidates.push("RESPONDIO");
    if (signals.painConfirmed) candidates.push("DIAGNOSTICO");
    if (signals.painConfirmed && signals.interestLevel >= 5) candidates.push("CALIFICADO");
    if (signals.interestLevel >= 7) candidates.push("INTERESADO");
    // Mismo umbral que next-action.ts (§1.14, SPA §14): pedir reunión exige
    // dolor confirmado, respuesta humana e interés ≥ 5 al mismo tiempo.
    if (signals.wantsMeeting && signals.painConfirmed && signals.interestLevel >= 5) {
      candidates.push("REUNION_PROPUESTA");
    }
  }

  const currentIndex = PIPELINE_INDEX[current];
  const forward = candidates.filter((status) => PIPELINE_INDEX[status] > currentIndex);
  if (forward.length === 0) return current;

  return forward.reduce((furthest, status) => (PIPELINE_INDEX[status] > PIPELINE_INDEX[furthest] ? status : furthest));
}
