import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import type { LeadMemory } from "@/lib/leads/ai/prompts";
import type { AnalyzeOutput } from "@/lib/leads/ai/schemas";
import type { SignalSnapshot } from "@/lib/leads/signals";

/**
 * `lead_intel.memory` (Plan §1.14, SPA §20) se recalcula en TypeScript
 * después de cada análisis — no hay un llamado al modelo dedicado a esto: la
 * tabla "Reparto de modelos" (Plan §1.7) no tiene una fila para "resumir
 * memoria", y todo lo que hace falta ya está en `lead_signals` (§1.13) y en
 * la salida estructurada del analizador (§1.12). "Un system prompt no es
 * documentación" vale también acá: un promedio o un conteo no se le pide al
 * modelo, se calcula.
 */
export function rebuildLeadMemory(params: {
  current: LeadMemory | null;
  enrichment: EnrichmentResult | null;
  analysis: AnalyzeOutput;
  /** Las señales del lead con las escrituras de esta corrida ya aplicadas (§1.13). */
  signals: SignalSnapshot[];
}): LeadMemory {
  const { current, enrichment, analysis, signals } = params;

  // HIPOTESIS no sube a la memoria: son conjeturas del enriquecimiento, no algo que el lead haya confirmado o sugerido.
  const painPoints = signals.filter((s) => s.kind === "DOLOR" && s.status !== "HIPOTESIS").map((s) => `${s.title} (${s.status.toLowerCase()})`);
  const objections = signals.filter((s) => s.kind === "OBJECION").map((s) => s.title);
  const buyingSignals = signals.filter((s) => s.kind === "SENAL_COMPRA").map((s) => s.title);

  const freshQuotes = signals.map((s) => s.evidence).filter((quote): quote is string => Boolean(quote?.trim()));
  // Tope de 10: son citas para orientar el próximo mensaje, no un archivo completo de la conversación.
  const keyQuotes = [...new Set([...(current?.key_quotes ?? []), ...freshQuotes])].slice(-10);

  const timing = analysis.analysis.not_now
    ? [
        analysis.analysis.not_now_reason,
        analysis.analysis.not_now_opportunity ? `Oportunidad: ${analysis.analysis.not_now_opportunity}` : null,
        analysis.analysis.follow_up_date ? `Retomar: ${analysis.analysis.follow_up_date}` : null,
      ]
        .filter(Boolean)
        .join(" — ") || current?.timing
    : analysis.analysis.follow_up_date
      ? `Retomar: ${analysis.analysis.follow_up_date}`
      : current?.timing;

  const memory: LeadMemory = {
    business_context: current?.business_context ?? enrichment?.businessSummary ?? undefined,
    current_process: current?.current_process,
    pain_points: painPoints.length > 0 ? painPoints : current?.pain_points,
    objections: objections.length > 0 ? objections : current?.objections,
    buying_signals: buyingSignals.length > 0 ? buyingSignals : current?.buying_signals,
    tools_used: current?.tools_used,
    key_quotes: keyQuotes.length > 0 ? keyQuotes : undefined,
    timing,
    next_action: analysis.strategy.reasoning,
  };

  // Postgres no necesita guardar claves con `undefined` — limpiarlas hace más legible una fila mirada a mano en el editor de Supabase.
  return Object.fromEntries(Object.entries(memory).filter(([, value]) => value !== undefined)) as LeadMemory;
}
