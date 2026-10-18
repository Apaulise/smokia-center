import { z } from "zod";

import { isSalesAngle, SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
import { formatAddress } from "@/lib/leads/address";
import { generateGeminiJson, generateGeminiUrlJson, type GeminiSchema } from "@/lib/gemini/client";

/**
 * Enriquecimiento de un lead scrapeado (Plan §1.10): convierte los datos
 * crudos del scraper en el análisis comercial del SPA §4. Una llamada a
 * Gemini con URL Context cuando hay URLs; Google Search requiere un plan pago.
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
  /** Si URL Context leyó una fuente real. Si es `false`, los campos de hechos verificados vienen vacíos/SIN_VERIFICAR. */
  grounded: boolean;
}

function referenceUrl(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function buildEnrichmentPrompt(lead: EnrichmentInput, references: string[]): string {
  return `Analizá este negocio ANTES del primer contacto y devolvé el objeto JSON pedido.

Negocio: ${lead.name}
${lead.industryName ? `Rubro: ${lead.industryName}` : ""}
${lead.city || lead.address ? `Ubicación: ${formatAddress(lead)}` : ""}

URLs conocidas del negocio (leé sólo estas; no tenés búsqueda web):
${references.length ? references.join("\n") : "Ninguna. Usá sólo los datos del lead anteriores."}

Reglas:
- Leé las URLs con URL Context. Si una no carga, redirige a parking o corresponde a otro negocio, no la uses como evidencia.
- No inventes búsquedas, reseñas, publicaciones, sistemas, servicios ni detalles de operación. URL Context no descubre páginas nuevas ni sigue enlaces internos.
- business_summary: dos o tres oraciones con datos del lead y hechos realmente visibles; lo demás debe quedar expresamente sin verificar.
- detected_services, operation_signals y technology_signals: sólo hechos visibles en una URL leída y atribuible a este negocio. Dejalos vacíos si no hay evidencia.
- possible_decision_maker: sólo si una fuente lo identifica; si no, null.
- web_presence.status: DOMINIO_PROPIO o DOMINIO_GRATUITO_O_CONSTRUCTOR sólo si leíste el sitio y confirmaste que corresponde a este negocio. SOLO_REDES_SOCIALES sólo si la fuente confirma que ésa es su única presencia. Como no hay búsqueda exhaustiva, nunca deduzcas SIN_PRESENCIA_DIGITAL por ausencia de enlaces. Ante la duda, SIN_VERIFICAR y detail null.
- possible_pains: sólo hipótesis plausibles; nunca las presentes como dolores confirmados. Array vacío si no hay base suficiente.
- recommended_sales_angle: hipótesis inicial, no conclusión. confidence: BAJA si no pudiste leer fuentes útiles.
- Si no hay URLs o ninguna se puede leer, completá el JSON con los datos básicos del lead y todos los campos de hechos verificados vacíos.`;
}

/**
 * Corre una llamada y devuelve el resultado validado. No escribe nada en la
 * base — eso lo hace el llamador (lib/leads/ai/actions.ts), que también sabe
 * el owner_id y el lead_id.
 */
export async function enrichLead(params: { apiKey: string; lead: EnrichmentInput }): Promise<EnrichmentResult> {
  const system = getSalesOS();
  const references = [params.lead.website, params.lead.instagramUrl, params.lead.sourceUrl]
    .map(referenceUrl)
    .filter((url): url is string => url !== null);
  const request = {
    apiKey: params.apiKey,
    system,
    prompt: buildEnrichmentPrompt(params.lead, references),
    schema: GEMINI_SCHEMA,
  };
  const { text: raw, grounded } = references.length > 0
    ? await generateGeminiUrlJson(request)
    : { text: await generateGeminiJson(request), grounded: false };

  const parsed = EnrichmentOutputSchema.parse(JSON.parse(raw));

  return {
    businessSummary: parsed.business_summary,
    // Sin grounding real, no hay hecho verificado que citar (SPA §4) — se
    // fuerza acá en vez de confiar en que el modelo respetó la advertencia.
    detectedServices: grounded ? parsed.detected_services : [],
    possibleDecisionMaker: grounded ? parsed.possible_decision_maker : null,
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
