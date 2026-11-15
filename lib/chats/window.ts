/**
 * Ventana de mensajes de Instagram (Meta), contada desde el último mensaje del
 * CLIENTE:
 *
 *  · hasta 24 h: se responde normal.
 *  · de 24 h a 7 días: sólo con la etiqueta `HUMAN_AGENT` (messagingType
 *    MESSAGE_TAG), y únicamente para mensajes que escribió una persona. Meta no
 *    la admite en automáticos: los workflows de Zernio la rechazan.
 *  · pasados los 7 días: no se puede responder hasta que el cliente escriba.
 *  · si el cliente nunca escribió, tampoco: en Instagram siempre abre la persona.
 *
 * Es una función pura a propósito: la UI la usa para bloquear el compositor y
 * la acción de enviar para decidir la etiqueta, y las dos tienen que dar lo
 * mismo.
 */

export const OPEN_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ReplyWindow =
  | { state: "open"; expiresAt: string; msLeft: number }
  | { state: "human_agent"; expiresAt: string; msLeft: number }
  | { state: "closed"; expiresAt: null; msLeft: 0 }
  | { state: "none"; expiresAt: null; msLeft: 0 };

export function replyWindow(lastInboundAt: string | null | undefined, now: number = Date.now()): ReplyWindow {
  if (!lastInboundAt) return { state: "none", expiresAt: null, msLeft: 0 };
  const last = Date.parse(lastInboundAt);
  if (Number.isNaN(last)) return { state: "none", expiresAt: null, msLeft: 0 };

  const elapsed = now - last;
  if (elapsed < OPEN_WINDOW_MS) {
    return { state: "open", expiresAt: new Date(last + OPEN_WINDOW_MS).toISOString(), msLeft: OPEN_WINDOW_MS - elapsed };
  }
  if (elapsed < HUMAN_AGENT_WINDOW_MS) {
    return {
      state: "human_agent",
      expiresAt: new Date(last + HUMAN_AGENT_WINDOW_MS).toISOString(),
      msLeft: HUMAN_AGENT_WINDOW_MS - elapsed,
    };
  }
  return { state: "closed", expiresAt: null, msLeft: 0 };
}

/** ¿Se puede mandar un mensaje escrito por una persona? */
export function canReply(window: ReplyWindow): boolean {
  return window.state === "open" || window.state === "human_agent";
}

/** Los campos de Zernio que corresponden a la ventana: sólo `human_agent` lleva etiqueta. */
export function sendTagFields(window: ReplyWindow): { messagingType?: "MESSAGE_TAG"; messageTag?: "HUMAN_AGENT" } {
  return window.state === "human_agent" ? { messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" } : {};
}

/** `quedan 3 h`, `quedan 2 días`, para el encabezado del hilo. */
export function formatWindowLeft(msLeft: number): string {
  const minutes = Math.max(1, Math.round(msLeft / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} días`;
}

export function windowLabel(window: ReplyWindow): string {
  switch (window.state) {
    case "open":
      return `Podés responder libremente · quedan ${formatWindowLeft(window.msLeft)}`;
    case "human_agent":
      return `Pasaron más de 24 h: sólo mensajes escritos por una persona · quedan ${formatWindowLeft(window.msLeft)}`;
    case "closed":
      return "Pasaron más de 7 días desde su último mensaje: no se puede responder hasta que escriba.";
    case "none":
      return "Todavía no te escribió: en Instagram sólo se puede responder después de su primer mensaje.";
  }
}
