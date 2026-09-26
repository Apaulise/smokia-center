import { ANGLE_LABEL, ANGLE_RULE, type SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import type { LeadSignalRow } from "@/lib/leads/queries";

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

function formatEnrichment(enrichment: EnrichmentResult | null): string {
  if (!enrichment) return "Sin enriquecer todavía: no hay análisis previo del negocio.";
  const lines = [
    `Resumen: ${enrichment.businessSummary}`,
    enrichment.detectedServices.length > 0 ? `Servicios detectados: ${enrichment.detectedServices.join(", ")}` : null,
    enrichment.possibleDecisionMaker ? `Posible decisor: ${enrichment.possibleDecisionMaker}` : null,
    enrichment.operationSignals.length > 0 ? `Señales de operación: ${enrichment.operationSignals.join("; ")}` : null,
    enrichment.technologySignals.length > 0 ? `Señales de tecnología: ${enrichment.technologySignals.join("; ")}` : null,
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

export function buildLeadStateBlock(params: {
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
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
${formatMemory(params.memory)}`;
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
