// Lógica pura de la bandeja de chats (§1.26): filtros, orden, quién tiene que
// responder y cómo se aplican los cambios que llegan por Realtime sobre el
// estado del cliente. Sin React ni Supabase, para probarla sola
// (tests/chats-inbox.test.mjs) y para que la pantalla no tenga que volver a
// pedirle todo al servidor por cada mensaje.

import type { ChatMessageView, ConversationFilter, ConversationListItem } from "@/lib/chats/queries";
import { OPEN_WINDOW_MS } from "@/lib/chats/window";

/** A menos de esto se avisa que la ventana de 24 h se está por cerrar. */
export const WINDOW_WARNING_MS = 2 * 60 * 60 * 1000;
/** "Ventana por cerrar": las que todavía se pueden responder libre pero les quedan menos de 6 h. */
export const WINDOW_FILTER_MS = 6 * 60 * 60 * 1000;

function time(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

/**
 * ¿El último mensaje es de la persona? Entonces le toca responder a uno. Se
 * deduce sin columna nueva: si el último entrante es (casi) el último mensaje.
 */
export function awaitingReply(item: Pick<ConversationListItem, "last_inbound_at" | "last_message_at">): boolean {
  const inbound = time(item.last_inbound_at);
  if (Number.isNaN(inbound)) return false;
  const last = time(item.last_message_at);
  if (Number.isNaN(last)) return true;
  return inbound >= last - 1000;
}

/** Cuánto le queda a la ventana libre de 24 h, en ms (0 si ya se cerró o nunca abrió). */
export function openWindowLeft(lastInboundAt: string | null | undefined, now: number = Date.now()): number {
  const inbound = time(lastInboundAt);
  if (Number.isNaN(inbound)) return 0;
  return Math.max(0, inbound + OPEN_WINDOW_MS - now);
}

/** El seguimiento vence hoy o ya venció (hora de Argentina no importa: se compara contra el fin del día local). */
export function followUpDue(followUpAt: string | null | undefined, now: number = Date.now()): boolean {
  const due = time(followUpAt);
  if (Number.isNaN(due)) return false;
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return due <= endOfDay.getTime();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesSearch(item: ConversationListItem, term: string): boolean {
  const needle = normalize(term.replace(/^@/, ""));
  if (!needle) return true;
  const haystack = normalize([item.participant_name, item.participant_handle, item.lead_name, ...(item.tags ?? [])].filter(Boolean).join(" "));
  return haystack.includes(needle);
}

export type InboxView = {
  filter: ConversationFilter;
  search: string;
  /** Etiqueta elegida en el filtro (`null` = todas). */
  tag: string | null;
};

/** Los filtros de cliente sobre las conversaciones ya cargadas. `archivadas` viene filtrado del servidor. */
export function filterItems(items: ConversationListItem[], view: InboxView, now: number = Date.now()): ConversationListItem[] {
  return items.filter((item) => {
    if (view.tag && !(item.tags ?? []).includes(view.tag)) return false;
    if (view.search && !matchesSearch(item, view.search)) return false;
    switch (view.filter) {
      case "sin_leer":
        return item.unread_count > 0;
      case "por_responder":
        return awaitingReply(item);
      case "ventana": {
        const left = openWindowLeft(item.last_inbound_at, now);
        return awaitingReply(item) && left > 0 && left <= WINDOW_FILTER_MS;
      }
      case "seguimiento":
        return followUpDue(item.follow_up_at, now);
      default:
        return true;
    }
  });
}

/** Cuántas hay en cada filtro, para los contadores de los botones. */
export function filterCounts(items: ConversationListItem[], now: number = Date.now()): Record<Exclude<ConversationFilter, "archivadas" | "todas">, number> {
  let sinLeer = 0;
  let porResponder = 0;
  let ventana = 0;
  let seguimiento = 0;
  for (const item of items) {
    if (item.unread_count > 0) sinLeer += 1;
    const waiting = awaitingReply(item);
    if (waiting) porResponder += 1;
    const left = openWindowLeft(item.last_inbound_at, now);
    if (waiting && left > 0 && left <= WINDOW_FILTER_MS) ventana += 1;
    if (followUpDue(item.follow_up_at, now)) seguimiento += 1;
  }
  return { sin_leer: sinLeer, por_responder: porResponder, ventana, seguimiento };
}

/** Todas las etiquetas presentes en la bandeja, de la más usada a la menos. */
export function tagsInUse(items: ConversationListItem[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** El orden de la bandeja: lo más reciente arriba, sin fecha al final. */
export function sortItems(items: ConversationListItem[]): ConversationListItem[] {
  return items.slice().sort((a, b) => {
    const ta = time(a.last_message_at);
    const tb = time(b.last_message_at);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

/** Las columnas de `conversations` que la bandeja copia de un evento de Realtime. */
const PATCHABLE: Array<keyof ConversationListItem> = [
  "participant_handle",
  "participant_name",
  "participant_picture",
  "participant_external_id",
  "lead_id",
  "status",
  "last_message_at",
  "last_message_preview",
  "last_inbound_at",
  "unread_count",
  "thread_owner",
  "participant_profile",
  "zernio_contact_id",
  "tags",
  "follow_up_at",
  "follow_up_note",
  "source_automation_id",
];

/**
 * Aplica una fila de `conversations` que llegó por Realtime. Si cambió de
 * estado (archivada ↔ activa) sale o entra de la lista que se está viendo.
 * Devuelve `null` si la fila es nueva y no se puede armar (falta un dato): en
 * ese caso conviene pedir la lista de nuevo.
 */
export function applyConversationChange(
  items: ConversationListItem[],
  row: Record<string, unknown>,
  scope: "activas" | "archivadas",
): ConversationListItem[] | null {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return items;
  const wanted = scope === "archivadas" ? "ARCHIVADA" : "ACTIVA";
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    if (row.status !== wanted) return items;
    // Conversación nueva: falta el nombre del lead (otra tabla). Mejor pedir la lista.
    return null;
  }

  const current = items[index];
  const patch: Partial<ConversationListItem> = {};
  for (const key of PATCHABLE) {
    if (key in row) (patch as Record<string, unknown>)[key] = row[key];
  }
  if (Array.isArray(patch.tags) === false && "tags" in patch) patch.tags = [];
  if (patch.lead_id !== undefined && patch.lead_id !== current.lead_id) {
    // El lead cambió: el nombre que teníamos ya no corresponde hasta recargar la lista.
    patch.lead_name = null;
    patch.lead_status = null;
  }
  const next = { ...current, ...patch };
  if (next.status !== wanted) return items.filter((item) => item.id !== id);
  const updated = items.slice();
  updated[index] = next;
  return sortItems(updated);
}

/** Un mensaje del hilo en la pantalla: el que vino de la base, o uno optimista que todavía se está mandando. */
export type ThreadMessage = ChatMessageView & {
  /** `sending` mientras viaja, `failed` si Zernio lo rechazó. Los de la base no lo traen. */
  local?: "sending" | "failed";
  /** Con qué se reintenta un optimista fallido (misma key de idempotencia: no se duplica). */
  clientId?: string;
  error?: string;
};

/**
 * Suma un mensaje al hilo sin duplicarlo: por id, y si viene uno de la base que
 * corresponde a un optimista (mismo texto y saliente, mandado hace poco), lo
 * reemplaza en vez de dibujar dos burbujas iguales.
 */
export function upsertThreadMessage(messages: ThreadMessage[], incoming: ThreadMessage): ThreadMessage[] {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages.map((message) => (message.id === incoming.id ? { ...message, ...incoming, local: incoming.local } : message));
  }
  if (!incoming.local && incoming.direction === "OUT") {
    const twin = messages.findIndex(
      (message) =>
        message.local === "sending" &&
        message.body === incoming.body &&
        Math.abs(Date.parse(message.occurred_at) - Date.parse(incoming.occurred_at)) < 5 * 60_000,
    );
    if (twin !== -1) {
      const replaced = messages.slice();
      replaced[twin] = incoming;
      return replaced;
    }
  }
  const next = [...messages, incoming];
  return next.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

/** El primer nombre para personalizar una respuesta rápida (`{{nombre}}`). */
export function firstNameOf(name: string | null | undefined, handle: string | null | undefined): string {
  const fromName = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (fromName) return fromName;
  return (handle ?? "").replace(/^@/, "").split(/[._]/)[0] ?? "";
}

/** Reemplaza `{{nombre}}` (y `{{name}}`) en el texto de una respuesta rápida. */
export function fillQuickReply(body: string, name: string | null | undefined, handle: string | null | undefined): string {
  const first = firstNameOf(name, handle);
  return body
    .replace(/\{\{\s*(nombre|name)\s*\}\}/gi, first)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
