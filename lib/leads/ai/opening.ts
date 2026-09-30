import { resolveStructuredJson } from "@/lib/ai/structured-output";
import { generateGroqJson } from "@/lib/groq/client";
import { SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { buildAngleBlock, buildLeadStateBlock, type LeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";
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
  1: "Encuadre: arrancá con un lead-in cálido tipo 'Estuve viendo que en [nombre del negocio]...' (no textual, adaptalo) y seguí con algo que se ve u observaste del negocio (una foto, cómo atienden, el volumen aparente) antes de la pregunta — mejor que ir directo a la observación en seco. Si no hay ningún detalle verificado que observar, no lo inventes: usá el encuadre de la variante 2 en su lugar.",
  2: "Encuadre: arrancá desde una duda genuina sobre cómo manejan hoy ese proceso, sin mencionar lo que viste.",
  3: "Encuadre: arrancá con un lead-in cálido tipo 'Estuve viendo que en [nombre del negocio]...' (no textual, adaptalo) seguido de una observación breve y concreta sobre el rubro o el momento del negocio, después la pregunta. 'Concreta' es sobre ESTE negocio puntual, no un dato genérico como su ciudad — si no hay nada concreto, usá el encuadre de la variante 2 en su lugar.",
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
  notes: LeadNoteRow[];
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
    notes: params.notes,
  });
  const angleBlock = buildAngleBlock({ angle, reason }, params.angleCounts);

  const basePrompt = `Escribí el primer mensaje para este negocio (SPA §8): entre dos y cinco líneas, contexto verificable + una sola pregunta simple que se pueda contestar sin comprometerse a nada. Nunca te presentes ni menciones una agencia de IA en este mensaje — el objetivo es que te contesten, no vender.\n\nRegla estricta sobre el contexto (SPA §4): sólo podés escribir "vi que...", "tenés...", "en tu web..." o cualquier otra afirmación en primera persona sobre algo puntual del negocio si viene marcado (HECHO, verificado en la búsqueda) en el bloque de enriquecimiento de abajo, o si es una cita textual del lead en la memoria. Si el enriquecimiento dice "SIN VERIFICAR" o no tiene servicios/señales verificados, NO inventes qué tiene la web, qué sistema usa o cómo gestiona turnos.\n\nEl criterio para que algo cuente como "observación" (SPA §8) no es si es cierto, es si es ESPECÍFICO de este negocio y no de cualquier otro del mismo rubro. Dos trampas comunes que son ciertas pero NO sirven:\n- La ciudad: "vi que tu centro está en Ciudad Autónoma de Buenos Aires" le sirve igual a cualquier negocio de esa ciudad. Salvo que sea un barrio o zona chica que de verdad distinga al negocio, no la uses como observación.\n- La infraestructura estándar de cualquier sitio del rubro: que tenga un botón flotante de WhatsApp, un formulario de contacto, o que esté hecho en determinada plataforma (WordPress, Wix). Son "señales de tecnología" verificadas, pero son iguales en casi cualquier sitio de ese rubro hoy — decir "vi que tenés un botón de WhatsApp" suena a que mirás la página como una checklist, no como si conocieras el negocio. Si vas a usar esa señal, hablá del COMPORTAMIENTO detrás (derivan las consultas a WhatsApp, no tienen reservas online) y no del widget en sí.\n\nEntre las señales verificadas, preferí siempre la más específica y menos común: un tratamiento o equipo particular, una ubicación puntual (piso, zona), un especialista, un horario atípico, la ausencia de algo que se esperaría (sin reservas online, por ejemplo) — eso sí es algo que sólo se sabe mirando a ESE negocio. Si no hay ningún detalle verificado que sea realmente específico, no fuerces una "observación": arrancá directo con el rubro y una pregunta genuina sobre cómo trabajan hoy — un mensaje sin observación pero honesto es mejor que uno que rellena con un dato genérico.\n\nLa frase del "ángulo elegido" de abajo (p. ej. "cómo se agenda, confirma y reprograma hoy") te dice DE QUÉ TEMA preguntar, no CÓMO redactar la pregunta — es la misma frase para todos los negocios con ese ángulo, así que copiarla casi textual es lo que hace que dos negocios distintos reciban la misma pregunta (SPA §8: "si tu primera línea le sirve igual a cualquier otro del mismo rubro, no es personalización"). Si hay una señal de operación o tecnología marcada (HECHO, verificado en la búsqueda) para ESTE negocio puntual, construí la pregunta apoyada en esa señal concreta (p. ej. si sólo usan WhatsApp, preguntale por eso puntual, no por "la gestión de turnos" en general). Si no hay ninguna señal verificada, igual variá la redacción — no reutilices la frase del ángulo.\n\n${stateBlock}\n\n${angleBlock}\n\n## Encuadre de esta variante (Plan §1.11 — no es una plantilla, es un punto de partida)\n${VARIANT_HINT[variant]}`;

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
