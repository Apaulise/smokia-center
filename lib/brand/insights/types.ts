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
}
