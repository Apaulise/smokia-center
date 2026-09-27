import { z } from "zod";

import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson, type GroqJsonSchema } from "@/lib/groq/client";
import { getContentOS } from "./content-os";
import { buildRecommendationsUserPrompt } from "./prompts";
import type { BrandInsightsSummary } from "@/lib/brand/insights";
import type { PublishedHypothesis } from "@/lib/brand/planner/queries";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const RecommendationItemSchema = z.object({
  kind: z.enum(["REPETIR", "CORTAR", "PROBAR"]),
  objective: z.enum(["ALCANCE", "AUTORIDAD", "CONVERSION"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  evidenceSummary: z.string().min(1).max(300),
  postIds: z.array(z.string()),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])),
});

const RecommendationsOutputSchema = z.object({
  // SOC §29: la lectura del período, separada de qué duplicar/reducir/testear.
  // Viñetas cortas, no párrafos: esto se lee en una card, no en un informe. El
  // prompt pide que cada sección entre en 900 caracteres; el límite acá deja
  // margen para que un desvío del modelo no tire todo el análisis a la basura.
  knowns: z.string().min(1).max(1400),
  hypotheses: z.string().min(1).max(1400),
  unknowns: z.string().min(1).max(1400),
  recommendations: z.array(RecommendationItemSchema).min(1).max(10),
});

/**
 * `metrics` es un diccionario de claves abiertas: no entra en el modo
 * `strict` de Groq (Plans/migracion-fuera-de-anthropic.md, Etapa 1) — este es
 * el único de los 4 call sites de Groq que usa `strict: false`.
 */
const RECOMMENDATIONS_GROQ_SCHEMA: GroqJsonSchema = {
  type: "object",
  properties: {
    knowns: { type: "string" },
    hypotheses: { type: "string" },
    unknowns: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["REPETIR", "CORTAR", "PROBAR"] },
          objective: { type: "string", enum: ["ALCANCE", "AUTORIDAD", "CONVERSION"] },
          title: { type: "string" },
          body: { type: "string" },
          evidenceSummary: { type: "string" },
          postIds: { type: "array", items: { type: "string" } },
          metrics: { type: "object" },
        },
        required: ["kind", "objective", "title", "body", "evidenceSummary", "postIds", "metrics"],
      },
    },
  },
  required: ["knowns", "hypotheses", "unknowns", "recommendations"],
};

export interface GeneratedRecommendation {
  kind: "REPETIR" | "CORTAR" | "PROBAR";
  objective: "ALCANCE" | "AUTORIDAD" | "CONVERSION";
  title: string;
  body: string;
  evidence: { summary: string; postIds: string[]; metrics: Record<string, number | string> };
}

export interface GeneratedAnalysis {
  knowns: string;
  hypotheses: string;
  unknowns: string;
  recommendations: GeneratedRecommendation[];
}

function collectKnownPostIds(insights: BrandInsightsSummary): Set<string> {
  const ids = new Set<string>();
  for (const post of [...insights.topPosts, ...insights.bottomPosts]) ids.add(post.postId);
  for (const rows of [
    insights.bestTimes,
    insights.formatPerformance,
    insights.captionLength,
    insights.topHashtags,
    insights.retention.rows,
  ]) {
    for (const row of rows) for (const id of row.postIds) ids.add(id);
  }
  return ids;
}

/**
 * Único punto que le pide algo al modelo en esta fase (Plans/03 §3.5): lee
 * agregados ya calculados y devuelve qué repetir/cortar/probar. La aritmética
 * vive en lib/brand/insights/, nunca acá.
 *
 * El system prompt es el SOC completo (Plans/03 §3.10). Desde
 * Plans/migracion-fuera-de-anthropic.md (Etapa 1), corre en Groq en vez de
 * Claude Opus — *decidir* qué recomendar sigue yendo al modelo de mayor
 * criterio disponible gratis.
 */
export async function generateBrandRecommendations(params: {
  apiKey: string;
  platform: BrandPlatform;
  insights: BrandInsightsSummary;
  /** Piezas publicadas desde el planificador con hipótesis escrita (§3.7): lo que cierra el ciclo. */
  hypotheses?: PublishedHypothesis[];
}): Promise<GeneratedAnalysis> {
  const knownPostIds = collectKnownPostIds(params.insights);
  // Las piezas con hipótesis también se pueden citar como evidencia.
  for (const test of params.hypotheses ?? []) if (test.post_id) knownPostIds.add(test.post_id);

  const basePrompt = buildRecommendationsUserPrompt(params.platform, params.insights, params.hypotheses);

  const parsed = await resolveStructuredJson(RecommendationsOutputSchema, (repairNote) =>
    generateGroqJson({
      apiKey: params.apiKey,
      system: getContentOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: RECOMMENDATIONS_GROQ_SCHEMA,
      schemaName: "brand_recommendations",
      strict: false,
      // Bajado de 16000: reenviar el SOC completo sin caché en cada llamada
      // acerca la cuota de tokens/minuto de Groq (ver plan de migración,
      // Riesgos). Puede forzar recortar cuántas recomendaciones caben.
      maxTokens: 6000,
    }),
  );

  // El prompt prohíbe inventar postIds, pero se filtra igual: una
  // recomendación sin evidencia trazable es una opinión (Plans/03 §3.5), y
  // eso vale también si el modelo se equivoca.
  return {
    knowns: parsed.knowns,
    hypotheses: parsed.hypotheses,
    unknowns: parsed.unknowns,
    recommendations: parsed.recommendations.map((r) => ({
      kind: r.kind,
      objective: r.objective,
      title: r.title,
      body: r.body,
      evidence: {
        summary: r.evidenceSummary,
        postIds: r.postIds.filter((id) => knownPostIds.has(id)),
        metrics: r.metrics,
      },
    })),
  };
}
