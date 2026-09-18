import { engagementRate } from "./engagement";
import type { AnalysisPost, PatternRow } from "./types";

const MIN_TOP_SET = 3;
const MIN_TOP_COUNT = 2;
const VISIBLE_ROWS = 8;

/** Compartido con la ficha de post (§3.4): mismo regex, un solo lugar que lo mantiene. */
export function extractHashtags(caption: string | null): string[] {
  if (!caption) return [];
  return [...new Set(caption.match(/#[\p{L}0-9_]+/gu) ?? [])];
}

/**
 * Hashtags que aparecen más seguido en el contenido que mejor funcionó
 * (Plans/03 §3.5). "Mejor" = el tercio superior por engagementRate, no un
 * umbral fijo: se adapta al volumen real de contenido sincronizado.
 */
export function computeTopHashtags(posts: AnalysisPost[]): PatternRow[] {
  const ranked = posts
    .map((post) => ({ post, rate: engagementRate(post) }))
    .filter((r): r is { post: AnalysisPost; rate: number } => r.rate !== null)
    .sort((a, b) => b.rate - a.rate);

  if (ranked.length < MIN_TOP_SET) return [];

  const topCount = Math.max(MIN_TOP_SET, Math.round(ranked.length / 3));
  const topSet = ranked.slice(0, topCount).map((r) => r.post);
  const restSet = ranked.slice(topCount).map((r) => r.post);

  const tally = new Map<string, { topCount: number; restCount: number; postIds: Set<string> }>();

  for (const post of topSet) {
    for (const tag of extractHashtags(post.caption)) {
      const entry = tally.get(tag) ?? { topCount: 0, restCount: 0, postIds: new Set() };
      entry.topCount += 1;
      entry.postIds.add(post.postId);
      tally.set(tag, entry);
    }
  }
  for (const post of restSet) {
    for (const tag of extractHashtags(post.caption)) {
      const entry = tally.get(tag);
      if (entry) entry.restCount += 1;
    }
  }

  return [...tally.entries()]
    .filter(([, v]) => v.topCount >= MIN_TOP_COUNT)
    .sort((a, b) => b[1].topCount - a[1].topCount)
    .slice(0, VISIBLE_ROWS)
    .map(([tag, v]) => ({
      key: tag,
      label: tag,
      value: v.topCount,
      displayValue: `${v.topCount} de ${v.topCount + v.restCount} posts`,
      sampleSize: v.topCount + v.restCount,
      postIds: [...v.postIds],
    }));
}
