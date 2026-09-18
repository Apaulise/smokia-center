import { computeTopHashtags } from "./hashtags";
import { computeBestTimes, computeCaptionLength, computeFormatPerformance, computeRetention, splitTopAndBottom } from "./patterns";
import type { AnalysisPost, BrandInsightsSummary } from "./types";

/** Piso de contenido para que un patrón signifique algo — menos que esto es ruido, no una tendencia. */
export const MIN_POSTS_FOR_ANALYSIS = 5;

export function computeBrandInsights(posts: AnalysisPost[]): BrandInsightsSummary | null {
  if (posts.length < MIN_POSTS_FOR_ANALYSIS) return null;

  const dates = posts.map((p) => p.publishedAt).filter((d): d is string => d !== null);
  const { top, bottom } = splitTopAndBottom(posts);

  return {
    periodFrom: dates.length > 0 ? dates.reduce((min, d) => (d < min ? d : min)) : null,
    periodTo: dates.length > 0 ? dates.reduce((max, d) => (d > max ? d : max)) : null,
    totalPosts: posts.length,
    bestTimes: computeBestTimes(posts),
    formatPerformance: computeFormatPerformance(posts),
    captionLength: computeCaptionLength(posts),
    topHashtags: computeTopHashtags(posts),
    retention: computeRetention(posts),
    topPosts: top,
    bottomPosts: bottom,
  };
}

export { extractHashtags } from "./hashtags";
export type { AnalysisPost, BrandInsightsSummary, PatternRow } from "./types";
