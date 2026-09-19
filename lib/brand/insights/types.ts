import type { BrandPostKind } from "@/lib/brand/sources/types";

/** Forma de entrada de los patrones — se mapea desde brand_latest_posts (snake_case) en el borde, CLAUDE.md §5. */
export interface AnalysisPost {
  postId: string;
  kind: BrandPostKind;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  newFollowers: number | null;
  reelAvgWatchTimeMs: number | null;
  reelSkipRate: number | null;
}

/** Una fila rankeada — misma forma para horario, formato, largo de caption y hashtags (components/brand/analysis/ranked-bars.tsx). */
export interface PatternRow {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  sampleSize: number;
  postIds: string[];
}

export interface RetentionInsight {
  rows: PatternRow[];
  avgSkipRate: number | null;
  avgWatchTimeMs: number | null;
}

/**
 * Clasificación de una pieza contra el baseline propio (Plans/03 §3.11, SOC §17).
 * GANADOR_CONVERSION existe como valor pero `classifyPosts` nunca lo produce: la
 * conversión es del Gestor de Facturación (Fase 2) — ver conversion.ts.
 */
export type ResultClass =
  | "GANADOR_ALCANCE"
  | "GANADOR_AUTORIDAD"
  | "GANADOR_CONVERSION"
  | "NEUTRO"
  | "EXPERIMENTO_FALLIDO"
  | "SIN_BASELINE"
  | "MADURANDO";

/** Los dos objetivos que se pueden medir con lo que devuelve el conector (SOC §16). */
export type ResultObjective = "ALCANCE" | "AUTORIDAD";

export interface ObjectiveScore {
  /** El valor de la pieza: views (o alcance) para ALCANCE, tasa de autoridad para AUTORIDAD. */
  value: number;
  /** Mediana de la ventana contra la que se comparó. */
  median: number;
  /** value / median — el "2,3× la mediana". */
  index: number;
  /** Cuántas piezas entraron a la mediana. */
  sample: number;
}

export interface PostResult {
  classification: ResultClass;
  /** null cuando ese objetivo no tiene baseline (muestra chica, sin señal o mediana 0). */
  reach: ObjectiveScore | null;
  authority: ObjectiveScore | null;
}

/** El baseline vigente de un formato: contra esto se compararía la próxima pieza. */
export interface KindBaseline {
  kind: BrandPostKind;
  reach: { median: number; sample: number } | null;
  authority: { median: number; sample: number } | null;
}

export interface BrandInsightsSummary {
  periodFrom: string | null;
  periodTo: string | null;
  totalPosts: number;
  bestTimes: PatternRow[];
  formatPerformance: PatternRow[];
  captionLength: PatternRow[];
  topHashtags: PatternRow[];
  retention: RetentionInsight;
  topPosts: AnalysisPost[];
  bottomPosts: AnalysisPost[];
  /** Por postId, todas las piezas — se recalcula en cada llamada, no se persiste (§3.11). */
  results: Record<string, PostResult>;
  baselines: KindBaseline[];
}
