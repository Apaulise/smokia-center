import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { createAnthropicClient } from "./client";
import { getContentOS } from "./content-os";
import { buildRecommendationsUserPrompt } from "./prompts";
import type { BrandInsightsSummary } from "@/lib/brand/insights";
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
  // Viñetas cortas, no párrafos: esto se lee en una card, no en un informe.
  knowns: z.string().min(1).max(900),
  hypotheses: z.string().min(1).max(900),
  unknowns: z.string().min(1).max(900),
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
}): Promise<GeneratedAnalysis> {
  const client = createAnthropicClient(params.apiKey);
  const knownPostIds = collectKnownPostIds(params.insights);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(RecommendationsOutputSchema) },
    system: [{ type: "text", text: getContentOS(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildRecommendationsUserPrompt(params.platform, params.insights) }],
  });

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
