/** Dos cargas del mismo envío o de la misma respuesta, con el reloj corrido un poco. */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/** Para comparar: recorta y colapsa espacios. Lo que se guarda es el texto recortado. */
export function normalizeMessageContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function isSameMessage(
  existing: { content: string; occurredAt: string; channel: string },
  incoming: { content: string; occurredAt: string; channel: string },
): boolean {
  if (existing.channel !== incoming.channel) return false;
  if (normalizeMessageContent(existing.content) !== normalizeMessageContent(incoming.content)) return false;
  const left = Date.parse(existing.occurredAt);
  const right = Date.parse(incoming.occurredAt);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return Math.abs(left - right) <= DUPLICATE_WINDOW_MS;
}
