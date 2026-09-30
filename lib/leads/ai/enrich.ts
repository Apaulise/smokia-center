import { z } from "zod";

import { isSalesAngle, SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import { formatAddress } from "@/lib/leads/address";
import { generateGeminiGrounded, generateGeminiJson, type GeminiSchema } from "@/lib/gemini/client";

/**
 * Enriquecimiento de un lead scrapeado (Plan §1.10): convierte los datos
 * crudos del scraper en el análisis comercial del SPA §4. Dos pases contra
 * Gemini — ver generateGeminiGrounded() para por qué no es uno solo.
 */

const PossiblePainSchema = z.object({
  description: z.string().trim().min(1).max(400),
  business_impact: z.string().trim().max(300).nullable().default(null),
});

/**
 * Nunca "tiene web sí/no": un link en la bio de Instagram, un sitio en
 * dominio gratuito y un dominio propio son tres situaciones comerciales
 * distintas (pie de charla del usuario, 2026-09-30) y sólo la última descarta
 * la oportunidad de ofrecer un sitio de cortesía.
 */
const WEB_PRESENCE_STATUSES = [
  "DOMINIO_PROPIO",
  "DOMINIO_GRATUITO_O_CONSTRUCTOR",
  "SOLO_REDES_SOCIALES",
  "SIN_PRESENCIA_DIGITAL",
  "SIN_VERIFICAR",
] as const;
export type WebPresenceStatus = (typeof WEB_PRESENCE_STATUSES)[number];

const WebPresenceSchema = z.object({
  status: z.enum(WEB_PRESENCE_STATUSES),
  detail: z.string().trim().max(300).nullable().default(null),
});

const EnrichmentOutputSchema = z.object({
  business_summary: z.string().trim().min(1).max(1500),
  detected_services: z.array(z.string().trim().max(200)).max(15).default([]),
  possible_decision_maker: z.string().trim().max(200).nullable().default(null),
  operation_signals: z.array(z.string().trim().max(300)).max(10).default([]),
  technology_signals: z.array(z.string().trim().max(300)).max(10).default([]),
  web_presence: WebPresenceSchema,
  // Hipótesis, nunca hechos (SPA §4): cada una nace en lead_signals con status=HIPOTESIS.
  possible_pains: z.array(PossiblePainSchema).max(8).default([]),
  recommended_sales_angle: z.string(),
  confidence: z.enum(["BAJA", "MEDIA", "ALTA"]),
});

const GEMINI_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    business_summary: { type: "string" },
    detected_services: { type: "array", items: { type: "string" } },
    possible_decision_maker: { type: "string", nullable: true },
    operation_signals: { type: "array", items: { type: "string" } },
    technology_signals: { type: "array", items: { type: "string" } },
    web_presence: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...WEB_PRESENCE_STATUSES] },
        detail: { type: "string", nullable: true },
      },
      required: ["status"],
    },
    possible_pains: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          business_impact: { type: "string", nullable: true },
        },
        required: ["description"],
      },
    },
    recommended_sales_angle: { type: "string", enum: SALES_ANGLES },
    confidence: { type: "string", enum: ["BAJA", "MEDIA", "ALTA"] },
  },
  required: ["business_summary", "web_presence", "recommended_sales_angle", "confidence"],
};

export interface EnrichmentInput {
  name: string;
  industryName: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  instagramUrl: string | null;
  sourceUrl: string | null;
}

export interface EnrichmentResult {
  businessSummary: string;
  detectedServices: string[];
  possibleDecisionMaker: string | null;
  operationSignals: string[];
  technologySignals: string[];
  webPresence: { status: WebPresenceStatus; detail: string | null };
  possiblePains: { description: string; businessImpact: string | null }[];
  recommendedSalesAngle: SalesAngle | null;
  confidence: "BAJA" | "MEDIA" | "ALTA";
  /** Si el pase A (google_search/url_context) encontró algo real. Si es `false`, los campos de hechos verificados de arriba (servicios, señales, presencia web) ya vienen vacíos/SIN_VERIFICAR, forzado — ver enrichLead(). */
  grounded: boolean;
}

