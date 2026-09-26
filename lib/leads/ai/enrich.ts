import { z } from "zod";

import { isSalesAngle, SALES_ANGLES, type SalesAngle } from "@/lib/leads/ai/angles";
import { getSalesOS } from "@/lib/leads/ai/sales-os";
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

const EnrichmentOutputSchema = z.object({
  business_summary: z.string().trim().min(1).max(1500),
  detected_services: z.array(z.string().trim().max(200)).max(15).default([]),
  possible_decision_maker: z.string().trim().max(200).nullable().default(null),
  operation_signals: z.array(z.string().trim().max(300)).max(10).default([]),
  technology_signals: z.array(z.string().trim().max(300)).max(10).default([]),
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
  required: ["business_summary", "recommended_sales_angle", "confidence"],
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
  possiblePains: { description: string; businessImpact: string | null }[];
  recommendedSalesAngle: SalesAngle | null;
  confidence: "BAJA" | "MEDIA" | "ALTA";
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
${lead.city || lead.address ? `Ubicación: ${[lead.address, lead.city].filter(Boolean).join(", ")}` : ""}

Fuentes disponibles:
${references.length > 0 ? references.join("\n") : "(ninguna — buscá por nombre y ubicación)"}

Buscá y leé lo que haga falta para responder, en prosa, sin formato JSON:
- Qué hace el negocio y qué servicios ofrece, concretamente.
- Cómo parece reservarse un turno o hacerse una consulta hoy (web, WhatsApp, Instagram, teléfono).
- Qué se ve de su operación: cuántas sucursales, si atiende una sola persona o hay equipo, horarios, volumen aparente.
- Qué herramientas o sistemas parece usar (reservas online, algún software visible, o nada más que WhatsApp/redes).
- Reseñas o comentarios públicos que mencionen algo relevante (tiempos de espera, falta de respuesta, elogios a la atención).

Regla del SPA §4: separá HECHO (lo viste con esas palabras) de INFERENCIA (se deduce, podría estar mal) de HIPÓTESIS (plausible para el rubro, nada más). Si no encontraste nada de algún punto, decilo — no lo completes.`;
}

function buildStructurePrompt(evidence: string): string {
  return `Tenés el análisis en prosa de un negocio, hecho por vos mismo en un paso anterior. Convertilo al objeto pedido.

Análisis:
"""
${evidence}
"""

Reglas:
- "business_summary": dos o tres oraciones, qué hace el negocio y cómo opera hoy. Sólo hechos e inferencias razonables, nunca invención.
- "possible_pains": SIEMPRE son hipótesis (SPA §5) — el enriquecimiento nunca confirma un dolor, sólo una cita textual del lead lo hace. Si el análisis no sugiere ningún dolor plausible para este tipo de negocio, dejá el array vacío: no fabriques uno para completar el campo.
- "recommended_sales_angle": el más plausible de la lista dada, según lo que se ve del negocio. Si nada calza, elegí el más cercano — el campo es obligatorio, pero es una hipótesis de partida, no una conclusión.
- "confidence": ALTA si hay evidencia concreta (sitio propio, reseñas, reservas online visibles); BAJA si el análisis de arriba dice que no encontró casi nada.
- No inventes ningún dato que el análisis no sostenga. "No sé" en el texto de arriba significa dejar ese campo vacío o corto, no imaginar un valor.`;
}

/**
 * Corre los dos pases y devuelve el resultado validado. No escribe nada en la
 * base — eso lo hace el llamador (lib/leads/ai/actions.ts), que también sabe
 * el owner_id y el lead_id.
 */
export async function enrichLead(params: { apiKey: string; lead: EnrichmentInput }): Promise<EnrichmentResult> {
  const system = getSalesOS();

  const evidence = await generateGeminiGrounded({
    apiKey: params.apiKey,
    system,
    prompt: buildEvidencePrompt(params.lead),
  });

  const raw = await generateGeminiJson({
    apiKey: params.apiKey,
    system,
    prompt: buildStructurePrompt(evidence),
    schema: GEMINI_SCHEMA,
  });

  const parsed = EnrichmentOutputSchema.parse(JSON.parse(raw));

  return {
    businessSummary: parsed.business_summary,
    detectedServices: parsed.detected_services,
    possibleDecisionMaker: parsed.possible_decision_maker,
    operationSignals: parsed.operation_signals,
    technologySignals: parsed.technology_signals,
    possiblePains: parsed.possible_pains.map((pain) => ({
      description: pain.description,
      businessImpact: pain.business_impact,
    })),
    // Un ángulo inventado se descarta, no se guarda (mismo criterio que
    // relevance.ts con los ids que no estaban en el batch).
    recommendedSalesAngle: isSalesAngle(parsed.recommended_sales_angle) ? parsed.recommended_sales_angle : null,
    confidence: parsed.confidence,
  };
}
