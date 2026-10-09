import { ANGLE_LABEL, ANGLE_RULE, type SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult, WebPresenceStatus } from "@/lib/leads/ai/enrich";
import type { LeadMessageRow, LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";

/**
 * El "bloque de estado" del copiloto (Plan §1.7): perfil del vendedor, estado
 * del lead, memoria y conteo de ángulos. Viaja como mensaje `{ role: "system" }`
 * DESPUÉS del turno del usuario — no en el `system` cacheado de arriba, que es
 * el Sistema de Prospección completo — porque cambia en cada llamada.
 */

export interface LeadContext {
  name: string;
  industryName: string | null;
  city: string | null;
  status: string;
  interestLevel: number | null;
}

/** Fila de `leads` (con el rubro resuelto) → el contexto que reciben los prompts. */
export function toLeadContext(lead: {
  name: string;
  status: string;
  interest_level: number | null;
  city: string | null;
  industries: { name: string } | null;
}): LeadContext {
  return {
    name: lead.name,
    industryName: lead.industries?.name ?? null,
    city: lead.city,
    status: lead.status,
    interestLevel: lead.interest_level,
  };
}

export interface LeadMemory {
  business_context?: string;
  current_process?: string;
  pain_points?: string[];
  objections?: string[];
  buying_signals?: string[];
  tools_used?: string[];
  key_quotes?: string[];
  timing?: string;
  next_action?: string;
}

/** SPA §8 no lo pide, pero es un HECHO citable como cualquier señal de tecnología cuando está confirmado — nunca en SIN_VERIFICAR. */
const WEB_PRESENCE_LABEL: Record<WebPresenceStatus, string> = {
  DOMINIO_PROPIO: "tiene sitio propio en dominio propio",
  DOMINIO_GRATUITO_O_CONSTRUCTOR: "tiene sitio, pero en dominio gratuito o de un constructor (Wix, Google Sites, Linktree y similares) — no es un dominio propio",
  SOLO_REDES_SOCIALES: "no tiene sitio propio: sólo usa Instagram/Facebook como presencia online — posible oportunidad de ofrecer un sitio simple de cortesía",
  SIN_PRESENCIA_DIGITAL: "no se encontró ninguna presencia digital — posible oportunidad de ofrecer un sitio simple de cortesía",
  SIN_VERIFICAR: "sin verificar",
};

function formatEnrichment(enrichment: EnrichmentResult | null): string {
  if (!enrichment) return "Sin enriquecer todavía: no hay análisis previo del negocio.";
  if (!enrichment.grounded) {
    return `SIN VERIFICAR: la búsqueda web de este negocio no encontró nada real (falló el grounding). No hay ningún servicio, señal de operación ni señal de tecnología confirmados.\nResumen (genérico, no verificado — no lo cites como si lo hubieras visto): ${enrichment.businessSummary}\nConfianza del análisis: BAJA`;
  }
  const lines = [
    `Resumen: ${enrichment.businessSummary}`,
    enrichment.detectedServices.length > 0 ? `Servicios detectados (HECHO, verificado en la búsqueda): ${enrichment.detectedServices.join(", ")}` : null,
    enrichment.possibleDecisionMaker ? `Posible decisor: ${enrichment.possibleDecisionMaker}` : null,
    enrichment.operationSignals.length > 0 ? `Señales de operación (HECHO, verificado en la búsqueda): ${enrichment.operationSignals.join("; ")}` : null,
    enrichment.technologySignals.length > 0 ? `Señales de tecnología (HECHO, verificado en la búsqueda): ${enrichment.technologySignals.join("; ")}` : null,
    // `enrichment.webPresence` puede faltar en análisis guardados antes de sumarse este campo (blob opaco, sin migración de datos viejos).
    enrichment.webPresence && enrichment.webPresence.status !== "SIN_VERIFICAR"
      ? `Presencia web (HECHO, verificado en la búsqueda): ${WEB_PRESENCE_LABEL[enrichment.webPresence.status]}${enrichment.webPresence.detail ? ` — ${enrichment.webPresence.detail}` : ""}`
      : null,
    `Confianza del análisis: ${enrichment.confidence}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatSignals(signals: LeadSignalRow[]): string {
  if (signals.length === 0) return "  (ninguna todavía)";
  return signals
    .map((signal) => {
      const parts = [
        `[${signal.kind} · ${signal.status}]`,
        signal.title,
        signal.evidence ? `cita: "${signal.evidence}"` : null,
        signal.already_solved ? "YA LO TIENEN RESUELTO — no ofrecer esto" : null,
      ].filter(Boolean);
      return `  - ${parts.join(" — ")}`;
    })
    .join("\n");
}

function formatMemory(memory: LeadMemory | null): string {
  if (!memory || Object.keys(memory).length === 0) return "(sin memoria todavía — es el primer contacto o todavía no se analizó ninguna respuesta.)";
  const lines = [
    memory.business_context ? `Contexto del negocio: ${memory.business_context}` : null,
    memory.current_process ? `Cómo trabajan hoy: ${memory.current_process}` : null,
    memory.pain_points?.length ? `Dolores: ${memory.pain_points.join("; ")}` : null,
    memory.objections?.length ? `Objeciones: ${memory.objections.join("; ")}` : null,
    memory.buying_signals?.length ? `Señales de compra: ${memory.buying_signals.join("; ")}` : null,
    memory.tools_used?.length ? `Herramientas que usan: ${memory.tools_used.join("; ")}` : null,
    memory.key_quotes?.length ? `Citas clave: ${memory.key_quotes.map((q) => `"${q}"`).join(" / ")}` : null,
    memory.timing ? `Timing: ${memory.timing}` : null,
    memory.next_action ? `Próxima acción anotada: ${memory.next_action}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatNotes(notes: LeadNoteRow[]): string {
  if (notes.length === 0) return "(sin notas manuales todavía.)";
  return notes
    .map((note) => `  - [${new Date(note.occurred_at).toLocaleDateString("es-AR")}] ${note.content}`)
    .join("\n");
}

export function buildLeadStateBlock(params: {
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  /** Notas que el vendedor fue anotando a mano (§1.21) — corrigen o completan lo que el resto del contexto no puede ver. */
  notes: LeadNoteRow[];
}): string {
  return `## Perfil del vendedor (lo único de lo que podés afirmar experiencia y casos reales — SPA §13)
${params.salesProfile.trim() || "(vacío: no afirmes ninguna experiencia, cliente ni resultado propio.)"}

## El negocio
Nombre: ${params.lead.name}
Rubro: ${params.lead.industryName ?? "sin clasificar"}
Ciudad: ${params.lead.city ?? "sin dato"}
Estado actual del pipeline: ${params.lead.status}
Nivel de interés registrado: ${params.lead.interestLevel ?? "sin medir todavía"}

## Enriquecimiento (SPA §4)
${formatEnrichment(params.enrichment)}

## Dolores, objeciones y señales (SPA §5, §11)
${formatSignals(params.signals)}

## Memoria del lead (SPA §20)
${formatMemory(params.memory)}

## Notas manuales del vendedor
Lo que anotó una persona mirando la conversación — pesa más que una inferencia tuya sobre el mismo hecho. Por ejemplo, si una nota dice que una respuesta rápida fue un chatbot o una solución ya armada, tratala como tal aunque el mensaje en sí no lo diga.
${formatNotes(params.notes)}`;
}

/** Tope del historial: alcanza para leer la respuesta en contexto sin inflar el prompt con toda la conversación. */
const CONVERSATION_LIMIT = 12;

/**
 * El hilo ya enviado/recibido, en orden (SPA §10). Sin esto el analizador lee
 * la respuesta suelta: "Queda pendiente" contestando "¿suelen hacer
 * seguimiento o queda pendiente?" es información sobre cómo trabajan, no un
 * "ahora no" — y eso sólo se ve con la pregunta al lado. Los borradores del
 * vendedor sin confirmar no se mandaron, así que no son parte del hilo.
 */
export type ConversationMessage = Pick<LeadMessageRow, "sender" | "confirmed" | "kind" | "channel" | "content">;

export function buildConversationBlock(messages: ConversationMessage[]): string {
  const thread = messages.filter((m) => m.sender === "LEAD" || m.confirmed).slice(-CONVERSATION_LIMIT);
  if (thread.length === 0) return "## Conversación hasta ahora\n(ningún mensaje registrado todavía)";
  const lines = thread.map((m) => {
    const who = m.sender === "LEAD" ? "PROSPECTO" : "VENDEDOR";
    const kind = m.kind ? ` · ${m.kind}` : "";
    return `[${who}${kind} · ${m.channel}]\n${m.content.trim()}`;
  });
  return `## Conversación hasta ahora (más vieja primero)\n${lines.join("\n\n")}`;
}

/** El ángulo ya se eligió en TypeScript (lib/leads/ai/opening.ts) — esto sólo se lo informa al modelo, no se lo pregunta. */
export function buildAngleBlock(chosen: { angle: SalesAngle; reason: string }, counts: Partial<Record<SalesAngle, number>>): string {
  const countsLine =
    Object.entries(counts)
      .map(([angle, count]) => `${angle}: ${count}`)
      .join(", ") || "(sin aperturas en los últimos 30 días)";
  return `## Ángulo elegido para esta apertura (SPA §7 — ya decidido, no elijas otro)
${chosen.angle} — ${ANGLE_LABEL[chosen.angle]}: ${ANGLE_RULE[chosen.angle]}
Por qué se eligió este ángulo: ${chosen.reason}
Conteo de aperturas por ángulo, últimos 30 días (antisesgo, SPA §6 — no lo repitas si ya está sobrerrepresentado): ${countsLine}`;
}
