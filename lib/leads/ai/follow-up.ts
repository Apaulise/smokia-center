import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildLeadStateBlock, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { FOLLOWUP_GROQ_SCHEMA, FollowUpSchema, type FollowUpOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";

/**
 * `generateFollowup()` (Plan §1.16, SPA §17): el mensaje se construye desde
 * el contexto histórico, nunca desde una plantilla. Si no puede citar algo
 * concreto de la conversación anterior, el esquema lo obliga a decirlo en vez
 * de inventar — un follow-up genérico gasta el único intento que quedaba.
 */
export async function generateFollowup(params: {
  apiKey: string;
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  notes: LeadNoteRow[];
}): Promise<FollowUpOutput> {
  const stateBlock = buildLeadStateBlock({
    salesProfile: params.salesProfile,
    lead: params.lead,
    enrichment: params.enrichment,
    memory: params.memory,
    signals: params.signals,
    notes: params.notes,
  });

  const basePrompt = `Escribí el mensaje de seguimiento (SPA §17): se construye desde lo que ya se habló, nunca desde una plantilla genérica tipo "quería hacer seguimiento". Citá algo concreto de la memoria del lead de abajo — el motivo del "ahora no", la oportunidad identificada, o algo puntual de los dolores u objeciones. Si no hay nada concreto para citar, no escribas el mensaje: dejá "message" en null y explicá qué falta en "cannot_generate_reason".\n\n${stateBlock}`;

  return resolveStructuredJson(FollowUpSchema, (repairNote) =>
    generateGroqJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: FOLLOWUP_GROQ_SCHEMA,
      schemaName: "lead_followup",
      maxTokens: 1500,
    }),
  );
}
