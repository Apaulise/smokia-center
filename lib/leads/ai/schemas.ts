import { z } from "zod";

import type { GeminiSchema } from "@/lib/gemini/client";
import type { GroqJsonSchema } from "@/lib/groq/client";

/**
 * Esquemas de salida estructurada para las llamadas del copiloto de
 * prospección. Centralizados acá (Plan §1.9, archivos principales) para que
 * opening.ts, analyze.ts, follow-up.ts y rewrite.ts no repliquen cada uno el
 * suyo. Desde Plans/migracion-fuera-de-anthropic.md (Etapa 1), junto a cada
 * Zod schema va su equivalente de proveedor (`*_GROQ_SCHEMA` o
 * `*_GEMINI_SCHEMA`) — no derivado del Zod, a mano, mismo criterio que
 * `GEMINI_SCHEMA` en enrich.ts.
 */

// ── Apertura (§1.11) ─────────────────────────────────────────────────────────
// El objetivo del primer mensaje es obtener información, no vender (SPA §8):
// el esquema fuerza una "question" no vacía — una apertura sin pregunta no valida.

export const OpeningSchema = z.object({
  objective: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(600),
});
export type OpeningOutput = z.infer<typeof OpeningSchema>;

/** Groq, `strict: true`: TODO campo va en `required`, sin excepción. */
export const OPENING_GROQ_SCHEMA: GroqJsonSchema = {
  type: "object",
  properties: {
    objective: { type: "string" },
    question: { type: "string" },
    message: { type: "string" },
  },
  required: ["objective", "question", "message"],
  additionalProperties: false,
};

// ── Analizador de respuestas (§1.12) ─────────────────────────────────────────
// La forma exacta que pide el plan: analysis / crm_update / strategy / suggested_reply.

export const SignalUpdateSchema = z.object({
  kind: z.enum(["DOLOR", "OBJECION", "SENAL_COMPRA"]),
  // CONFIRMADO exige "evidence" con la cita textual — se re-valida en TS igual (§1.13), el esquema sólo lo sugiere.
  status: z.enum(["HIPOTESIS", "SOSPECHADO", "CONFIRMADO"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().default(null),
  evidence: z.string().trim().max(500).nullable().default(null),
  business_impact: z.string().trim().max(300).nullable().default(null),
  trigger_event: z.string().trim().max(300).nullable().default(null),
  timing: z.string().trim().max(300).nullable().default(null),
  already_solved: z.boolean().default(false),
});

/** Nullable en Groq strict no es "opcional": queda en `required` igual, tipado `["string", "null"]`. */
const SIGNAL_UPDATE_GROQ_SCHEMA: GroqJsonSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["DOLOR", "OBJECION", "SENAL_COMPRA"] },
    status: { type: "string", enum: ["HIPOTESIS", "SOSPECHADO", "CONFIRMADO"] },
    title: { type: "string" },
    description: { type: ["string", "null"] },
    evidence: { type: ["string", "null"] },
    business_impact: { type: ["string", "null"] },
    trigger_event: { type: ["string", "null"] },
    timing: { type: ["string", "null"] },
    already_solved: { type: "boolean" },
  },
  required: ["kind", "status", "title", "description", "evidence", "business_impact", "trigger_event", "timing", "already_solved"],
  additionalProperties: false,
};

export const AnalyzeOutputSchema = z.object({
  analysis: z.object({
    // AUTORESPUESTA nunca cuenta como respuesta humana (SPA §10, §17).
    response_type: z.enum(["AUTORESPUESTA", "HUMANA"]),
    what_happened: z.string().trim().min(1).max(500),
    learned: z.string().trim().max(500).nullable().default(null),
    interest_level: z.number().int().min(0).max(10),
    wants_meeting: z.boolean().default(false),
    disqualify: z.boolean().default(false),
    not_now: z.boolean().default(false),
    not_now_reason: z.string().trim().max(300).nullable().default(null),
    not_now_opportunity: z.string().trim().max(300).nullable().default(null),
    follow_up_date: z.string().trim().nullable().default(null),
  }),
  crm_update: z.object({
    signals: z.array(SignalUpdateSchema).max(6).default([]),
  }),
  strategy: z.object({
    reasoning: z.string().trim().min(1).max(800),
  }),
  suggested_reply: z.object({
    // Nunca más de una pregunta por mensaje (SPA §9) — se pide explícito, la cuenta la revisa el humano.
    message: z.string().trim().max(600),
    // Vacío cuando no corresponde responder todavía (p.ej. hay que esperar, o el lead cerró la conversación).
    has_reply: z.boolean(),
  }),
});
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;

/** El más profundo de los 4: 4 sub-objetos, uno con array de hasta 6 sub-objetos anidados. */
export const ANALYZE_GROQ_SCHEMA: GroqJsonSchema = {
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        response_type: { type: "string", enum: ["AUTORESPUESTA", "HUMANA"] },
        what_happened: { type: "string" },
        learned: { type: ["string", "null"] },
        interest_level: { type: "integer" },
        wants_meeting: { type: "boolean" },
        disqualify: { type: "boolean" },
        not_now: { type: "boolean" },
        not_now_reason: { type: ["string", "null"] },
        not_now_opportunity: { type: ["string", "null"] },
        follow_up_date: { type: ["string", "null"] },
      },
      required: [
        "response_type",
        "what_happened",
        "learned",
        "interest_level",
        "wants_meeting",
        "disqualify",
        "not_now",
        "not_now_reason",
        "not_now_opportunity",
        "follow_up_date",
      ],
      additionalProperties: false,
    },
    crm_update: {
      type: "object",
      properties: {
        signals: { type: "array", items: SIGNAL_UPDATE_GROQ_SCHEMA },
      },
      required: ["signals"],
      additionalProperties: false,
    },
    strategy: {
      type: "object",
      properties: { reasoning: { type: "string" } },
      required: ["reasoning"],
      additionalProperties: false,
    },
    suggested_reply: {
      type: "object",
      properties: {
        message: { type: "string" },
        has_reply: { type: "boolean" },
      },
      required: ["message", "has_reply"],
      additionalProperties: false,
    },
  },
  required: ["analysis", "crm_update", "strategy", "suggested_reply"],
  additionalProperties: false,
};

// ── Reescrituras de tono (§1.15) ─────────────────────────────────────────────

export const RewriteSchema = z.object({
  message: z.string().trim().min(1).max(600),
});
export type RewriteOutput = z.infer<typeof RewriteSchema>;

/** Va a Gemini, no Groq: reescribir un texto que ya existe no es decidir (Plan §1.7). */
export const REWRITE_GEMINI_SCHEMA: GeminiSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
};

// ── Follow-up (§1.16) ─────────────────────────────────────────────────────────

export const FollowUpSchema = z.object({
  // Si no puede citar algo concreto, no genera nada y lo dice (SPA §17) — por eso `message` es nullable.
  message: z.string().trim().max(600).nullable(),
  cannot_generate_reason: z.string().trim().max(300).nullable().default(null),
});
export type FollowUpOutput = z.infer<typeof FollowUpSchema>;

export const FOLLOWUP_GROQ_SCHEMA: GroqJsonSchema = {
  type: "object",
  properties: {
    message: { type: ["string", "null"] },
    cannot_generate_reason: { type: ["string", "null"] },
  },
  required: ["message", "cannot_generate_reason"],
  additionalProperties: false,
};
