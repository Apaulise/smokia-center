import type { Json } from "@/lib/supabase/database.types";

/**
 * El segundo mensaje de una apertura y el tipo en texto libre no tienen
 * columna propia: viven en `lead_messages.analysis.opening` de la fila del
 * vendedor. `analysis` ya era jsonb nullable. Las filas viejas, sin esa
 * clave, se leen igual que antes.
 */
export interface OpeningMeta {
  part: 1 | 2 | null;
  type: string | null;
  variant: string | null;
}

const EMPTY: OpeningMeta = { part: null, type: null, variant: null };

export function readOpeningMeta(analysis: unknown): OpeningMeta {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return EMPTY;
  const opening = (analysis as { opening?: unknown }).opening;
  if (!opening || typeof opening !== "object" || Array.isArray(opening)) return EMPTY;
  const record = opening as { part?: unknown; type?: unknown; variant?: unknown };
  const part = record.part === 2 ? 2 : record.part === 1 ? 1 : null;
  const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : null;
  const variant =
    typeof record.variant === "string" && record.variant.trim()
      ? record.variant.trim()
      : typeof record.variant === "number"
        ? String(record.variant)
        : null;
  return { part, type, variant };
}

/** Null si no hay nada que guardar: una apertura vieja no escribe `analysis`. */
export function openingMetaJson(meta: OpeningMeta): Json | null {
  if (meta.part !== 2 && !meta.type && !meta.variant) return null;
  return {
    opening: {
      part: meta.part ?? 1,
      type: meta.type,
      variant: meta.variant,
    },
  };
}

/**
 * Lo que ve la API nueva. En la base el segundo mensaje sigue siendo
 * `kind = APERTURA` (el enum no tiene otro valor) y `part = 2`.
 */
export function publicOutboundKind(kind: string | null, analysis: unknown): string | null {
  if (kind === "APERTURA" && readOpeningMeta(analysis).part === 2) return "APERTURA_M2";
  return kind;
}
