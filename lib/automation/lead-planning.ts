// Body de PATCH /api/automation/leads/:id. Sólo notas y próxima acción:
// el estado se cambia en POST .../status y el contacto en POST .../contact.

import { z } from "zod";

export const leadPlanningBodySchema = z
  .strictObject({
    notes: z.string().trim().max(4000).nullable().optional(),
    next_action_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((body) => body.notes !== undefined || body.next_action_at !== undefined, {
    message: "Indicá notes o next_action_at.",
  });

export type LeadPlanningBody = z.infer<typeof leadPlanningBodySchema>;

/**
 * snake_case del body → patch de `updateLeadPlanning`. Un string vacío (o
 * sólo espacios, que el schema ya recortó) borra la nota, igual que `null`.
 */
export function toLeadPlanningPatch(body: LeadPlanningBody): {
  notes?: string | null;
  nextActionAt?: string | null;
} {
  const patch: { notes?: string | null; nextActionAt?: string | null } = {};
  if (body.notes !== undefined) patch.notes = body.notes ? body.notes : null;
  if (body.next_action_at !== undefined) patch.nextActionAt = body.next_action_at;
  return patch;
}
