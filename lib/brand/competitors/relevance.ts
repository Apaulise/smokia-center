import { z } from "zod";

import { getContentOS } from "@/lib/brand/ai/content-os";
import { RELEVANCE_MIN } from "@/lib/brand/competitors/insights";
import { generateGeminiJson, type GeminiSchema } from "@/lib/gemini/client";

import { KIND_LABEL } from "@/lib/brand/planner/schema";

/*
 * Qué tan aprovechable es una publicación ajena PARA ESTA MARCA (Plans/03
 * §3.14). El corte de §3.8 era puramente numérico, así que entraba cualquier
 * cosa que hubiera explotado — autos, lifestyle — aunque no tuviera nada que
 * ver con el nicho.
 *
 * Lo resuelve el modelo barato (Gemini, free tier) y no Claude: es una
 * clasificación, no una pieza de contenido. El criterio no se escribe acá: el
 * system prompt es el Sistema Operativo de Contenido, que ya define el nicho y
 * la voz. Mantener además una lista de palabras clave sería una segunda
 * definición del nicho que se desincroniza con la primera.
 */

/** Cuántas piezas entran en una misma llamada. Más que esto y la respuesta se corta. */
export const RELEVANCE_BATCH_MAX = 25;

// Se reexporta para quien ya lo importaba de acá; el valor vive con los otros
// umbrales editoriales, en insights.ts.
export { RELEVANCE_MIN };

/** Del caption sólo interesa el arranque: el gancho y el mecanismo están ahí, no en los hashtags. */
const CAPTION_MAX_CHARS = 600;

export interface RelevanceCandidate {
  id: string;
  /** null en lo descubierto por la API de Meta, que no devuelve el autor. */
  username: string | null;
  kind: keyof typeof KIND_LABEL;
  caption: string | null;
  publishedAt: string | null;
  /** Cuántas veces la mediana de su propia cuenta. Contexto, no criterio: el número ya lo calculó el código. */
  multiple: number;
}

export interface RelevanceVerdict {
  id: string;
  score: number;
  reason: string;
}

const OutputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().int().min(0).max(100),
        reason: z.string().max(300),
      }),
    )
    .default([]),
});

/** El esquema como lo entiende Gemini (subconjunto de OpenAPI, no el de Zod). */
const GEMINI_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["id", "score", "reason"],
      },
    },
  },
  required: ["items"],
};

const INSTRUCTIONS = `Sos el clasificador de un panel de contenido. Arriba tenés el Sistema Operativo de Contenido de la marca: ahí está su nicho, su público y su criterio editorial.

Te paso publicaciones de OTRAS cuentas que rindieron muy por encima de lo normal de su propia cuenta. Para cada una, puntuá de 0 a 100 qué tan aprovechable es PARA ESTA MARCA.

Cómo puntuar:
- Lo que se copia es el MECANISMO (el gancho, la estructura, el formato, la promesa, el llamado a la acción), no el tema. Una pieza de otro rubro con un mecanismo que esta marca podría usar tal cual puntúa alto.
- Puntuá bajo lo que sólo funciona por el tema, por la cara o por la vida personal de quien lo publicó, y lo que esta marca no podría publicar sin dejar de ser ella misma.
- El múltiplo que te paso es contexto, no criterio: que haya explotado ya está dado por descontado.

Devolvé un objeto con "items": un elemento por publicación, con su "id" exacto tal como te lo paso, el "score" entero de 0 a 100, y un "reason" de una frase de menos de 140 caracteres, en español rioplatense, que diga qué mecanismo se podría usar (o por qué no sirve).`;

function formatCandidate(candidate: RelevanceCandidate): string {
  const caption = (candidate.caption ?? "").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX_CHARS);
  return [
    `id: ${candidate.id}`,
    `cuenta: ${candidate.username ? `@${candidate.username}` : "(no disponible)"}`,
    `formato: ${KIND_LABEL[candidate.kind]}`,
    `múltiplo de su mediana: ${candidate.multiple.toFixed(1)}×`,
    candidate.publishedAt ? `fecha: ${candidate.publishedAt.slice(0, 10)}` : null,
    `texto: ${caption || "(sin texto)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Clasifica un lote en UNA sola llamada. Nunca lanza: si Gemini falla, la key
 * no sirve o la respuesta no valida, devuelve [] y las filas quedan sin
 * clasificar — sin dato no se esconde nada, que es el default correcto.
 */
export async function classifyRelevance(params: {
  apiKey: string;
  candidates: RelevanceCandidate[];
}): Promise<RelevanceVerdict[]> {
  const candidates = params.candidates.slice(0, RELEVANCE_BATCH_MAX);
  if (candidates.length === 0) return [];

  let raw: string;
  try {
    raw = await generateGeminiJson({
      apiKey: params.apiKey,
      system: getContentOS(),
      prompt: `${INSTRUCTIONS}\n\nPublicaciones:\n\n${candidates.map(formatCandidate).join("\n\n---\n\n")}`,
      schema: GEMINI_SCHEMA,
    });
  } catch (error) {
    console.error("No se pudo clasificar la relevancia:", error instanceof Error ? error.message : error);
    return [];
  }

  let parsed: z.infer<typeof OutputSchema>;
  try {
    parsed = OutputSchema.parse(JSON.parse(raw));
  } catch {
    console.error("Gemini devolvió una clasificación con una forma inesperada.");
    return [];
  }

  // Un id que no se pidió es un id inventado: se descarta en vez de escribirlo.
  const asked = new Set(candidates.map((candidate) => candidate.id));
  return parsed.items
    .filter((item) => asked.has(item.id))
    .map((item) => ({ id: item.id, score: item.score, reason: item.reason.trim().slice(0, 300) }));
}
