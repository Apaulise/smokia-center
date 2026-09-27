import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import { SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildAngleBlock, buildLeadStateBlock, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import type { LeadSignalRow } from "@/lib/leads/queries";
import { OPENING_GROQ_SCHEMA, OpeningSchema, type OpeningOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";

/**
 * Generador de apertura (Plan §1.11). `chooseSalesAngle` decide el ángulo en
 * TypeScript, no en el prompt: el modelo recibe el ángulo ya elegido y el
 * porqué (SPA §7), no la tabla entera para que elija.
 */

/** Margen sobre el mínimo (SPA §6, antisesgo): cuánto puede estar sobrerrepresentado el ángulo recomendado antes de descartarlo. */
const ANGLE_BIAS_MARGIN = 2;

export function chooseSalesAngle(params: {
  recommended: SalesAngle | null;
  counts: Partial<Record<SalesAngle, number>>;
}): { angle: SalesAngle; reason: string } {
  const countOf = (angle: SalesAngle) => params.counts[angle] ?? 0;
  const minCount = Math.min(...SALES_ANGLES.map(countOf));

  if (params.recommended && countOf(params.recommended) <= minCount + ANGLE_BIAS_MARGIN) {
    return {
      angle: params.recommended,
      reason: `El enriquecimiento lo recomendó para este negocio y no está sobrerrepresentado (${countOf(params.recommended)} apertura(s) en los últimos 30 días).`,
    };
  }

  const leastUsed = SALES_ANGLES.reduce((a, b) => (countOf(b) < countOf(a) ? b : a));
  return {
    angle: leastUsed,
    reason: params.recommended
      ? `El enriquecimiento recomendó ${params.recommended}, pero ya se usó ${countOf(params.recommended)} veces en 30 días — se prioriza ${leastUsed} (${countOf(leastUsed)} veces) para no repetir siempre el mismo ángulo (SPA §6).`
      : `Sin recomendación del enriquecimiento todavía: se eligió el ángulo menos usado en los últimos 30 días.`,
  };
}

/**
 * Tres formas de encarar el mismo ángulo — no plantillas fijas (el modelo
 * sigue escribiendo libre), sino un encuadre distinto para el "primer
 * mensaje" del SPA §8. Existen para que §1.19 tenga algo real que comparar
 * dentro de un mismo ángulo, no sólo entre ángulos.
 */
const OPENING_VARIANT_COUNT = 3;
const VARIANT_HINT: Record<number, string> = {
  1: "Encuadre: arrancá desde algo que se ve u observaste del negocio (una foto, cómo atienden, el volumen aparente) antes de la pregunta.",
  2: "Encuadre: arrancá desde una duda genuina sobre cómo manejan hoy ese proceso, sin mencionar lo que viste.",
  3: "Encuadre: arrancá con una observación breve y concreta sobre el rubro o el momento del negocio, después la pregunta.",
};

/** Variante balanceada por cuántas aperturas ya salieron con ese ángulo — sin otra consulta a la base. */
function chooseVariant(angle: SalesAngle, counts: Partial<Record<SalesAngle, number>>): number {
  const used = counts[angle] ?? 0;
  return (used % OPENING_VARIANT_COUNT) + 1;
}

export interface GeneratedOpening extends OpeningOutput {
  angle: SalesAngle;
  variant: number;
  angleReason: string;
}

/**
 * `generateOpening()` (Plan §1.11): desde Plans/migracion-fuera-de-anthropic.md
 * (Etapa 1), Groq con salida estructurada, el Sistema de Prospección como
 * `system` y el estado del turno concatenado al prompt de usuario (Groq no
 * tiene el segundo rol `{ role: "system" }` que usaba Anthropic).
 *
 * No persiste nada — el llamador decide qué hacer con el borrador, y no se
 * guarda como enviado hasta que el usuario confirma (SPA §24).
 */
export async function generateOpening(params: {
  apiKey: string;
  salesProfile: string;
  lead: LeadContext;
  enrichment: EnrichmentResult | null;
  memory: LeadMemory | null;
  signals: LeadSignalRow[];
  angleCounts: Partial<Record<SalesAngle, number>>;
}): Promise<GeneratedOpening> {
  const { angle, reason } = chooseSalesAngle({
    recommended: params.enrichment?.recommendedSalesAngle ?? null,
    counts: params.angleCounts,
  });
  const variant = chooseVariant(angle, params.angleCounts);

  const stateBlock = buildLeadStateBlock({
    salesProfile: params.salesProfile,
    lead: params.lead,
    enrichment: params.enrichment,
    memory: params.memory,
    signals: params.signals,
  });
  const angleBlock = buildAngleBlock({ angle, reason }, params.angleCounts);

  const basePrompt = `Escribí el primer mensaje para este negocio (SPA §8): entre dos y cinco líneas, contexto verificable + una sola pregunta simple que se pueda contestar sin comprometerse a nada. Nunca te presentes ni menciones una agencia de IA en este mensaje — el objetivo es que te contesten, no vender.\n\n${stateBlock}\n\n${angleBlock}\n\n## Encuadre de esta variante (Plan §1.11 — no es una plantilla, es un punto de partida)\n${VARIANT_HINT[variant]}`;

  const parsed = await resolveStructuredJson(OpeningSchema, (repairNote) =>
    generateGroqJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: OPENING_GROQ_SCHEMA,
      schemaName: "lead_opening",
      maxTokens: 2000,
    }),
  );

  return { ...parsed, angle, variant, angleReason: reason };
}
