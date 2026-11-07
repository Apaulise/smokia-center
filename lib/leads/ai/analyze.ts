import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateMaasJson } from "@/lib/huawei-maas/client";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildConversationBlock, buildLeadStateBlock, type ConversationMessage, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { ANALYZE_MAAS_SCHEMA, AnalyzeOutputSchema, type AnalyzeOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";

/**
 * `analyzeLeadResponse()` (Plan §1.12): el corazón del copiloto. Desde
 * DeepSeek-V4.1-Flash-1017 en Huawei Cloud MaaS ejecuta el mismo Sistema de
 * Prospección canónico con razonamiento high.
 * Salida estructurada con exactamente la forma del SPA §29.
 *
 * Un solo llamado, sin herramientas: a diferencia del chat de Marca
 * (lib/brand/ai/chat.ts), acá no hay una conversación visible turno a turno
 * donde el usuario vea qué está buscando o guardando el modelo — el SPA §22
 * pide un panel que **renderiza** la memoria, no un chat. Escribir en la
 * memoria global de ventas (§1.18) queda como una decisión humana desde el
 * panel, con lo que este análisis propone a la vista, no una escritura
 * autónoma del modelo sin que se vea qué escribió.
 */
export async function analyzeLeadResponse(params: {
  apiKey: string;
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  notes: LeadNoteRow[];
  /** El hilo previo (sin la respuesta nueva, que todavía no se guardó) — la respuesta se lee contra lo que se le preguntó. */
  conversation: ConversationMessage[];
  /** El texto pegado por el usuario (SPA §23) — "Pegá la respuesta del lead". */
  responseText: string;
}): Promise<AnalyzeOutput> {
  const stateBlock = buildLeadStateBlock({
    salesProfile: params.salesProfile,
    lead: params.lead,
    enrichment: params.enrichment,
    memory: params.memory,
    signals: params.signals,
    notes: params.notes,
  });

  // El estado variable del turno se concatena al prompt de usuario para que
  // el system prompt canónico permanezca estable y reutilizable.
  const basePrompt = `El prospecto contestó. Analizá la respuesta siguiendo el SPA §10: quién contestó (autorespuesta o una persona — nunca trates una autorespuesta como interés), qué estaba haciendo, qué se aprendió del negocio que no se sabía antes, si apareció un dolor y con qué evidencia (una cita textual si la hay — sin cita no confirma nada), si apareció un disparador, y el nivel de interés (0–10, sé conservador: SPA §11). Si corresponde, proponé la próxima pregunta — una sola (SPA §9) — o decidí que todavía no corresponde responder.\n\nLeé la respuesta como contestación al último mensaje del VENDEDOR en la conversación de abajo, no suelta. Si el prospecto está contestando la pregunta que se le hizo, eso es información sobre cómo trabajan (y puede confirmar o descartar un dolor, con esa cita como evidencia) — nunca una objeción ni un "ahora no" (SPA §16). Marcá not_now sólo si el prospecto pospone explícitamente seguir hablando con el vendedor ("escribime en un mes", "ahora no puedo"), no porque sus palabras coincidan con las de la pregunta. Cuando contestó la pregunta, la próxima pregunta sugerida tiene que construirse sobre esa respuesta.\n\n${buildConversationBlock(params.conversation)}\n\nRespuesta nueva del prospecto (a analizar):\n"""\n${params.responseText.trim()}\n"""\n\n${stateBlock}`;

  return resolveStructuredJson(AnalyzeOutputSchema, (repairNote) =>
    generateMaasJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: ANALYZE_MAAS_SCHEMA,
      schemaName: "analyze_lead_response",
      maxTokens: 8192,
    }),
  );
}
