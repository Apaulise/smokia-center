import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { createAnthropicClient } from "./client";
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
 * El system prompt es el SOC completo (Plans/03 §3.10) — reemplaza al
 * "analista de contenido" improvisado que había antes.
 */
export async function generateBrandRecommendations(params: {
  apiKey: string;
  platform: BrandPlatform;
  insights: BrandInsightsSummary;
  /** Piezas publicadas desde el planificador con hipótesis escrita (§3.7): lo que cierra el ciclo. */
  hypotheses?: PublishedHypothesis[];
}): Promise<GeneratedAnalysis> {
  const client = createAnthropicClient(params.apiKey);
  const knownPostIds = collectKnownPostIds(params.insights);
  // Las piezas con hipótesis también se pueden citar como evidencia.
  for (const test of params.hypotheses ?? []) if (test.post_id) knownPostIds.add(test.post_id);

  const request = {
    model: "claude-opus-5" as const,
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    output_config: { effort: "high" as const, format: zodOutputFormat(RecommendationsOutputSchema) },
    system: [{ type: "text" as const, text: getContentOS(), cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: buildRecommendationsUserPrompt(params.platform, params.insights, params.hypotheses) }],
  };

  // El límite de 900 caracteres por sección es una instrucción, no algo que
  // Anthropic fuerce: a veces el modelo se pasa (§29 con muchas hipótesis
  // para cerrar) y la validación del schema tira todo el análisis. Un solo
  // reintento alcanza en la práctica y evita perder la corrida por eso.
  let response;
  try {
    response = await client.messages.parse(request);
  } catch (error) {
    if (!(error instanceof Anthropic.AnthropicError) || !error.message.startsWith("Failed to parse structured output")) {
      throw error;
    }
    response = await client.messages.parse(request);
  }

  if (!response.parsed_output) {
    throw new Error("Claude no devolvió una respuesta estructurada válida.");
  }

  // El prompt prohíbe inventar postIds, pero se filtra igual: una
  // recomendación sin evidencia trazable es una opinión (Plans/03 §3.5), y
  // eso vale también si el modelo se equivoca.
  return {
    knowns: response.parsed_output.knowns,
    hypotheses: response.parsed_output.hypotheses,
    unknowns: response.parsed_output.unknowns,
    recommendations: response.parsed_output.recommendations.map((r) => ({
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