function buildEvidencePrompt(lead: EnrichmentInput): string {
  const references = [
    lead.website ? `Sitio web: ${lead.website}` : null,
    lead.instagramUrl ? `Instagram: ${lead.instagramUrl}` : null,
    lead.sourceUrl ? `Ficha de origen: ${lead.sourceUrl}` : null,
  ].filter(Boolean);

  return `Estás analizando un negocio ANTES del primer contacto, para preparar la prospección (SPA §3, orden de descubrimiento: primero entender cómo trabaja hoy).

Negocio: ${lead.name}
${lead.industryName ? `Rubro: ${lead.industryName}` : ""}
${lead.city || lead.address ? `Ubicación: ${formatAddress(lead)}` : ""}

Fuentes disponibles:
${references.length > 0 ? references.join("\n") : "(ninguna — buscá por nombre y ubicación)"}

Investigá en serio, no te quedes con la primera fuente. Antes de escribir la respuesta:
- Si hay un sitio web listado, entrá y leelo. Si la carga falla, tira error, redirige a un dominio en venta/parking, o el contenido no coincide con este negocio (nombre distinto, otro rubro, otra ciudad), NO lo trates como el sitio del negocio — tratalo como "sin sitio web confirmado" y decilo explícitamente, no lo cites como si hubiera cargado bien.
- Si no hay sitio listado, buscá igual por nombre + ciudad + rubro: puede tener uno que el scraper de origen no capturó.
- Revisá Instagram y/o Facebook si están disponibles: bio, link en la bio (a veces es un Linktree/Beacons con el sitio real adentro, a veces es directamente el único canal del negocio), posts recientes, cómo dicen que se reserva o consulta.
- Buscá también la ficha de Google Maps/Business del negocio si no es ya la fuente de origen, y reseñas públicas en cualquier plataforma que aparezca.

Respondé en prosa, sin formato JSON, cubriendo:
- Qué hace el negocio y qué servicios ofrece, concretamente.
- Cómo parece reservarse un turno o hacerse una consulta hoy (web, WhatsApp, Instagram, teléfono).
- Qué se ve de su operación: cuántas sucursales, si atiende una sola persona o hay equipo, horarios, volumen aparente.
- Qué herramientas o sistemas parece usar (reservas online, algún software visible, o nada más que WhatsApp/redes).
- Reseñas o comentarios públicos que mencionen algo relevante (tiempos de espera, falta de respuesta, elogios a la atención).
- Presencia web, con este detalle específico porque de acá sale una posible oportunidad de negocio (un sitio simple de cortesía): ¿el negocio tiene una página propia en un dominio propio (terminación .com, .com.ar, etc. con su nombre), o lo que existe es un dominio gratuito/de un constructor (Wix, Google Sites, ".business.site", Linktree/Beacons, una landing gratuita), o no tiene sitio y sólo usa Instagram/Facebook como presencia online, o no se encontró ninguna presencia digital? Decilo en una frase y aclará en qué te basás (viste el dominio en la URL, lo dijo una reseña, no apareció nada en la búsqueda, etc.).

Regla del SPA §4: separá HECHO (lo viste con esas palabras) de INFERENCIA (se deduce, podría estar mal) de HIPÓTESIS (plausible para el rubro, nada más). Si no encontraste nada de algún punto, decilo — no lo completes.`;
}

