import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import type { NextBestAction } from "@/lib/leads/ai/next-action";
import { buildConversationBlock, buildLeadStateBlock, type ConversationMessage, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { NEXT_REPLY_GROQ_SCHEMA, NextReplySchema, type NextReplyOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";

/** Instrucción puntual por acción — el "qué decir" queda acotado a lo que esa acción del SPA permite. */
const ACTION_INSTRUCTION: Record<"ASK_QUESTION" | "EXPLAIN_SERVICE" | "ASK_FOR_MEETING" | "CLOSE_LEAD", string> = {
  ASK_QUESTION:
    'Todavía no hay un dolor confirmado (SPA §3): seguí el orden de descubrimiento con UNA sola pregunta (SPA §9), construida sobre lo que el prospecto acaba de contestar — nunca una pregunta que ya podrías haber hecho antes de leerlo.',
  EXPLAIN_SERVICE:
    "Hay un dolor confirmado pero el interés todavía no llega a 5 — corresponde explicar quién sos (SPA §13), corto y concreto, usando sólo el perfil del vendedor de abajo. No afirmes experiencia, clientes ni resultados que no estén ahí.",
  ASK_FOR_MEETING:
    'Se cumplen las tres condiciones del SPA §14 a la vez (dolor confirmado, respuesta humana, interés ≥ 5): pedí la llamada de diagnóstico, corta y sin presión, dejando la salida de "si vemos que no, no pasa nada" (SPA §14).',
  CLOSE_LEAD:
    "El interés llegó a 9 o 10 (SPA §11): el prospecto ya está pidiendo una llamada o una propuesta. Proponé el paso concreto para avanzar, directo, sin volver a calificar ni a preguntar lo que ya se sabe.",
};

/**
 * Respaldo determinístico (Plan §1.12/§1.14): `analyzeLeadResponse()` puede
 * volver `suggested_reply.has_reply = false` en el mismo turno en que
 * `computeNextBestAction()` (next-action.ts) ya decidió en TypeScript que sí
 * corresponde responder — por ejemplo `EXPLAIN_SERVICE` con un dolor recién
 * confirmado. Mismo principio que la condición de `ASK_FOR_MEETING`: si
 * corresponde responder no es una pregunta que se le deje al criterio del
 * modelo en la misma corrida que recién está leyendo la respuesta. Esta
 * segunda llamada, sólo cuando hace falta, recibe la acción ya resuelta y
 * escribe el mensaje para esa acción puntual — nunca elige ella misma qué
 * acción corresponde.
 */
export async function generateNextReply(params: {
  apiKey: string;
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  notes: LeadNoteRow[];
  nextAction: NextBestAction;
  whatHappened: string;
  /** El hilo completo, ya con la respuesta nueva — para no repetir preguntas ya hechas. */
  conversation: ConversationMessage[];
}): Promise<NextReplyOutput> {
  const stateBlock = buildLeadStateBlock({
    salesProfile: params.salesProfile,
    lead: params.lead,
    enrichment: params.enrichment,
    memory: params.memory,
    signals: params.signals,
    notes: params.notes,
  });

  const instruction = ACTION_INSTRUCTION[params.nextAction.action as keyof typeof ACTION_INSTRUCTION];
  const basePrompt = `El prospecto acaba de contestar: "${params.whatHappened}"\n\nLa próxima acción ya está decidida — ${params.nextAction.action}: ${params.nextAction.reason}\n\nEscribí el mensaje para esa acción puntual: ${instruction}\n\n${buildConversationBlock(params.conversation)}\n\n${stateBlock}`;

  return resolveStructuredJson(NextReplySchema, (repairNote) =>
    generateGroqJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: NEXT_REPLY_GROQ_SCHEMA,
      schemaName: "lead_next_reply",
      maxTokens: 1500,
    }),
  );
}
