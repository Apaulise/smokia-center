// Respuestas rápidas del inbox (§1.26): textos, audios y documentos/imágenes
// guardados que se mandan con un toque. Tipos y reglas puras compartidas por el
// compositor y las acciones del servidor (tests/chats-inbox.test.mjs).

import type { QuickReplyKind } from "@/lib/chats/db";

export type QuickReplyView = {
  id: string;
  kind: QuickReplyKind;
  title: string;
  body: string | null;
  /** URL firmada para escuchar el audio o ver el archivo antes de mandarlo (vence en una hora: no se guarda). */
  previewUrl: string | null;
  durationMs: number | null;
  /** Tipo del audio o del archivo. En un ARCHIVO dice si es imagen o documento. */
  mime: string | null;
  fileName: string | null;
  fileSize: number | null;
  useCount: number;
};

/** Las tres secciones de las respuestas rápidas, en el orden en que se muestran. */
export const QUICK_REPLY_SECTIONS: ReadonlyArray<{ kind: QuickReplyKind; label: string; empty: string }> = [
  { kind: "TEXTO", label: "Textos", empty: "Todavía no guardaste textos. Creá uno acá, o escribilo en el campo y tocá «Guardar»." },
  { kind: "AUDIO", label: "Audios", empty: "Todavía no guardaste audios. Grabá uno o subí un archivo." },
  { kind: "ARCHIVO", label: "Archivos", empty: "Todavía no guardaste documentos ni imágenes. Subí un PDF o una imagen." },
];

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

// ── Documentos e imágenes ───────────────────────────────────────────────────
// Lo que Instagram acepta por mensaje directo: imágenes png, jpeg o gif de hasta
// 8 MB y PDF de hasta 25 MB.

export const FILE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "application/pdf"] as const;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const FILE_NAME_MAX = 120;
/** Para el `accept` del selector de archivos. */
export const FILE_ACCEPT = "image/png,image/jpeg,image/gif,application/pdf,.png,.jpg,.jpeg,.gif,.pdf";

const FILE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** El tipo de un documento o imagen subido, o `null` si Instagram no lo va a aceptar. */
export function fileMimeOf(type: string, name: string): string | null {
  const clean = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (clean === "image/jpg") return "image/jpeg";
  if (clean && clean in FILE_EXTENSIONS) return clean;
  switch (name.toLowerCase().split(".").pop()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

export function fileExtensionFor(mime: string): string {
  return FILE_EXTENSIONS[mime] ?? "bin";
}

/** Una imagen se manda como imagen (se ve en el chat); todo lo demás, como documento. */
export function fileKindOf(mime: string | null | undefined): "image" | "document" {
  return (mime ?? "").startsWith("image/") ? "image" : "document";
}

export function fileSizeLimit(mime: string): number {
  return fileKindOf(mime) === "image" ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES;
}

/** `340 KB`, `1,2 MB`: el peso de un archivo, con coma decimal. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Cómo se nombra un guardado al avisar que se está mandando: «el audio», «la imagen», «el documento». */
export function sendableNoun(reply: Pick<QuickReplyView, "kind" | "mime">): string {
  if (reply.kind === "AUDIO") return "el audio";
  return fileKindOf(reply.mime) === "image" ? "la imagen" : "el documento";
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
    const body = [item.body ?? "", item.fileName ?? ""]
      .join(" ")
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
