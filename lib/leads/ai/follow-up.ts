import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildConversationBlock, buildLeadStateBlock, type ConversationMessage, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { FOLLOWUP_GROQ_SCHEMA, FollowUpSchema, type FollowUpOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import { buildStyleBlock, type StyleExample } from "@/lib/leads/ai/style/examples";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";

type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

/**
 * `generateFollowup()` (Plan §1.16, SPA §17): el mensaje se construye desde
 * el contexto histórico, nunca desde una plantilla. Si no puede citar algo
 * concreto de la conversación anterior, el esquema lo obliga a decirlo en vez
 * de inventar — un follow-up genérico gasta el único intento que quedaba.
 */
export async function generateFollowup(params: {
  apiKey: string;
  leadId: string;
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  notes: LeadNoteRow[];
  conversation: ConversationMessage[];
  /** Contactos registrados a mano (WhatsApp, llamada, email, reunión), del más nuevo al más viejo. */
  contacts: Pick<LeadActivityRow, "type" | "content" | "occurred_at">[];
  /** Días desde el último mensaje del hilo (enviado o recibido); `null` si no hay ninguno. */
  daysSinceLastMessage: number | null;
  /** Borradores anteriores que el vendedor reescribió a mano (los de este lead primero). */
  styleExamples: StyleExample[];
}): Promise<FollowUpOutput> {
  const stateBlock = buildLeadStateBlock({
    salesProfile: params.salesProfile,
    lead: params.lead,
    enrichment: params.enrichment,
    memory: params.memory,
    signals: params.signals,
    notes: params.notes,
  });

  const thread = params.conversation.filter((m) => m.sender === "LEAD" || m.confirmed);
  const last = thread[thread.length - 1];
  const age = params.daysSinceLastMessage !== null ? `, hace ${params.daysSinceLastMessage} día(s)` : "";
  const lastLine = last
    ? `El último mensaje del hilo lo escribió ${last.sender === "LEAD" ? "el PROSPECTO" : "el VENDEDOR"}${age}. ${
        last.sender === "LEAD"
          ? "Retomá desde lo que dijo él: respondé o avanzá sobre eso."
          : "No hubo respuesta desde entonces: retomá sin reprochar el silencio ni repetir el mensaje anterior."
      }`
    : params.contacts.length > 0
      ? `No hay mensajes con texto en el hilo, pero sí un contacto registrado a mano${age} (ver "Contactos registrados"): el vendedor ya habló con él por fuera de la app. Partí de ese contacto y de lo que se sabe del negocio.`
      : "No hay mensajes registrados en el hilo (el contacto pudo ser por fuera de la app): apoyate en las notas, la memoria y el enriquecimiento.";

  const contactsBlock =
    params.contacts.length === 0
      ? ""
      : `\n\n## Contactos registrados a mano (más nuevo primero)\n${params.contacts
          .slice(0, 8)
          .map(
            (c) =>
              `  - [${new Date(c.occurred_at).toLocaleDateString("es-AR")}] ${c.type}${c.content?.trim() ? `: ${c.content.trim()}` : " (sin detalle de qué se habló)"}`,
          )
          .join("\n")}`;

  const basePrompt = `Escribí el mensaje de seguimiento (SPA §17): se construye desde lo que ya se habló, nunca desde una plantilla genérica tipo "quería hacer seguimiento". Usá toda la información de abajo — la conversación, los contactos registrados, las notas del vendedor, la memoria y el enriquecimiento del negocio — y partí del último contacto. Citá algo concreto: lo último que se dijo, el motivo del "ahora no", un dolor u objeción, o algo puntual y verificado del negocio. Si hubo un contacto registrado pero sin detalle, no inventes qué se habló: referite a él de forma general (por ejemplo "te escribí hace unos días por WhatsApp") y apoyate en algo verificado del negocio para aportar valor o hacer una pregunta. Aportá algo nuevo en vez de insistir con lo mismo. Sólo si no existe ningún contacto ni nota ni dato del negocio, no escribas el mensaje: dejá "message" en null y explicá qué falta en "cannot_generate_reason".\n\n${lastLine}\n\n${stateBlock}${contactsBlock}\n\n${buildConversationBlock(params.conversation)}${buildStyleBlock(params.styleExamples, params.leadId)}`;

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
