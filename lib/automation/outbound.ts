import { z } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { resolveOccurredAt } from "@/lib/automation/occurred-at";
import { ANGLE_LABEL, SALES_ANGLES, isSalesAngle, type SalesAngle } from "@/lib/leads/ai/angles";
import { editDistance } from "@/lib/leads/ai/style/diff";
import { openingMetaJson } from "@/lib/leads/opening-meta";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";
import type { Json } from "@/lib/supabase/database.types";

const leadStatusSchema = z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]);

const partSchema = z
  .union([z.literal(1), z.literal(2), z.literal("1"), z.literal("2")])
  .transform((value) => Number(value) as 1 | 2);

/**
 * "Le mandé este mensaje". Los campos nuevos son opcionales: un body viejo
 * (channel, content, status, note, opening) se lee igual que antes.
 */
export const contactBodySchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("WHATSAPP"),
  /** El mensaje que se mandó, tal cual. */
  content: z.string().trim().min(1).max(4000),
  /** Estado nuevo. Sin él: CONTACTADO si el lead estaba en NUEVO/LISTO; si ya estaba más adelante no se toca. */
  status: leadStatusSchema.optional(),
  next_action_at: z.iso.datetime({ offset: true }).optional(),
  /** Nota interna para el timeline (no es el mensaje). */
  note: z.string().trim().max(2000).optional(),
  /**
   * Hora real del envío. Sin ella se usa el instante de la carga, como antes.
   * Con ella, un reintento del mismo texto en ±2 minutos no duplica la fila.
   */
  occurred_at: z.iso.datetime({ offset: true }).optional(),
  /**
   * APERTURA_M2 es el segundo mensaje de la misma apertura: no es un
   * seguimiento. `part` dice lo mismo (1 o 2) si el agente no manda `kind`.
   */
  kind: z.enum(["APERTURA", "APERTURA_M2", "SEGUIMIENTO"]).optional(),
  part: partSchema.optional(),
  /** Tipo de apertura en texto libre. Si coincide con un ángulo, también se guarda el enum. */
  type: z.string().trim().min(1).max(80).optional(),
  /** Variante en texto libre, o el número 1–99 de la variante histórica. */
  variant: z.union([z.number().int().min(1).max(99), z.string().trim().min(1).max(80)]).optional(),
  /** Opcional. Si es un agente de prospección, una APERTURA sin tipo se rechaza. */
  agent: automationAgentIdSchema.optional(),
  /**
   * Si el mensaje salió de `POST .../opening-message`: el ángulo, la variante y
   * el texto que propuso la IA. Cuenta como tipo: no hace falta repetirlo en `type`.
   */
  opening: z
    .object({
      angle: z.string().refine(isSalesAngle, "Ángulo inválido."),
      variant: z.number().int().min(1).max(9),
      generated_content: z.string().trim().min(1).max(600),
    })
    .optional(),
});

export type ContactBody = z.infer<typeof contactBodySchema>;

export interface OutboundPlan {
  kind: "APERTURA" | "SEGUIMIENTO";
  /** 2 = segundo mensaje de la apertura. Null en un seguimiento. */
  part: 1 | 2 | null;
  angle: SalesAngle | null;
  variant: number | null;
  analysis: Json | null;
  generatedBy: "IA" | null;
  generatedContent: string | null;
  editDistance: number | null;
  occurredAt: string;
}

/**
 * Decide kind, parte, tipo y hora sin tocar la base. El default sin `kind`
 * es el de siempre: la primera salida confirmada es apertura; el resto,
 * seguimiento. Un `opening` sigue forzando apertura.
 */
export function planOutboundMessage(input: {
  body: ContactBody;
  agent: string | null;
  priorOutbound: number;
  prospectingAgents: readonly string[];
  now?: Date;
}): { ok: true; plan: OutboundPlan } | { ok: false; message: string } {
  const occurred = resolveOccurredAt(input.body.occurred_at, input.now);
  if (!occurred.ok) return occurred;

  const requestedKind = input.body.kind;
  const requestedPart = input.body.part;

  if (requestedKind === "SEGUIMIENTO" && requestedPart != null) {
    return { ok: false, message: "Un seguimiento no lleva parte de apertura." };
  }
  if (requestedKind === "APERTURA" && requestedPart === 2) {
    return { ok: false, message: "La parte 2 se manda como APERTURA_M2, no como APERTURA." };
  }
  if (requestedKind === "APERTURA_M2" && requestedPart === 1) {
    return { ok: false, message: "APERTURA_M2 es la parte 2 de la apertura." };
  }
  if (input.body.opening && (requestedKind === "SEGUIMIENTO" || requestedKind === "APERTURA_M2" || requestedPart === 2)) {
    return { ok: false, message: "El bloque opening es sólo de la primera apertura." };
  }

  let kind: "APERTURA" | "SEGUIMIENTO";
  let part: 1 | 2 | null;
  if (requestedKind === "APERTURA_M2" || requestedPart === 2) {
    kind = "APERTURA";
    part = 2;
  } else if (requestedKind === "APERTURA" || requestedPart === 1) {
    kind = "APERTURA";
    part = 1;
  } else if (requestedKind === "SEGUIMIENTO") {
    kind = "SEGUIMIENTO";
    part = null;
  } else if (input.body.opening || input.priorOutbound === 0) {
    kind = "APERTURA";
    part = 1;
  } else {
    kind = "SEGUIMIENTO";
    part = null;
  }

  const typeText = input.body.type?.trim() || null;
  const variantText = input.body.variant == null ? null : String(input.body.variant).trim();
  const angleFromType = typeText ? salesAngleFromType(typeText) : null;
  const angleFromOpening = input.body.opening ? (input.body.opening.angle as SalesAngle) : null;
  const hasType = Boolean(typeText) || Boolean(angleFromOpening);
  const prospecting = input.agent != null && input.prospectingAgents.includes(input.agent);
  if (kind === "APERTURA" && part !== 2 && prospecting && !hasType) {
    return { ok: false, message: "Una apertura de prospección tiene que traer el tipo (type o opening.angle)." };
  }

  const numericFromBody = numericVariantOf(input.body.variant);
  const variant = part === 2 ? null : (numericFromBody ?? input.body.opening?.variant ?? null);
  const angle = part === 2 ? null : (angleFromType ?? angleFromOpening);
  const ai = part !== 2 && input.body.opening ? input.body.opening : null;

  return {
    ok: true,
    plan: {
      kind,
      part,
      angle,
      variant,
      analysis: openingMetaJson({
        part: part === 2 ? 2 : typeText || variantText ? 1 : null,
        type: typeText,
        variant: variantText || null,
      }),
      generatedBy: ai ? "IA" : null,
      generatedContent: ai && ai.generated_content !== input.body.content ? ai.generated_content : null,
      editDistance: ai && ai.generated_content !== input.body.content ? editDistance(ai.generated_content, input.body.content) : null,
      occurredAt: occurred.iso,
    },
  };
}

function salesAngleFromType(type: string): SalesAngle | null {
  const key = type.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (isSalesAngle(key)) return key;
  const lower = type.trim().toLowerCase();
  return SALES_ANGLES.find((angle) => ANGLE_LABEL[angle].toLowerCase() === lower) ?? null;
}

function numericVariantOf(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed >= 1 && parsed <= 99) return parsed;
  }
  return null;
}
