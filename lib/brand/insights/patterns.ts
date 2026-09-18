import { engagementRate } from "./engagement";
import type { AnalysisPost, PatternRow, RetentionInsight } from "./types";

const MIN_BUCKET_SAMPLE = 2;
const VISIBLE_ROWS = 5;

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const HOUR_BUCKETS: [start: number, end: number, label: string][] = [
  [0, 6, "madrugada (0–6h)"],
  [6, 12, "mañana (6–12h)"],
  [12, 18, "tarde (12–18h)"],
  [18, 24, "noche (18–24h)"],
];

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Mejor día y horario para publicar (Plans/03 §3.5). Bucket de 6hs en vez de
 * hora exacta: con el volumen de posts de una cuenta personal, un bucket por
 * hora deja casi todas las celdas con 0-1 posts — no alcanza para un patrón.
 * En UTC a propósito: no hay timezone del usuario guardada en ningún lado, y
 * usar la hora local del servidor sería no determinístico según dónde corra.
 */
export function computeBestTimes(posts: AnalysisPost[]): PatternRow[] {
  const buckets = new Map<string, { label: string; rates: number[]; postIds: string[] }>();

  for (const post of posts) {
    if (!post.publishedAt) continue;
    const rate = engagementRate(post);
    if (rate === null) continue;

    const date = new Date(post.publishedAt);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    const bucket = HOUR_BUCKETS.find(([start, end]) => hour >= start && hour < end);
    if (!bucket) continue;

    const key = `${day}-${bucket[2]}`;
    const entry = buckets.get(key) ?? { label: `${DAY_LABELS[day]}, ${bucket[2]}`, rates: [], postIds: [] };
    entry.rates.push(rate);
    entry.postIds.push(post.postId);
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .filter(([, v]) => v.rates.length >= MIN_BUCKET_SAMPLE)
    .map(([key, v]) => ({
      key,
      label: v.label,
      value: average(v.rates),
      displayValue: `${(average(v.rates) * 100).toFixed(1)}% interacción`,
      sampleSize: v.rates.length,
      postIds: v.postIds,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, VISIBLE_ROWS);
}

const KIND_LABEL: Record<AnalysisPost["kind"], string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

/** Formato vs. guardados (Plans/03 §3.5): guardados/alcance promedio por tipo de pieza. */
export function computeFormatPerformance(posts: AnalysisPost[]): PatternRow[] {
  const buckets = new Map<string, { rates: number[]; postIds: string[] }>();

  for (const post of posts) {
    if (!post.reach || post.reach <= 0 || post.saved === null) continue;
    const entry = buckets.get(post.kind) ?? { rates: [], postIds: [] };
    entry.rates.push(post.saved / post.reach);
    entry.postIds.push(post.postId);
    buckets.set(post.kind, entry);
  }

  return [...buckets.entries()]
    .map(([kind, v]) => ({
      key: kind,
      label: KIND_LABEL[kind as AnalysisPost["kind"]] ?? kind,
      value: average(v.rates),
      displayValue: `${(average(v.rates) * 100).toFixed(1)}% guardados/alcance`,
      sampleSize: v.rates.length,
      postIds: v.postIds,
    }))
    .sort((a, b) => b.value - a.value);
}

const LENGTH_BUCKETS: [max: number, label: string][] = [
  [0, "Sin caption"],
  [50, "Corto (≤50 caracteres)"],
  [150, "Medio (51–150 caracteres)"],
  [Infinity, "Largo (150+ caracteres)"],
];

function lengthBucketFor(length: number): string {
  return LENGTH_BUCKETS.find(([max]) => length <= max)?.[1] ?? LENGTH_BUCKETS[LENGTH_BUCKETS.length - 1][1];
}

/** Largo del caption (Plans/03 §3.5) vs. tasa de interacción. */
export function computeCaptionLength(posts: AnalysisPost[]): PatternRow[] {
  const buckets = new Map<string, { rates: number[]; postIds: string[] }>();

  for (const post of posts) {
    const rate = engagementRate(post);
    if (rate === null) continue;
    const label = lengthBucketFor(post.caption?.length ?? 0);
    const entry = buckets.get(label) ?? { rates: [], postIds: [] };
    entry.rates.push(rate);
    entry.postIds.push(post.postId);
    buckets.set(label, entry);
  }

  return [...buckets.entries()]
    .filter(([, v]) => v.rates.length >= MIN_BUCKET_SAMPLE)
    .map(([label, v]) => ({
      key: label,
      label,
      value: average(v.rates),
      displayValue: `${(average(v.rates) * 100).toFixed(1)}% interacción`,
      sampleSize: v.rates.length,
      postIds: v.postIds,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Retención en reels (Plans/03 §3.5, "duración vs. retención" + "hook vs.
 * skip rate"): no hay duración del video sincronizada desde Windsor, así que
 * el proxy real de retención son watch time promedio y skip rate — que ya es
 * el mismo par que §3.4 usa para "qué hooks retuvieron". Se ordena por skip
 * rate ascendente (mejor) y se muestran los extremos: mejores y peores reels.
 */
export function computeRetention(posts: AnalysisPost[]): RetentionInsight {
  const reels = posts.filter(
    (p): p is AnalysisPost & { reelSkipRate: number } => p.kind === "REEL" && p.reelSkipRate !== null,
  );
  if (reels.length === 0) return { rows: [], avgSkipRate: null, avgWatchTimeMs: null };

  const sorted = [...reels].sort((a, b) => a.reelSkipRate - b.reelSkipRate);
  const half = Math.ceil(sorted.length / 2);
  const best = sorted.slice(0, Math.min(3, half));
  const worst = sorted.slice(-Math.min(3, sorted.length - half)).reverse();

  const toRow = (post: AnalysisPost & { reelSkipRate: number }, tag: string): PatternRow => ({
    key: `${tag}-${post.postId}`,
    label: post.caption?.slice(0, 60) || "(sin caption)",
    value: post.reelSkipRate,
    displayValue: `${post.reelSkipRate.toFixed(1)}% skip rate${
      post.reelAvgWatchTimeMs !== null ? ` · ${Math.round(post.reelAvgWatchTimeMs / 1000)}s promedio` : ""
    }`,
    sampleSize: 1,
    postIds: [post.postId],
  });

  const watchTimes = reels.map((r) => r.reelAvgWatchTimeMs).filter((v): v is number => v !== null);

  return {
    rows: [...best.map((p) => toRow(p, "mejor")), ...worst.map((p) => toRow(p, "peor"))],
    avgSkipRate: average(reels.map((r) => r.reelSkipRate)),
    avgWatchTimeMs: watchTimes.length > 0 ? average(watchTimes) : null,
  };
}

/** Mejor y peor contenido del período (Plans/03 §3.5) por tasa de interacción compuesta. */
export function splitTopAndBottom(posts: AnalysisPost[], take = 5): { top: AnalysisPost[]; bottom: AnalysisPost[] } {
  const ranked = posts
    .map((post) => ({ post, rate: engagementRate(post) }))
    .filter((r): r is { post: AnalysisPost; rate: number } => r.rate !== null)
    .sort((a, b) => b.rate - a.rate);

  const n = Math.min(take, Math.floor(ranked.length / 2));
  if (n <= 0) return { top: ranked.map((r) => r.post), bottom: [] };

  return {
    top: ranked.slice(0, n).map((r) => r.post),
    bottom: ranked.slice(-n).map((r) => r.post),
  };
}
