import type { Json } from "@/lib/supabase/database.types";

/**
 * Cómo se muestra un adjunto cuando no hay texto. Instagram manda "share" para
 * casi todo lo compartido y deja el tipo real en `originalType`: una mención en
 * historia llega como `share` + `story_mention`, y tratarla como un documento
 * genérico esconde lo que casi siempre es un lead.
 */
export function attachmentLabel(type: string, originalType?: string | null): string {
  if (originalType === "story_mention") return "Te mencionó en su historia";
  if (originalType === "ig_reel" || originalType === "reel") return "Reel compartido";
  if (originalType === "ig_post" || originalType === "post") return "Publicación compartida";
  if (originalType === "ig_story" || originalType === "story") return "Historia compartida";
  switch (type) {
    case "image":
      return "Imagen";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "file":
      return "Documento";
    case "sticker":
      return "Sticker";
    case "share":
      return "Contenido compartido";
    default:
      return "Adjunto";
  }
}

export type AttachmentView = { type: string; originalType: string | null; url: string | null; label: string; /** Nombre del archivo, si vino. */ name: string | null };

/** Lee `messages.attachments` (jsonb) sin confiar en su forma. */
export function readAttachments(value: Json | null | undefined): AttachmentView[] {
  if (!Array.isArray(value)) return [];
  const views: AttachmentView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const type = typeof item.type === "string" ? item.type : "file";
    const originalType = typeof item.originalType === "string" ? item.originalType : null;
    const url = typeof item.url === "string" && /^https:\/\//.test(item.url) ? item.url : null;
    const name = typeof item.filename === "string" && item.filename.trim() ? item.filename.trim().slice(0, 120) : null;
    views.push({ type, originalType, url, label: attachmentLabel(type, originalType), name });
  }
  return views;
}

const TIME_ZONE = "America/Argentina/Buenos_Aires";

function dayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/**
 * Para la lista de chats: la hora si es de hoy, el día de la semana si es de
 * esta semana y la fecha corta si es más vieja.
 */
export function formatChatTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (dayKey(date) === dayKey(now)) {
    return date.toLocaleTimeString("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6) return date.toLocaleDateString("es-AR", { timeZone: TIME_ZONE, weekday: "short" });
  return date.toLocaleDateString("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
}

/** Fecha y hora completas, para el encabezado de cada día del hilo. */
export function formatChatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
}

export function formatChatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function chatDayKey(iso: string): string {
  return dayKey(new Date(iso));
}

/** Iniciales para el avatar cuando la persona no tiene foto (o expiró). */
export function initialsOf(name: string | null | undefined, handle: string | null | undefined): string {
  const source = (name ?? "").trim() || (handle ?? "").trim();
  if (!source) return "?";
  const words = source.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words[1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

const PREVIEW_MAX = 140;

/** La línea de la lista de chats: el texto, o el adjunto entre corchetes. */
export function previewOf(body: string | null | undefined, attachments: Json | null | undefined): string | null {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  const first = readAttachments(attachments)[0];
  return first ? `[${first.label.toLowerCase()}]` : null;
}
