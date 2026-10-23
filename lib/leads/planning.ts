/**
 * Campos de planificación de un lead (`notes`, `next_action_at`).
 *
 * `undefined` no toca la columna. `null` la borra. No hay `status` acá a
 * propósito: este update no cambia el estado ni arma una actividad.
 */
export type LeadPlanningPatch = {
  notes?: string | null;
  nextActionAt?: string | null;
};

export type LeadPlanningColumns = {
  notes?: string | null;
  next_action_at?: string | null;
};

/** Columnas a escribir. `null` si el patch no trae ningún campo. */
export function leadPlanningColumns(patch: LeadPlanningPatch): LeadPlanningColumns | null {
  const update: LeadPlanningColumns = {};
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.nextActionAt !== undefined) {
    update.next_action_at = patch.nextActionAt ? new Date(patch.nextActionAt).toISOString() : null;
  }
  if (update.notes === undefined && update.next_action_at === undefined) return null;
  return update;
}
