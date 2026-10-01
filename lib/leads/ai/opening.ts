import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import { SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildAngleBlock, buildLeadStateBlock, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";
import { OPENING_GROQ_SCHEMA, OpeningSchema, type OpeningOutput } from "@/lib/leads/ai/schemas";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import { buildStyleBlock, type StyleExample } from "@/lib/leads/ai/style/examples";

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

/** Etiquetas estables de cada tipo de apertura, para mostrarlas en el análisis de §1.19. */
export const VARIANT_LABEL: Record<number, string> = {
  1: "Reconocimiento + escenario",
  2: "Escenario directo",
  3: "Observación específica + duda",
};

const VARIANT_HINT: Record<number, string> = {
  1: "Tipo 1 — RECONOCIMIENTO + ESCENARIO: arrancá con 'Estuve viendo [nombre corto]', reconocé algo que ya hacen bien y está verificado (HECHO) — por ejemplo que tengan reservas online con un sistema — y recién después hacé la pregunta de escenario. Si no hay nada verificado que reconocer, usá el tipo 2.",
  2: "Tipo 2 — ESCENARIO DIRECTO: sin observación previa. Una línea de saludo y la pregunta de escenario, que es el mensaje entero.",
  3: "Tipo 3 — OBSERVACIÓN ESPECÍFICA + DUDA: una observación breve sobre algo puntual de ESTE negocio (HECHO, no su ciudad ni un widget estándar) y una duda genuina sobre cómo lo manejan. Si no hay nada específico verificado, usá el tipo 2.",
};

/**
 * Mensaje de referencia escrito por el vendedor: el nivel de concreción que
 * se busca. Va como ESTILO, no como plantilla — el contenido es de otro negocio.
 */
const REFERENCE_OPENING = `Hola! Estuve viendo Vintage y vi que tienen bastante aceitado el tema de reservas con AgendaPro y además manejan varios servicios distintos. Te quería hacer una consulta puntual: cuando alguien pregunta por WhatsApp o Instagram pero después no termina reservando, ¿suelen hacer algún seguimiento?`;

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
  notes: LeadNoteRow[];
  angleCounts: Partial<Record<SalesAngle, number>>;
  styleExamples: StyleExample[];
  leadId: string;
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
    notes: params.notes,
  });
  const angleBlock = buildAngleBlock({ angle, reason }, params.angleCounts);

  const styleBlock = buildStyleBlock(params.styleExamples, params.leadId);

  const basePrompt = `Escribí el primer mensaje para este negocio (SPA §8): entre dos y cinco líneas, contexto verificable + UNA sola pregunta. Nunca te presentes ni menciones una agencia de IA — el objetivo es que te contesten, no vender.

## Cómo es un buen primer mensaje (el nivel de concreción que se busca)
Ejemplo escrito por el vendedor para otro negocio — imitá la ESTRUCTURA y el tono, no el contenido:

"${REFERENCE_OPENING}"

Qué tiene de bueno, y es lo que tenés que replicar:
1. Nombre corto y natural del negocio ("Vintage", no "Vintage Nails & Beauty"), como lo diría una persona.
2. Reconoce algo que ya hacen bien (HECHO verificado). Eso muestra que miraste y baja la guardia; no arranca marcando un problema.
3. La pregunta describe una SITUACIÓN concreta del día a día ("cuando alguien pregunta por WhatsApp o Instagram pero después no termina reservando, ¿hacen seguimiento?"), que se contesta en una línea. No pregunta por un TEMA abstracto ("¿cómo organizan la información de los clientes?"): esa es la pregunta floja.
4. Suena a una persona curiosa, no a un diagnóstico.

## Reglas de contenido
- Sólo afirmaciones en primera persona ("vi que...", "tienen...") sobre lo que figura como HECHO en el enriquecimiento o una cita textual del lead (SPA §4). Con "SIN VERIFICAR" o sin señales, no inventes qué tiene la web, qué sistema usan ni cómo trabajan.
- Tampoco inventes detalles dentro de la pregunta (que reciben comprobantes de pago, que atienden por tal canal, etc.): la situación que plantees tiene que ser plausible para el rubro y salir del ángulo, no de datos supuestos del negocio.
- Lo que cuenta como observación es lo ESPECÍFICO de este negocio: una herramienta que usan (un sistema de reservas), un tratamiento o equipo particular, un horario atípico, la ausencia de algo esperable. NO cuentan la ciudad ni la infraestructura estándar (botón flotante de WhatsApp, formulario, WordPress/Wix); si usás esa señal, hablá del comportamiento detrás y no del widget.
- La frase del ángulo de abajo es el TEMA de la pregunta, no la redacción: no la copies. Convertila en una situación concreta apoyada en una señal verificada de este negocio; si no hay ninguna, igual redactala con tus palabras.

${stateBlock}

${angleBlock}${styleBlock}

## Tipo de apertura de este mensaje (se mide por tipo y por rubro: respetalo)
${VARIANT_HINT[variant]}`;

  const parsed = await resolveStructuredJson(OpeningSchema, (repairNote) =>
    generateGroqJson({
      apiKey: params.apiKey,
      system: getSalesOS(),
      prompt: repairNote ? `${basePrompt}\n\n${repairNote}` : basePrompt,
      schema: OPENING_GROQ_SCHEMA,
      schemaName: "lead_opening",
      maxTokens: 2000,
      // Temperature 0 (el default del cliente) es para extracción determinística;
      // acá es redacción creativa y con el ángulo repitiendo la misma frase de
      // regla en cada llamada, 0 producía casi la misma pregunta para todo
      // negocio con el mismo ángulo (encontrado en checklist manual §1.11).
      temperature: 0.7,
      // "low" (el default) alcanza para extraer o clasificar; acá hay que
      // juzgar qué señal verificada es específica de este negocio y cuál es
      // infraestructura estándar del rubro (botón de WhatsApp, formulario,
      // ciudad) — encontrado en checklist manual §1.11, "medium" le da margen
      // a ese paso de criterio antes de escribir.
      reasoningEffort: "medium",
    }),
  );

  return { ...parsed, angle, variant, angleReason: reason };
}
