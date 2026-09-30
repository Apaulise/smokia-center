import { isRealEdit } from "@/lib/leads/ai/style/diff";
import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas del bucle de estilo (Plan §1.20). El umbral de "edición real" se
 * aplica acá en TypeScript y no en SQL: `edit_distance` se guarda crudo justo
 * para poder recalibrarlo sin migrar datos (lib/leads/ai/style/constants.ts).
 */

export interface StyleStats {
  /** Borradores de IA confirmados, editados o no. */
  total: number;
  /** De esos, cuántos el vendedor reescribió de verdad. */
  edited: number;
  /** Distancia media entre los editados — null si todavía no hay ninguno. */
  averageDistance: number | null;
}

/**
 * "Editaste 14 de 22 borradores" del dashboard. Es la única prueba de si el
 * bucle sirve: si ese número baja con el tiempo, el agente está aprendiendo.
 */
export async function getStyleStats(): Promise<StyleStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_messages")
    .select("edit_distance, content")
    .not("generated_content", "is", null);
  if (error) throw error;

  const rows = data ?? [];
  const edited = rows.filter((row) => isRealEdit(row.edit_distance ?? 0, row.content.length));
  const sum = edited.reduce((acc, row) => acc + (row.edit_distance ?? 0), 0);

  return {
    total: rows.length,
    edited: edited.length,
    averageDistance: edited.length > 0 ? Math.round(sum / edited.length) : null,
  };
}
