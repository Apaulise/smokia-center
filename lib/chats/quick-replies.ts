// Respuestas rápidas del inbox (§1.26): textos y audios guardados que se mandan
// con un toque. Tipos y reglas puras compartidas por el compositor, la
// Configuración y las acciones del servidor (tests/chats-quick-replies.test.mjs).

import type { QuickReplyKind } from "@/lib/chats/db";

export type QuickReplyView = {
  id: string;
  kind: QuickReplyKind;
  title: string;
  body: string | null;
  /** URL firmada para escuchar el audio antes de mandarlo (vence: no se guarda). */
  previewUrl: string | null;
  durationMs: number | null;
  useCount: number;
};

/** Formatos que acepta Instagram como audio y que se pueden subir. */
export const AUDIO_MIME_TYPES = ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"] as const;
export const AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const AUDIO_MAX_MS = 60_000;
export const TITLE_MAX = 60;
export const BODY_MAX = 1000;

const EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

/** El tipo de un archivo de audio subido, o `null` si Instagram no lo va a aceptar. */
export function audioMimeOf(type: string, name: string): string | null {
  const clean = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (clean && clean in EXTENSIONS) return clean;
  // Safari y algunos sistemas suben m4a sin tipo, o como `application/octet-stream`.
  const extension = name.toLowerCase().split(".").pop();
  switch (extension) {
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    default:
      return null;
  }
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? "bin";
}

/** Filtra las respuestas del selector con lo que se escribió después de la barra. */
export function matchQuickReplies(items: QuickReplyView[], query: string): QuickReplyView[] {
  const needle = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const scored = items.map((item, index) => {
    const title = item.title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    const body = (item.body ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    let score = -1;
    if (!needle) score = 1;
    else if (title.startsWith(needle)) score = 3;
    else if (title.includes(needle)) score = 2;
    else if (body.includes(needle)) score = 1;
    return { item, index, score };
  });
  return scored
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || b.item.useCount - a.item.useCount || a.index - b.index)
    .map((entry) => entry.item);
}

/** `0:42` para la duración de un audio. */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
