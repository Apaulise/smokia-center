import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { CONTENT_KINDS, CONTENT_OBJECTIVES, CAPTION_MAX_CHARS } from "@/lib/brand/planner/schema";

import { createAnthropicClient } from "./client";
import { getContentOS } from "./content-os";
import { buildOutlierIdeaPrompt } from "./prompts";

/*
 * El botón "Usar" de competencia (Plans/03 §3.14): un outlier ajeno → una
 * pieza propia lista para arrastrar a un día del planificador.
 *
 * Es Claude y no el modelo gratuito porque esto es lo que después se graba: la
 * hipótesis y el ángulo se notan. Pero no es Opus: una pieza por clic, a
 * pedido, no justifica el modelo más caro, así que corre en Sonnet.
 */
const MODEL = "claude-sonnet-5";

/** Los campos son exactamente los que el diálogo del planificador ya sabe editar (planner/schema.ts). */
const OutlierIdeaSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(CONTENT_KINDS),
  objective: z.enum(CONTENT_OBJECTIVES),
  hook: z.string().min(1).max(500),
  angle: z.string().min(1).max(500),
  hypothesis: z.string().min(1).max(1500),
  idea: z.string().min(1).max(8000),
  caption: z.string().max(CAPTION_MAX_CHARS),
  hashtags: z.array(z.string()).max(30),
});

export type GeneratedOutlierIdea = z.infer<typeof OutlierIdeaSchema>;

export interface OutlierIdeaInput {
  apiKey: string;
  username: string;
  displayName: string | null;
  kind: string;
  multiple: number;
  value: number;
  median: number;
  signalLabel: string;
  publishedAt: string | null;
  caption: string | null;
  permalink: string | null;
  ownContext: string;
}

export async function generateIdeaFromOutlier(input: OutlierIdeaInput): Promise<GeneratedOutlierIdea> {
  const client = createAnthropicClient(input.apiKey);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(OutlierIdeaSchema) },
    system: [{ type: "text", text: getContentOS(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildOutlierIdeaPrompt(input) }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude no devolvió una respuesta estructurada válida.");
  }
  return response.parsed_output;
}