function buildStructurePrompt(evidence: string, grounded: boolean): string {
  return `Tenés el análisis en prosa de un negocio, hecho por vos mismo en un paso anterior. Convertilo al objeto pedido.

Análisis:
"""
${evidence}
"""

Reglas:
- "business_summary": dos o tres oraciones, qué hace el negocio y cómo opera hoy. Sólo hechos e inferencias razonables, nunca invención.
- "detected_services", "operation_signals", "technology_signals": van acá ÚNICAMENTE las cosas que el análisis marcó como HECHO (algo que se vio directamente en una página, una reseña o una ficha). Si el análisis lo etiquetó como INFERENCIA o HIPÓTESIS, o si es un patrón típico del rubro que el análisis menciona sin haberlo visto en este negocio puntual, NO va en estos tres campos — un mensaje de prospección va a citar estos campos como "vi que…", y eso sólo es honesto si es un hecho verificado.
- "web_presence.status": elegí según lo que el análisis confirmó como HECHO sobre la presencia web del negocio — "DOMINIO_PROPIO" si vio un sitio funcionando en un dominio a nombre del negocio; "DOMINIO_GRATUITO_O_CONSTRUCTOR" si el sitio existe pero es un subdominio gratuito o de un constructor (Wix, Google Sites, ".business.site", Linktree/Beacons y similares); "SOLO_REDES_SOCIALES" si no hay sitio propio y el negocio sólo aparece en Instagram/Facebook; "SIN_PRESENCIA_DIGITAL" si la búsqueda no encontró nada online de este negocio; "SIN_VERIFICAR" si el análisis no llegó a revisar esto con confianza suficiente para afirmar cualquiera de las anteriores (por ejemplo, un link que no cargó y no se pudo confirmar qué era). "web_presence.detail": una frase corta con en qué te basás — no la inventes si el análisis no la da.
- "possible_pains": SIEMPRE son hipótesis (SPA §5) — el enriquecimiento nunca confirma un dolor, sólo una cita textual del lead lo hace. Acá sí entra lo que el análisis marcó como INFERENCIA o HIPÓTESIS (incluidas suposiciones de tecnología/operación que no se pudieron verificar), siempre que sea plausible. Si el análisis no sugiere ningún dolor plausible para este tipo de negocio, dejá el array vacío: no fabriques uno para completar el campo.
- "recommended_sales_angle": el más plausible de la lista dada, según lo que se ve del negocio. Si nada calza, elegí el más cercano — el campo es obligatorio, pero es una hipótesis de partida, no una conclusión.
- "confidence": ALTA si hay evidencia concreta (sitio propio, reseñas, reservas online visibles); BAJA si el análisis de arriba dice que no encontró casi nada.
- No inventes ningún dato que el análisis no sostenga. "No sé" en el texto de arriba significa dejar ese campo vacío o corto, no imaginar un valor.
${grounded ? "" : `\nADVERTENCIA DEL SISTEMA: la búsqueda web de este análisis no devolvió resultados reales (cuota de grounding agotada u otro fallo silencioso) — todo lo que dice arriba puede ser conocimiento genérico del modelo sobre este tipo de negocio, no algo visto en este negocio puntual. Tratá TODO el análisis como si estuviera etiquetado HIPÓTESIS, sin importar cómo esté redactado: dejá "detected_services", "operation_signals" y "technology_signals" vacíos, "web_presence.status" en "SIN_VERIFICAR", y "confidence" en BAJA.`}`;
}

/**
 * Corre los dos pases y devuelve el resultado validado. No escribe nada en la
 * base — eso lo hace el llamador (lib/leads/ai/actions.ts), que también sabe
 * el owner_id y el lead_id.
 */
export async function enrichLead(params: { apiKey: string; lead: EnrichmentInput }): Promise<EnrichmentResult> {
  const system = getSalesOS();

  const { text: evidence, grounded } = await generateGeminiGrounded({
    apiKey: params.apiKey,
    system,
    prompt: buildEvidencePrompt(params.lead),
  });

  const raw = await generateGeminiJson({
    apiKey: params.apiKey,
    system,
    prompt: buildStructurePrompt(evidence, grounded),
    schema: GEMINI_SCHEMA,
  });

  const parsed = EnrichmentOutputSchema.parse(JSON.parse(raw));

  return {
    businessSummary: parsed.business_summary,
    // Sin grounding real, no hay hecho verificado que citar (SPA §4) — se
    // fuerza acá en vez de confiar en que el modelo respetó la advertencia.
    detectedServices: grounded ? parsed.detected_services : [],
    possibleDecisionMaker: parsed.possible_decision_maker,
    operationSignals: grounded ? parsed.operation_signals : [],
    technologySignals: grounded ? parsed.technology_signals : [],
    webPresence: grounded
      ? { status: parsed.web_presence.status, detail: parsed.web_presence.detail }
      : { status: "SIN_VERIFICAR", detail: null },
    possiblePains: parsed.possible_pains.map((pain) => ({
      description: pain.description,
      businessImpact: pain.business_impact,
    })),
    // Un ángulo inventado se descarta, no se guarda (mismo criterio que
    // relevance.ts con los ids que no estaban en el batch).
    recommendedSalesAngle: isSalesAngle(parsed.recommended_sales_angle) ? parsed.recommended_sales_angle : null,
    confidence: grounded ? parsed.confidence : "BAJA",
    grounded,
  };
}
