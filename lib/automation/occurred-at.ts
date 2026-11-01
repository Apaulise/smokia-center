import { DUPLICATE_WINDOW_MS } from "@/lib/automation/message-identity";

const FUTURE_SLACK_MS = 5 * 60 * 1000;

/**
 * Sin valor, el instante de la carga. Con valor, la hora real (ISO con zona).
 * Un desfase de unos minutos entra; más que eso se rechaza.
 */
export function resolveOccurredAt(
  value: string | undefined,
  now = new Date(),
): { ok: true; iso: string } | { ok: false; message: string } {
  if (!value) return { ok: true, iso: now.toISOString() };
  const time = Date.parse(value);
  if (Number.isNaN(time)) return { ok: false, message: "occurred_at inválido." };
  if (time > now.getTime() + FUTURE_SLACK_MS) {
    return { ok: false, message: "occurred_at no puede estar en el futuro." };
  }
  return { ok: true, iso: new Date(time).toISOString() };
}

export function occurredWindow(iso: string): { from: string; to: string } {
  const time = Date.parse(iso);
  return {
    from: new Date(time - DUPLICATE_WINDOW_MS).toISOString(),
    to: new Date(time + DUPLICATE_WINDOW_MS).toISOString(),
  };
}
