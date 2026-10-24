// Body de PATCH /api/automation/leads/:id.
//
// Corrige teléfono, nota y/o próxima acción. El estado se cambia en
// POST .../status y el contacto (mensaje + last_contacted_at) en
// POST .../contact. Este patch no escribe ninguna de las dos cosas.

import { z } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { computeDedupeKey, normalizePhone } from "@/lib/leads/dedupe";

const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .refine((value) => value == null || value === "" || normalizePhone(value) !== null, {
    message: "Teléfono inválido.",
  });

export const leadPlanningBodySchema = z
  .strictObject({
    /** Quién escribe. También puede venir en el header `X-Agent`. */
    agent: automationAgentIdSchema.optional(),
    /** Vacío o `null` borra la nota. Un texto la reemplaza y queda en el historial. */
    notes: z.string().trim().max(4000).nullable().optional(),
    /** ISO 8601 con zona, o `null` para borrar la próxima acción. */
    next_action_at: z.iso.datetime({ offset: true }).nullable().optional(),
    /**
     * Teléfono o WhatsApp. Se guarda normalizado (Argentina, igual que el
     * dedupe). Vacío o `null` lo borra. Un número que no se puede normalizar
     * se rechaza: no se persiste basura.
     */
    phone: phoneSchema,
  })
  .refine((body) => body.notes !== undefined || body.next_action_at !== undefined || body.phone !== undefined, {
    message: "Indicá phone, notes o next_action_at.",
  });

export type LeadPlanningBody = z.infer<typeof leadPlanningBodySchema>;

export type LeadCorrectionInput = {
  notes?: string | null;
  nextActionAt?: string | null;
  /** `undefined` no toca el teléfono. `null` lo borra. */
  phone?: string | null;
};

/**
 * snake_case del body → campos que entiende el plan. Un string vacío (o sólo
 * espacios, que el schema ya recortó) borra la nota o el teléfono, igual que
 * `null`. El teléfono todavía no está normalizado: lo resuelve el plan.
 */
export function toLeadCorrectionInput(body: LeadPlanningBody): LeadCorrectionInput {
  const input: LeadCorrectionInput = {};
  if (body.notes !== undefined) input.notes = body.notes ? body.notes : null;
  if (body.next_action_at !== undefined) input.nextActionAt = body.next_action_at;
  if (body.phone !== undefined) input.phone = body.phone ? body.phone : null;
  return input;
}

/** Actividad de historial. No es un contacto: el timeline ya tiene `NOTA`. */
export const CORRECTION_ACTIVITY_TYPE = "NOTA" as const;

export type LeadCorrectionSnapshot = {
  phone: string | null;
  notes: string | null;
  nextActionAt: string | null;
  dedupeKey: string;
  name: string;
  website: string | null;
  city: string | null;
  sourceUrl: string | null;
};

export type LeadCorrectionColumns = {
  notes?: string | null;
  next_action_at?: string | null;
  phone?: string | null;
  dedupe_key?: string;
};

export type LeadCorrectionPlan = {
  /** `null` si no hay columnas que escribir. Nunca incluye status ni last_contacted_at. */
  columns: LeadCorrectionColumns | null;
  /** Clave nueva, sólo si cambia, para rechazar un choque antes de escribir. */
  nextDedupeKey: string | null;
  /** Texto de la `NOTA`, o `null` si no hubo cambio que valga la pena anotar. */
  activity: string | null;
};

/**
 * Qué hay que escribir, comparado contra el lead actual.
 *
 * Un teléfono que ya normaliza a lo guardado, la misma fecha en otra zona, o
 * la misma nota, no generan update ni actividad: repetir el PATCH es inocuo.
 * Una nota distinta sí queda en el historial, aunque sea lo único que cambió.
 */
export function planLeadCorrection(
  current: LeadCorrectionSnapshot,
  input: LeadCorrectionInput,
  agent: string,
): { ok: true; plan: LeadCorrectionPlan } | { ok: false; reason: "invalid_phone"; message: string } {
  const columns: LeadCorrectionColumns = {};
  const lines: string[] = [];
  let nextDedupeKey: string | null = null;

  if (input.phone !== undefined) {
    const nextPhone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !nextPhone) {
      return { ok: false, reason: "invalid_phone", message: "Teléfono inválido." };
    }
    if (current.phone !== nextPhone) {
      columns.phone = nextPhone;
      const dedupeKey = computeDedupeKey({
        name: current.name,
        phone: nextPhone,
        website: current.website,
        city: current.city,
        sourceUrl: current.sourceUrl,
        raw: null,
      });
      if (dedupeKey !== current.dedupeKey) {
        columns.dedupe_key = dedupeKey;
        nextDedupeKey = dedupeKey;
      }
      lines.push(phoneLine(current.phone, nextPhone));
    }
  }

  if (input.nextActionAt !== undefined) {
    const next = input.nextActionAt ? new Date(input.nextActionAt).toISOString() : null;
    if (!sameInstant(current.nextActionAt, next)) {
      columns.next_action_at = next;
      lines.push(nextActionLine(current.nextActionAt, input.nextActionAt));
    }
  }

  if (input.notes !== undefined) {
    const nextNotes = input.notes ? input.notes : null;
    if (nextNotes && current.notes !== nextNotes) {
      columns.notes = nextNotes;
      lines.push(nextNotes);
    } else if (!nextNotes && current.notes) {
      columns.notes = null;
      lines.push("Nota borrada.");
    }
  }

  return {
    ok: true,
    plan: {
      columns: Object.keys(columns).length > 0 ? columns : null,
      nextDedupeKey,
      activity: lines.length === 0 ? null : [`[${agent}] ${lines[0]}`, ...lines.slice(1)].join("\n"),
    },
  };
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left == null || right == null) return left === right;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return left === right;
  return a === b;
}

function phoneLine(from: string | null, to: string | null): string {
  if (!from && to) return `Teléfono cargado: ${to}.`;
  if (from && !to) return `Teléfono borrado (antes ${from}).`;
  return `Teléfono corregido: ${to} (antes ${from}).`;
}

function nextActionLine(from: string | null, requested: string | null): string {
  if (!requested) return "Próxima acción borrada.";
  if (!from) return `Próxima acción: ${requested}.`;
  return `Próxima acción: ${requested} (antes ${from}).`;
}
