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
          : "No hubo respuesta desde entonces."
      }`
    : params.contacts.length > 0
      ? `No hay mensajes con texto en el hilo, pero sí un contacto registrado a mano${age} (ver "Contactos registrados"): el vendedor ya le escribió por fuera de la app. Partí de lo que se sabe del negocio; no menciones cuánto pasó.`
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

  // Sin respuesta desde el último mensaje del vendedor (o sólo hay contactos a mano): no es un
  // "volver como habíamos quedado" sino un empujón corto para retomar la charla.
  const isNudge = !last || last.sender === "VENDEDOR";

  // Cuántos seguimientos ya se mandaron sin respuesta (desde el último mensaje del prospecto).
  const lastLeadIdx = thread.map((m) => m.sender).lastIndexOf("LEAD");
  const followUpsSent = thread.slice(lastLeadIdx + 1).filter((m) => m.sender === "VENDEDOR" && m.kind === "SEGUIMIENTO").length;
  const step = followUpsSent + 1;

  const stepBlock =
    step >= 3
      ? `Este es el seguimiento Nº ${step}: el último. Ya insististe dos veces, así que ahora el mensaje es un cierre amable que le da permiso de decir que no. Idea: si no le interesa o no es el momento, no hay problema, que te avise y no lo volvés a contactar; y si sí le interesa, que te diga cuando pueda. Mencioná en media frase el tema de tu último mensaje para que se entienda de qué hablás, sin repetir la pregunta. Tono cálido, sin culpa ni drama.`
      : `Este es el seguimiento Nº ${step}${step === 1 ? " (el primero)" : ""}: todavía NO es el cierre. Retomá el tema de tu último mensaje cambiando el ángulo: una re-pregunta, una versión más concreta o más chica de la misma duda, o un ejemplo cotidiano de la situación que preguntaste. Tiene que sonar como alguien que sigue pensando en el tema, no como alguien que pregunta si todavía le interesa.`;

  const nudgePrompt = `Escribí un mensaje de retoma para un prospecto que NO respondió. El objetivo es reabrir la charla con naturalidad y averiguar si hay interés (puede que se le pasó el mensaje, que no tuvo tiempo, o que te dejó en visto). No es un pitch ni una venta.

${stepBlock}

Cómo se hace:
- Partí del tema del ÚLTIMO mensaje del VENDEDOR (está en la conversación) y retomalo desde otro lado. Ejemplo: si preguntaste si vuelven a contactar a quien consultó y no reservó, podés preguntar qué pasa en la práctica con esas personas, o si a veces se les pierde alguna entre tantos mensajes.
- Natural y cálido, como un mensaje de una persona real. Entre 2 y 4 frases, unos 150 a 300 caracteres. Rioplatense, sin emojis.
- Una sola pregunta, abierta pero fácil de contestar.

Prohibido:
- Preguntas de cierre secas tipo "¿Seguís interesados?", "¿Prefieren que lo deje por ahora?" o "¿Te interesa?" (salvo en el cierre del seguimiento Nº 3 o más, y ahí con calidez).
- Contar cuánto pasó ("hace 8 días", "hace unos días") o decir "te escribí por WhatsApp".
- Copiar o citar entre comillas la pregunta anterior.
- Reprochar el silencio ("no me respondiste", "supongo que estás ocupado").
- Hablar de herramientas, registros o "una idea que te puedo compartir": es un segundo pitch.
- Empezar con "Hola, ¿cómo estás?" o "quería hacer seguimiento".

Si hay notas del vendedor, memoria o un contacto registrado con detalle, usalos para elegir el ángulo. Sólo si no sabés NADA del negocio ni del contacto, dejá "message" en null y explicá qué falta en "cannot_generate_reason".

${lastLine}\n\n${stateBlock}${contactsBlock}\n\n${buildConversationBlock(params.conversation)}${buildStyleBlock(params.styleExamples, params.leadId)}`;

  const basePrompt = isNudge
    ? nudgePrompt
    : `Escribí el mensaje de seguimiento (SPA §17): se construye desde lo que ya se habló, nunca desde una plantilla genérica tipo "quería hacer seguimiento". Usá toda la información de abajo — la conversación, los contactos registrados, las notas del vendedor, la memoria y el enriquecimiento del negocio — y partí del último contacto. Citá algo concreto: lo último que se dijo, el motivo del "ahora no", un dolor u objeción, o algo puntual y verificado del negocio. Si hubo un contacto registrado pero sin detalle, no inventes qué se habló: referite a él de forma general y apoyate en algo verificado del negocio para aportar valor o hacer una pregunta. Aportá algo nuevo en vez de insistir con lo mismo. Sólo si no existe ningún contacto ni nota ni dato del negocio, no escribas el mensaje: dejá "message" en null y explicá qué falta en "cannot_generate_reason".\n\n${lastLine}\n\n${stateBlock}${contactsBlock}\n\n${buildConversationBlock(params.conversation)}${buildStyleBlock(params.styleExamples, params.leadId)}`;

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
