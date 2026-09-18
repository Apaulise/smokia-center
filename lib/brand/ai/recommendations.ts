import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { createAnthropicClient } from "./client";
import { buildRecommendationsSystemPrompt, buildRecommendationsUserPrompt } from "./prompts";
import type { BrandInsightsSummary } from "@/lib/brand/insights";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const RecommendationItemSchema = z.object({
  kind: z.enum(["REPETIR", "CORTAR", "PROBAR"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  evidenceSummary: z.string().min(1).max(300),
  postIds: z.array(z.string()),
  metrics: z.record(z.string(), z.union([z.number(), z.string()])),
});

const RecommendationsOutputSchema = z.object({
  recommendations: z.array(RecommendationItemSchema).min(1).max(10),
});

export interface GeneratedRecommendation {
  kind: "REPETIR" | "CORTAR" | "PROBAR";
  title: string;
  body: string;
  evidence: { summary: string; postIds: string[]; metrics: Record<string, number | string> };
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
 */
export async function generateBrandRecommendations(params: {
  apiKey: string;
  platform: BrandPlatform;
  insights: BrandInsightsSummary;
}): Promise<GeneratedRecommendation[]> {
  const client = createAnthropicClient(params.apiKey);
  const knownPostIds = collectKnownPostIds(params.insights);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(RecommendationsOutputSchema) },
    system: buildRecommendationsSystemPrompt(),
    messages: [{ role: "user", content: buildRecommendationsUserPrompt(params.platform, params.insights) }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude no devolvió una respuesta estructurada válida.");
  }

  // El system prompt prohíbe inventar postIds, pero se filtra igual: una
  // recomendación sin evidencia trazable es una opinión (Plans/03 §3.5), y
  // eso vale también si el modelo se equivoca.
  return response.parsed_output.recommendations.map((r) => ({
    kind: r.kind,
    title: r.title,
    body: r.body,
    evidence: {
      summary: r.evidenceSummary,
      postIds: r.postIds.filter((id) => knownPostIds.has(id)),
      metrics: r.metrics,
    },
  }));
}
