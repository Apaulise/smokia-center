import { z } from "zod";

import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGeminiJson, type GeminiSchema } from "@/lib/gemini/client";
import type { ContentKind, ContentObjective } from "@/lib/brand/planner/schema";

import { getContentOS } from "./content-os";
import { buildScriptPrompt } from "./prompts";

/*
 * El botón "Generar guion" del diálogo de la pieza (Plans/03 §3.7): la idea
 * cargada → el guion para grabarla. Desde
 * Plans/migracion-fuera-de-anthropic.md (Etapa 1), Gemini en vez de Claude
 * Sonnet: un guion por clic, a pedido, es transformar una idea que ya existe
 * en texto, no decidir qué decir (Plan §1.7 / Plans/03, "Reparto de modelos").
 */

const ScriptSchema = z.object({
  script: z.string().min(1).max(20_000),
  /** Una objeción a la idea (SOC §24), o vacío si no hay nada que objetar. */
  caveat: z.string().max(800),
});

const SCRIPT_GEMINI_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    script: { type: "string" },
    caveat: { type: "string" },
  },
  required: ["script", "caveat"],
};

export interface GeneratedScript {
  script: string;
  caveat: string | null;
}

export interface ScriptInput {
  apiKey: string;
  title: string;
  kind: ContentKind;
  objective: ContentObjective | null;
  hypothesis: string | null;
  hook: string | null;
  angle: string | null;
  idea: string;
  ownContext: string;
}

export async function generateScriptFromIdea({ apiKey, ...piece }: ScriptInput): Promise<GeneratedScript> {
  const basePrompt = buildScriptPrompt(piece);

  const parsed = await resolveStructuredJson(ScriptSchema, (repairNote) =>
    generateGeminiJson({
      apiKey,
      system: getContentOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: SCRIPT_GEMINI_SCHEMA,
      maxOutputTokens: 8000,
    }),
  );

  return { script: parsed.script.trim(), caveat: parsed.caveat.trim() || null };
}
