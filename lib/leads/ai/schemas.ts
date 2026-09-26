import { z } from "zod";

/**
 * Esquemas de salida estructurada para las llamadas a Claude del copiloto de
 * prospección. Centralizados acá (Plan §1.9, archivos principales) para que
 * opening.ts, analyze.ts y rewrite.ts no repliquen cada uno el suyo.
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

// ── Reescrituras de tono (§1.15) ─────────────────────────────────────────────

export const RewriteSchema = z.object({
  message: z.string().trim().min(1).max(600),
});
export type RewriteOutput = z.infer<typeof RewriteSchema>;

// ── Follow-up (§1.16) ─────────────────────────────────────────────────────────

export const FollowUpSchema = z.object({
  // Si no puede citar algo concreto, no genera nada y lo dice (SPA §17) — por eso `message` es nullable.
  message: z.string().trim().max(600).nullable(),
  cannot_generate_reason: z.string().trim().max(300).nullable().default(null),
});
export type FollowUpOutput = z.infer<typeof FollowUpSchema>;
