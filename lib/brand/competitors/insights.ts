import type { BrandPostKind } from "@/lib/brand/sources/types";

/*
 * Lo que se calcula de las publicaciones de una cuenta ajena (Plans/03 §3.8).
 * Todo determinístico y sin modelo, igual que lib/brand/insights/: el número lo
 * calcula el código, no se le pide a nadie que lo estime.
 *
 * La única comparación que significa algo entre cuentas de tamaños distintos
 * es una publicación contra el rendimiento habitual de SU PROPIA cuenta (SOC
 * §7: "buscamos outliers, no únicamente cuentas grandes"). Nunca se comparan
 * views de una cuenta contra views de otra.
 */

/** ≥ este múltiplo de la mediana de su propia cuenta → outlier. Más exigente que el 1,5× de las piezas propias: un outlier ajeno tiene que justificar copiarle el mecanismo. Es una decisión editorial y se va a mover. */
export const OUTLIER_THRESHOLD = 2;

/** Con menos publicaciones del mismo grupo no hay "rendimiento habitual": la mediana de tres posts es fabricar evidencia (SOC §24). */
export const MIN_BASELINE_SAMPLE = 5;

/**
 * Hasta acá llega lo que cuenta como "reciente" (Plans/03 §3.14). Un outlier de
 * hace un año no es una idea: el formato y el algoritmo ya se movieron. Es una
 * decisión editorial y se va a mover, igual que OUTLIER_THRESHOLD.
 *
 * No recorta el baseline: la mediana se sigue calculando sobre todo lo traído —
 * medirla sobre 60 días dejaría a las cuentas que publican poco por debajo de
 * MIN_BASELINE_SAMPLE y no habría contra qué comparar.
 */
export const OUTLIER_MAX_AGE_DAYS = 60;

/**
 * Puntaje mínimo de relevancia para que una publicación ajena entre en la
 * lista (Plans/03 §3.14). Sin puntaje no se esconde nada: el filtro sólo saca
 * lo que el clasificador miró y descartó.
 */
export const RELEVANCE_MIN = 50;

/** La cadencia se mide sobre las últimas semanas, no sobre todo lo traído: una cuenta que cambió de ritmo tiene que verse. */
export const CADENCE_WINDOW_DAYS = 28;

/**
 * Ventana de recencia para "Descubrir virales" (Plans/03 §3.15). Más chica que
 * OUTLIER_MAX_AGE_DAYS: "tendencia ahora" es más exigente que el rendimiento
 * de una cuenta que se sigue en el tiempo.
 */
export const TREND_MAX_AGE_DAYS = 30;

/**
 * Piso de views para que un reel descubierto cuente como viral (Plans/03
 * §3.15). No hay cuenta propia contra la cual comparar, así que el criterio
 * es absoluto y no relativo a un batch: por debajo de esto no entra, aunque
 * eso signifique mostrar menos de lo que se pidió (incluso cero). Es una
 * decisión editorial y se va a mover, igual que OUTLIER_THRESHOLD.
 *
 * Bajado de 1.000.000 el 2026-09-24: `apify/instagram-hashtag-scraper` (único
 * actor viable — ver TREND_ACTOR_ID) trae el feed *reciente* del hashtag, no
 * el "top", así que un reel recién posteado casi nunca llega al millón. Cinco
 * búsquedas reales (#ai ×3, #inteligeciaartifical, #claudeai) tocaron como
 * máximo ~306k views. 150k queda apenas por encima de ese máximo real.
 */
export const TREND_MIN_VIEWS = 150_000;

const DAY_MS = 86_400_000;

/** Los videos se comparan por views; las imágenes no tienen views, así que por likes. Nunca se mezclan en una misma mediana. */
export type SignalGroup = "VIDEO" | "IMAGEN";

export interface InsightPost {
  id: string;
  kind: BrandPostKind;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
}

export function groupOf(kind: BrandPostKind): SignalGroup {
  return kind === "REEL" || kind === "VIDEO" || kind === "SHORT" ? "VIDEO" : "IMAGEN";
}

export const GROUP_SIGNAL_LABEL: Record<SignalGroup, string> = { VIDEO: "views", IMAGEN: "likes" };

function signalOf(post: InsightPost): number | null {
  return groupOf(post.kind) === "VIDEO" ? post.views : post.likes;
}

/** Mediana, no promedio: una publicación que explotó arrastra el promedio y esconde al resto (SOC §16). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** ¿La publicación entra en la ventana de recencia? Sin fecha, no: no se puede verificar. */
export function isRecent(publishedAt: string | null, now: Date = new Date()): boolean {
  if (!publishedAt) return false;
  const time = new Date(publishedAt).getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time <= OUTLIER_MAX_AGE_DAYS * DAY_MS;
}

