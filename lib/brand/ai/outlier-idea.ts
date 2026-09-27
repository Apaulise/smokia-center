import { z } from "zod";

import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGeminiJson, type GeminiSchema } from "@/lib/gemini/client";
import { CONTENT_KINDS, CONTENT_OBJECTIVES, CAPTION_MAX_CHARS } from "@/lib/brand/planner/schema";

import { getContentOS } from "./content-os";
import { buildOutlierIdeaPrompt } from "./prompts";

/*
 * El botón "Usar" de competencia (Plans/03 §3.14): un outlier ajeno → una
 * pieza propia lista para arrastrar a un día del planificador. Desde
 * Plans/migracion-fuera-de-anthropic.md (Etapa 1), Gemini en vez de Claude
 * Sonnet: una pieza por clic, a pedido, no justifica el modelo de mayor
 * criterio, y esto transforma un outlier ya identificado, no decide una
 * estrategia (Plan §1.7 / Plans/03, "Reparto de modelos").
 */

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

const OUTLIER_IDEA_GEMINI_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: CONTENT_KINDS },
    objective: { type: "string", enum: CONTENT_OBJECTIVES },
    hook: { type: "string" },
    angle: { type: "string" },
    hypothesis: { type: "string" },
    idea: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "kind", "objective", "hook", "angle", "hypothesis", "idea", "caption", "hashtags"],
};

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
  const basePrompt = buildOutlierIdeaPrompt(input);

  return resolveStructuredJson(OutlierIdeaSchema, (repairNote) =>
    generateGeminiJson({
      apiKey: input.apiKey,
      system: getContentOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: OUTLIER_IDEA_GEMINI_SCHEMA,
      maxOutputTokens: 8000,
    }),
  );
}
