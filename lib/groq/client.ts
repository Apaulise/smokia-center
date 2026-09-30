/**
 * Cliente HTTP crudo contra la API de Groq — sin SDK, espejo de
 * lib/gemini/client.ts y lib/meta/client.ts (la convención del repo para
 * proveedores free-tier). API compatible con OpenAI Chat Completions.
 *
 * Existe para lo que hoy exige más criterio (Plans/migracion-fuera-de-anthropic,
 * Etapa 1): decidir qué escribirle a un lead, o qué recomendar sobre un
 * período de contenido. La key viaja en el header `authorization`, nunca en
 * la URL ni en un log.
 */

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

/** Confirmar en console.groq.com/docs/models antes de asumir que sigue vigente — el catálogo free de Groq rota. */
export const GROQ_MODEL = "openai/gpt-oss-120b";

export type GroqJsonSchema = Record<string, unknown>;

async function groqErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // el cuerpo no era JSON — se informa sólo el status
  }
  return `status ${response.status}`;
}

export interface GroqJsonParams {
  apiKey: string;
  system: string;
  prompt: string;
  schema: GroqJsonSchema;
  /** Groq lo exige en response_format.json_schema.name. */
  schemaName: string;
  /** true (default): constrained decoding real — exige additionalProperties:false y TODO en required. false: "best-effort", para shapes con diccionario abierto (ver recommendations.ts). */
  strict?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * gpt-oss (20B/120B) es un modelo de razonamiento: gasta tokens en
   * razonamiento oculto ANTES de escribir la respuesta, del mismo
   * `maxTokens` — un valor bajo corta la generación a mitad del JSON y Groq
   * devuelve "Failed to validate JSON" aunque el schema esté bien (confirmado
   * en la verificación manual, console.groq.com/docs/reasoning). `"low"` por
   * default: en un llamado de una sola pasada sin conversación visible, ese
   * razonamiento no se muestra a nadie — dejarle más presupuesto al texto que
   * sí importa es la prioridad, no la profundidad del razonamiento.
   */
  reasoningEffort?: "low" | "medium" | "high";
}

/** Igual contrato que generateGeminiJson: devuelve texto crudo sin parsear — lo valida quien llama, con Zod (CLAUDE.md §5). */
export async function generateGroqJson(params: GroqJsonParams): Promise<string> {
  const model = params.model ?? GROQ_MODEL;
  const response = await fetch(GROQ_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: params.schemaName, strict: params.strict ?? true, schema: params.schema },
      },
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 4000,
      // reasoning_effort sólo lo soportan los modelos gpt-oss — Groq rechaza
      // el parámetro en cualquier otro modelo (400).
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: params.reasoningEffort ?? "low" } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Groq rechazó la consulta (${await groqErrorMessage(response)})`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Groq devolvió una respuesta vacía.");
  return text;
}
