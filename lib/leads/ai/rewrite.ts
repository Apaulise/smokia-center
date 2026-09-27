import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGeminiJson } from "@/lib/gemini/client";
import type { RewriteTone } from "@/lib/leads/ai/rewrite-tones";
import { REWRITE_GEMINI_SCHEMA, RewriteSchema } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";

/**
 * Reescrituras de tono (Plan §1.15, SPA §24): `MÁS CORTO`, `MÁS INFORMAL`,
 * `MÁS DIRECTO`. Va a Gemini, no Groq — transformar un texto que ya existe no
 * es decidir qué decir (Plan §1.7, "Reparto de modelos"; migrado en
 * Plans/migracion-fuera-de-anthropic.md, Etapa 1). La lista de tonos vive
 * en `rewrite-tones.ts`, sin dependencias de servidor (ver ese archivo).
 */

const TONE_INSTRUCTION: Record<RewriteTone, string> = {
  MAS_CORTO: "Hacelo más corto: la mitad de largo o menos, sin perder la pregunta ni el contexto esencial.",
  MAS_INFORMAL: "Hacelo más informal y cercano, como si se lo escribieras a un conocido — sin perder respeto.",
  MAS_DIRECTO: "Hacelo más directo: menos rodeos antes de la pregunta o el punto central.",
};

/**
 * `rewriteMessage()`: toma un mensaje ya escrito (por el modelo o a mano) y lo
 * reescribe con un solo cambio de tono. No inventa contenido nuevo — el
 * Sistema de Prospección sigue en `system` para que el resultado no se salga
 * de las reglas de estilo (SPA §18), pero el pedido es puntual.
 */
export async function rewriteMessage(params: { apiKey: string; message: string; tone: RewriteTone }): Promise<string> {
  const basePrompt = `Reescribí este mensaje. ${TONE_INSTRUCTION[params.tone]} No agregues información nueva ni cambies lo que pregunta o propone — sólo el tono y el largo.\n\nMensaje original:\n"""\n${params.message.trim()}\n"""`;

  const parsed = await resolveStructuredJson(RewriteSchema, (repairNote) =>
    generateGeminiJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: REWRITE_GEMINI_SCHEMA,
      maxOutputTokens: 1000,
    }),
  );
  return parsed.message;
}
