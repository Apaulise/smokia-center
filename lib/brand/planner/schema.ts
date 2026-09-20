import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type ContentItem = Database["public"]["Tables"]["brand_content_items"]["Row"];
export type ContentKind = ContentItem["kind"];
export type ContentStatus = ContentItem["status"];
export type ContentObjective = NonNullable<ContentItem["objective"]>;

export const CONTENT_KINDS = ["REEL", "POST", "CARRUSEL", "HISTORIA", "VIDEO", "SHORT"] as const satisfies readonly ContentKind[];

/** El orden es el del pipeline: IDEA → … → PUBLICADO. */
export const CONTENT_STATUSES = [
  "IDEA",
  "GUION",
  "GRABADO",
  "EDITADO",
  "LISTO",
  "PUBLICADO",
] as const satisfies readonly ContentStatus[];

/** PUBLICADO no se elige a mano: lo pone la publicación (o la sincronización). */
export const EDITABLE_STATUSES = CONTENT_STATUSES.filter((s) => s !== "PUBLICADO");

export const CONTENT_OBJECTIVES = ["ALCANCE", "AUTORIDAD", "CONVERSION"] as const satisfies readonly ContentObjective[];

export const KIND_LABEL: Record<ContentKind, string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  IDEA: "Idea",
  GUION: "Guion",
  GRABADO: "Grabado",
  EDITADO: "Editado",
  LISTO: "Listo",
  PUBLICADO: "Publicado",
};

export const OBJECTIVE_LABEL: Record<ContentObjective, string> = {
  ALCANCE: "Alcance",
  AUTORIDAD: "Autoridad",
  CONVERSION: "Conversión",
};

/**
 * Cadencia base del SOC §19: 3–4 reels por semana. Son constantes con nombre
 * porque son una decisión editorial y se van a mover (mismo criterio que los
 * umbrales de `insights/baseline.ts`).
 */
export const WEEKLY_REELS_MIN = 3;
export const WEEKLY_REELS_MAX = 4;

/**
 * Publicar desde la app está apagado (Plans/03 §3.13): las piezas se publican a
 * mano desde Instagram —probablemente por el audio en tendencia, que la API de
 * publicación no deja elegir— y se registran acá con "Ya la publiqué".
 *
 * El código de publicar no se borra, se apaga: esconde "Publicar ahora" y la
 * subida de archivos, y `publishPlannerItem` rechaza del lado del servidor
 * (esconder un botón no es una barrera). Volver a `true` lo reactiva todo.
 */
export const PUBLISH_FROM_APP_ENABLED = false;

/** El bucket público de los archivos a publicar (ver la migración de §3.7 y por qué es público). */
export const BRAND_MEDIA_BUCKET = "brand-media";

/** Hora a la que queda una pieza al arrastrarla desde "Sin fecha" a un día (horario de Argentina). */
export const DEFAULT_SCHEDULE_TIME = "12:00";

/** El máximo de caption de Instagram, hashtags incluidos. */
export const CAPTION_MAX_CHARS = 2200;

/** Hashtags como los guarda la tabla: siempre con `#`, sin repetidos. */
export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const clean = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (clean) seen.add(`#${clean}`);
  }
  return [...seen];
}

/** Lo que efectivamente se manda a Instagram: el caption y, debajo, los hashtags. */
export function composeCaption(caption: string | null, hashtags: string[]): string | null {
  const parts = [caption?.trim(), hashtags.length > 0 ? hashtags.join(" ") : null].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .nullish()
    .transform((value) => value || null);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");

/** Todo lo que se edita de una pieza desde el diálogo del planificador. */
export const PlannerItemInput = z.object({
  title: z.string().trim().min(1, "Ponele un título.").max(200, "Máximo 200 caracteres."),
  kind: z.enum(CONTENT_KINDS),
  status: z.enum(EDITABLE_STATUSES),
  objective: z.enum(CONTENT_OBJECTIVES).nullish().transform((v) => v ?? null),
  hypothesis: optionalText(1500),
  hook: optionalText(500),
  angle: optionalText(500),
  idea: optionalText(20_000),
  script: optionalText(20_000),
  caption: optionalText(CAPTION_MAX_CHARS),
  hashtags: z.array(z.string()).max(30, "Instagram admite hasta 30 hashtags.").default([]),
  scheduledDate: isoDate.nullish().transform((v) => v ?? null),
  scheduledTime: time.nullish().transform((v) => v ?? null),
  parentItemId: z.string().uuid().nullish().transform((v) => v ?? null),
  knowledgeId: z.string().uuid().nullish().transform((v) => v ?? null),
});

export type PlannerItemInput = z.input<typeof PlannerItemInput>;

/**
 * Lo que necesita "Generar guion": los campos del diálogo tal como están en
 * pantalla, guardados o no. La acción no lee la base, así que sirve también
 * con una pieza que todavía no se creó.
 */
export const ScriptFromIdeaInput = z.object({
  title: z.string().trim().max(200, "Máximo 200 caracteres."),
  kind: z.enum(CONTENT_KINDS),
  objective: z.enum(CONTENT_OBJECTIVES).nullish().transform((v) => v ?? null),
  hypothesis: optionalText(1500),
  hook: optionalText(500),
  angle: optionalText(500),
  idea: z.string().trim().min(1, "Escribí la idea primero: el guion se arma a partir de ella.").max(20_000, "Máximo 20.000 caracteres."),
});

export type ScriptFromIdeaInput = z.input<typeof ScriptFromIdeaInput>;

/** Lo que se guarda en `media` (jsonb): se valida al leer porque la columna es libre. */
export const MediaFileSchema = z.object({
  path: z.string().min(1),
  type: z.enum(["IMAGE", "VIDEO"]),
  name: z.string(),
  mime: z.string(),
  size: z.number().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationSec: z.number().nullable(),
});

export const MediaListSchema = z.array(MediaFileSchema);

/** Las piezas leídas de la base con `media` ya tipado. */
export type PlannerItem = Omit<ContentItem, "media"> & { media: z.infer<typeof MediaListSchema> };

export function parseItemMedia(value: unknown) {
  const parsed = MediaListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