export interface Cadence {
  /** Publicaciones por semana. null con menos de dos publicaciones con fecha: no hay ritmo que medir. */
  perWeek: number | null;
  /** Publicaciones dentro de la ventana medida. */
  count: number;
  /** Días que abarca lo medido. Menos de la ventana cuando lo traído no llega tan atrás (una cuenta que publica mucho agota el límite antes). */
  spanDays: number;
}

/** Cuántas publicaciones por semana, sobre las últimas semanas o sobre lo que alcance a abarcar lo traído. */
export function computeCadence(posts: Pick<InsightPost, "publishedAt">[], now: Date = new Date()): Cadence {
  const times = posts
    .map((post) => (post.publishedAt ? new Date(post.publishedAt).getTime() : NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length < 2) return { perWeek: null, count: times.length, spanDays: 0 };

  const oldest = Math.min(...times);
  const windowStart = now.getTime() - CADENCE_WINDOW_DAYS * DAY_MS;
  // Si lo traído no llega hasta el inicio de la ventana, se mide sólo lo que se ve: contar 28 días
  // con posts de 10 subestimaría la cadencia de quien publica seguido.
  const start = Math.max(oldest, windowStart);
  const spanDays = Math.max((now.getTime() - start) / DAY_MS, 1);
  const count = times.filter((time) => time >= start).length;

  return { perWeek: count / (spanDays / 7), count, spanDays };
}

export type FormatMix = Partial<Record<BrandPostKind, number>>;

/** Cuántas publicaciones hay de cada formato. */
export function computeFormatMix(posts: Pick<InsightPost, "kind">[]): FormatMix {
  const mix: FormatMix = {};
  for (const post of posts) mix[post.kind] = (mix[post.kind] ?? 0) + 1;
  return mix;
}

export interface GroupBaseline {
  median: number;
  sample: number;
}

export interface Outlier<T extends InsightPost = InsightPost> {
  post: T;
  group: SignalGroup;
  /** El valor de la señal de la publicación (views o likes). */
  value: number;
  median: number;
  /** value / mediana de su propia cuenta y de su mismo grupo. */
  multiple: number;
  /** Publicada dentro de OUTLIER_MAX_AGE_DAYS. */
  recent: boolean;
}

export interface CompetitorInsights<T extends InsightPost = InsightPost> {
  total: number;
  cadence: Cadence;
  mix: FormatMix;
  /** Sólo los grupos con muestra suficiente: sin baseline no se marca ningún outlier. */
  baselines: Partial<Record<SignalGroup, GroupBaseline>>;
  /** De mayor a menor múltiplo. */
  outliers: Outlier<T>[];
}

/**
 * Cadencia, mezcla de formatos y outliers de UNA cuenta. La mediana se calcula
 * dentro de la cuenta y del grupo de señal: un reel se compara contra sus
 * reels, una imagen contra sus imágenes.
 */
export function computeCompetitorInsights<T extends InsightPost>(posts: T[], now: Date = new Date()): CompetitorInsights<T> {
  const byGroup: Record<SignalGroup, { post: T; value: number }[]> = { VIDEO: [], IMAGEN: [] };
  for (const post of posts) {
    const value = signalOf(post);
    if (value !== null) byGroup[groupOf(post.kind)].push({ post, value });
  }

  const baselines: CompetitorInsights<T>["baselines"] = {};
  const outliers: Outlier<T>[] = [];

  for (const group of ["VIDEO", "IMAGEN"] as const) {
    const entries = byGroup[group];
    if (entries.length < MIN_BASELINE_SAMPLE) continue;

    const mid = median(entries.map((entry) => entry.value));
    // Una mediana en 0 no sirve de denominador: ese grupo queda sin baseline.
    if (mid <= 0) continue;
    baselines[group] = { median: mid, sample: entries.length };

    for (const { post, value } of entries) {
      const multiple = value / mid;
      // La recencia se marca, no se filtra: el filtro es de la vista, y el toggle
      // "incluir anteriores" no tiene que recalcular nada.
      if (multiple >= OUTLIER_THRESHOLD) {
        outliers.push({ post, group, value, median: mid, multiple, recent: isRecent(post.publishedAt, now) });
      }
    }
  }

  outliers.sort((a, b) => b.multiple - a.multiple);

  return {
    total: posts.length,
    cadence: computeCadence(posts, now),
    mix: computeFormatMix(posts),
    baselines,
    outliers,
  };
}
