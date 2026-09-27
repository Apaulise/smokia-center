import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type KnowledgeCollection = Database["public"]["Enums"]["lead_knowledge_collection"];
export type KnowledgeOrigin = Database["public"]["Enums"]["lead_knowledge_origin"];

/** Las seis colecciones del SPA §20/Plan §1.18. */
export const KNOWLEDGE_COLLECTIONS = [
  "OBJECIONES",
  "DOLORES",
  "ANGULOS",
  "SEGMENTOS",
  "MENSAJES",
  "APRENDIZAJES",
] as const satisfies readonly KnowledgeCollection[];

export const KNOWLEDGE_ORIGINS = ["PROPIO", "MERCADO", "HIPOTESIS"] as const satisfies readonly KnowledgeOrigin[];

export const COLLECTION_LABEL: Record<KnowledgeCollection, string> = {
  OBJECIONES: "Objeciones",
  DOLORES: "Dolores",
  ANGULOS: "Ángulos",
  SEGMENTOS: "Segmentos",
  MENSAJES: "Mensajes",
  APRENDIZAJES: "Aprendizajes",
};

/** Qué va en cada colección — se muestra en la pantalla y en la descripción de las tools del modelo. */
export const COLLECTION_HINT: Record<KnowledgeCollection, string> = {
  OBJECIONES: "Objeciones que se repiten entre leads, y qué funcionó para responderlas.",
  DOLORES: "Dolores confirmados que se repiten en un rubro o segmento — más allá de un lead puntual.",
  ANGULOS: "Qué ángulo comercial funciona mejor para qué tipo de negocio.",
  SEGMENTOS: "Patrones por rubro o tamaño de negocio: qué los caracteriza, qué les importa.",
  MENSAJES: "Frases o formas de preguntar que abrieron conversaciones.",
  APRENDIZAJES: "Conclusiones consolidadas después de varios leads — más allá de una hipótesis suelta.",
};

export const ORIGIN_LABEL: Record<KnowledgeOrigin, string> = {
  PROPIO: "Propio",
  MERCADO: "Mercado",
  HIPOTESIS: "Hipótesis",
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
  data: z.record(z.string(), z.unknown()).optional(),
  origin: z.enum(KNOWLEDGE_ORIGINS),
  tags: z.array(z.string().trim().min(1).max(TAG_MAX)).max(TAGS_MAX).optional(),
  lead_id: z.string().uuid().optional(),
};

export const NewKnowledgeInput = z.object({ collection: z.enum(KNOWLEDGE_COLLECTIONS), ...fields });
export type NewKnowledge = z.infer<typeof NewKnowledgeInput>;

/** La colección no cambia después de creada — mover algo de RADAR a otra colección es escribir otra nota. */
export const KnowledgePatchInput = z.object({
  title: fields.title.optional(),
  body: fields.body,
  data: fields.data,
  origin: fields.origin.optional(),
  tags: fields.tags,
  lead_id: fields.lead_id,
});
export type KnowledgePatch = z.infer<typeof KnowledgePatchInput>;
