import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type KnowledgeCollection = Database["public"]["Enums"]["brand_knowledge_collection"];
export type KnowledgeOrigin = Database["public"]["Enums"]["brand_knowledge_origin"];
export type KnowledgeStatus = Database["public"]["Enums"]["brand_knowledge_status"];

/** El orden es el de SOC §26, que es también el de las pestañas de la pantalla. */
export const KNOWLEDGE_COLLECTIONS = [
  "WINNERS",
  "LOSERS",
  "HOOKS",
  "FORMATOS",
  "TEMAS",
  "AUDIENCIA",
  "RADAR",
  "EXPERIMENTOS",
  "APRENDIZAJES",
] as const satisfies readonly KnowledgeCollection[];

export const KNOWLEDGE_ORIGINS = ["PROPIO", "MERCADO", "HIPOTESIS"] as const satisfies readonly KnowledgeOrigin[];
export const KNOWLEDGE_STATUSES = ["PENDIENTE", "ACTIVO", "CONCLUIDO"] as const satisfies readonly KnowledgeStatus[];

export const COLLECTION_LABEL: Record<KnowledgeCollection, string> = {
  WINNERS: "Ganadores",
  LOSERS: "Perdedores",
  HOOKS: "Hooks",
  FORMATOS: "Formatos",
  TEMAS: "Temas",
  AUDIENCIA: "Audiencia",
  RADAR: "Radar",
  EXPERIMENTOS: "Experimentos",
  APRENDIZAJES: "Aprendizajes",
};

/** Qué va en cada colección, tomado de SOC §26 — se muestra en la pantalla y en la descripción de las tools. */
export const COLLECTION_HINT: Record<KnowledgeCollection, string> = {
  WINNERS: "Piezas propias que ganaron: tema, hook, formato, ángulo, estructura, métricas, razón probable y variantes producidas.",
  LOSERS: "Ideas que fallaron: formato, hipótesis, métricas, posible causa y aprendizaje. Nunca se borran.",
  HOOKS: "Mecanismos de hook que funcionan específicamente para Agus.",
  FORMATOS: "Formatos testeados y cómo rindieron.",
  TEMAS: "Territorios testeados y cómo rindieron.",
  AUDIENCIA: "Comentarios, preguntas, objeciones, DMs anonimizados y temas recurrentes.",
  RADAR: "Ideas externas encontradas, todavía sin testear.",
  EXPERIMENTOS: "Hipótesis pendientes, activas y concluidas.",
  APRENDIZAJES: "Conclusiones consolidadas después de varios experimentos.",
};

export const ORIGIN_LABEL: Record<KnowledgeOrigin, string> = {
  PROPIO: "Propio",
  MERCADO: "Mercado",
  HIPOTESIS: "Hipótesis",
};

export const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  PENDIENTE: "Pendiente",
  ACTIVO: "Activo",
  CONCLUIDO: "Concluido",
};

export function isKnowledgeCollection(value: string | undefined): value is KnowledgeCollection {
  return KNOWLEDGE_COLLECTIONS.includes(value as KnowledgeCollection);
}

const TITLE_MAX = 200;
const BODY_MAX = 8000;
const TAG_MAX = 40;
const TAGS_MAX = 12;

const fields = {
  title: z.string().trim().min(1, "Ponele un título.").max(TITLE_MAX),
  body: z.string().trim().max(BODY_MAX).optional(),
  // Lo propio de cada colección (la ficha de RADAR de SOC §7, por ejemplo). Libre a propósito.
  data: z.record(z.string(), z.unknown()).optional(),
  origin: z.enum(KNOWLEDGE_ORIGINS),
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
  tags: z.array(z.string().trim().min(1).max(TAG_MAX)).max(TAGS_MAX).optional(),
  post_id: z.string().uuid().optional(),
  content_item_id: z.string().uuid().optional(),
};

export const NewKnowledgeInput = z.object({ collection: z.enum(KNOWLEDGE_COLLECTIONS), ...fields });
export type NewKnowledge = z.infer<typeof NewKnowledgeInput>;

/** La colección no cambia después de creada: mover una nota a otra colección es escribir otra. */
export const KnowledgePatchInput = z.object({
  title: fields.title.optional(),
  body: fields.body,
  data: fields.data,
  origin: fields.origin.optional(),
  status: fields.status,
  tags: fields.tags,
  post_id: fields.post_id,
  content_item_id: fields.content_item_id,
});
export type KnowledgePatch = z.infer<typeof KnowledgePatchInput>;
