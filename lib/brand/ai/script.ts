import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { ContentKind, ContentObjective } from "@/lib/brand/planner/schema";

import { createAnthropicClient } from "./client";
import { getContentOS } from "./content-os";
import { buildScriptPrompt } from "./prompts";

/*
 * El botón "Generar guion" del diálogo de la pieza (Plans/03 §3.7): la idea
 * cargada → el guion para grabarla.
 *
 * Mismo criterio de modelo que `outlier-idea.ts`: Claude y no el modelo
 * gratuito, porque esto es lo que después se graba y ahí se nota la diferencia
 * entre un guion propio y uno de plantilla; y Sonnet y no Opus, porque es un
 * guion por clic, a pedido.
 */
const MODEL = "claude-sonnet-5";

const ScriptSchema = z.object({
  script: z.string().min(1).max(20_000),
  /** Una objeción a la idea (SOC §24), o vacío si no hay nada que objetar. */
  caveat: z.string().max(800),
});

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
  const client = createAnthropicClient(apiKey);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ScriptSchema) },
    system: [{ type: "text", text: getContentOS(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildScriptPrompt(piece) }],
  });

  if (!response.parsed_output) {
    throw new Error("Claude no devolvió una respuesta estructurada válida.");
  }
  const { script, caveat } = response.parsed_output;
  return { script: script.trim(), caveat: caveat.trim() || null };
}
