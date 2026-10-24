import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";

import type { OpsArea, OpsChannel, OpsDecision, OpsEstado, OpsImpact, OpsWorkArea } from "./types";
import { OPS_AREAS, OPS_CHANNELS, OPS_DECISIONS, OPS_ESTADOS, OPS_IMPACTS, OPS_IMPROVEMENT_STATUSES, OPS_WORK_AREAS } from "./types";

export const AREA_LABEL: Record<OpsArea, string> = {
  prospeccion: "Prospección",
  ventas: "Ventas",
  instagram: "Instagram",
  youtube: "YouTube",
  operaciones: "Operaciones",
  auditor: "Auditor",
};

export const ESTADO_LABEL: Record<OpsEstado, string> = {
  hecho: "Hecho",
  pendiente: "Pendiente",
  bloqueo: "Bloqueo",
};

/** Mismo grupo de temperatura que los badges de Leads: hecho = ganado, pendiente = curso, bloqueo = salida. */
export const ESTADO_GROUP = {
  hecho: "ganado",
  pendiente: "curso",
  bloqueo: "salida",
} as const;

export const CHANNEL_LABEL: Record<OpsChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram",
};

export const IMPACT_LABEL: Record<OpsImpact, string> = {
  alto: "Impacto alto",
  medio: "Impacto medio",
  bajo: "Impacto bajo",
};

const IMPACT_PERCENT: Record<OpsImpact, number> = { alto: 85, medio: 55, bajo: 30 };

export function impactPercent(impact: OpsImpact, score: number | null): number {
  if (score == null) return IMPACT_PERCENT[impact];
  return Math.min(100, Math.max(0, score));
}

const MISSING_SCHEMA_CODES = new Set(["PGRST205", "PGRST204", "42P01", "42704"]);

/** La migración de Operaciones todavía no está en la base (o PostgREST no recargó el esquema). */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true;
  return /schema cache|does not exist|Could not find the table/i.test(error.message ?? "");
}

/** Acepta camelCase (contrato de la API) y snake_case (el de las columnas). */
export function normalizeOpsKeys(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camel] = value;
  }
  return out;
}

const externalId = z.string().trim().min(1).max(120);
const agent = z.string().trim().min(1).max(80);
const isoTimestamp = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha inválida.");

const emptyToNull = (value: unknown) => (value === "" || value === undefined ? null : value);

export const opsStatusPayload = z.object({
  type: z.literal("status"),
  externalId,
  area: z.enum(OPS_WORK_AREAS),
  agent,
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(500).optional().default(""),
  estado: z.enum(OPS_ESTADOS),
  needsOk: z.boolean().optional().default(false),
  occurredAt: isoTimestamp.optional(),
});

export const opsApprovalPayload = z.object({
  type: z.literal("approval"),
  externalId,
  leadName: z.string().trim().min(1).max(200),
  leadId: z.preprocess(emptyToNull, z.uuid().nullable().optional()).transform((value) => value ?? null),
  channel: z.enum(OPS_CHANNELS).optional().default("whatsapp"),
  draftBody: z.string().trim().min(1).max(4000),
  reason: z.string().trim().max(500).optional().default(""),
  agent,
  occurredAt: isoTimestamp.optional(),
});

export const opsImprovementPayload = z.object({
  type: z.literal("improvement"),
  externalId,
  area: z.enum(OPS_AREAS),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  impact: z.enum(OPS_IMPACTS),
  impactScore: z.number().int().min(0).max(100).nullable().optional().default(null),
  status: z.enum(OPS_IMPROVEMENT_STATUSES).optional().default("abierta"),
  weekLabel: z.string().trim().min(1).max(40).nullable().optional().default(null),
});

export const opsIngestPayload = z.discriminatedUnion("type", [opsStatusPayload, opsApprovalPayload, opsImprovementPayload]);

export type OpsIngestPayload = z.infer<typeof opsIngestPayload>;

export const approvalsQuerySchema = z.object({
  decision: z.enum(OPS_DECISIONS).optional().default("approved"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  since: isoTimestamp.optional(),
});

export type ApprovalsQuery = z.infer<typeof approvalsQuerySchema>;

export interface DecisionEvent {
  decision: OpsDecision;
  finalBody: string | null;
  at: string;
  by: string | null;
}

const decisionEventSchema = z.object({
  decision: z.enum(OPS_DECISIONS),
  finalBody: z.string().nullable(),
  at: z.string(),
  by: z.string().nullable(),
});

export function parseHistory(value: Json): DecisionEvent[] {
  const parsed = z.array(decisionEventSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Si el texto no cambió, la decisión es un OK del borrador. Si cambió, queda como editado. */
export function resolveApprovalDecision(draftBody: string, finalBody: string): "approved" | "edited" {
  return finalBody.trim() === draftBody.trim() ? "approved" : "edited";
}

export function isWorkArea(value: string): value is OpsWorkArea {
  return (OPS_WORK_AREAS as readonly string[]).includes(value);
}
