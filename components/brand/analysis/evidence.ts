import type { BrandPostKind } from "@/lib/brand/sources/types";
import type { Database } from "@/lib/supabase/database.types";

type Recommendation = Database["public"]["Tables"]["brand_recommendations"]["Row"];

export type Evidence = { summary: string; postIds: string[]; metrics: Record<string, number | string> };

/** Lo mínimo de una pieza citada como evidencia para dibujar su miniatura — la arma la página, no el modelo. */
export interface EvidencePost {
  id: string;
  kind: BrandPostKind;
  thumbnailUrl: string | null;
  caption: string | null;
}

/** evidence llega como Json (jsonb genérico) — se valida en el borde, igual que cualquier dato de terceros (CLAUDE.md §5). */
export function parseEvidence(raw: Recommendation["evidence"]): Evidence {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { summary: "", postIds: [], metrics: {} };
  const record = raw as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    postIds: Array.isArray(record.postIds) ? record.postIds.filter((id): id is string => typeof id === "string") : [],
    metrics:
      typeof record.metrics === "object" && record.metrics !== null && !Array.isArray(record.metrics)
        ? (record.metrics as Record<string, number | string>)
        : {},
  };
}
