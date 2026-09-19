import type { BrandPostKind } from "@/lib/brand/sources/types";

import type {
  AnalysisPost,
  KindBaseline,
  ObjectiveScore,
  PostResult,
  ResultClass,
  ResultObjective,
} from "./types";

/*
 * Umbrales de la clasificación (SOC §17). Son una decisión editorial y se van a
 * mover, así que viven acá con nombre y no incrustados en una query.
 */
/** ≥ este múltiplo de la mediana → ganador. */
export const WINNER_THRESHOLD = 1.5;
/** ≤ este múltiplo → experimento fallido. En el medio, neutro. */
export const FAILED_THRESHOLD = 0.6;
/** Últimas N piezas del mismo formato, publicadas antes que la evaluada. */
export const BASELINE_WINDOW = 10;
/** Con menos piezas en la ventana no se clasifica: comparar contra tres posts es fabricar evidencia (SOC §24). */
export const MIN_BASELINE_SAMPLE = 5;
/**
 * Una pieza recién publicada todavía está juntando views: sus métricas son las
 * de hoy, no las que va a tener, y compararlas contra piezas ya asentadas la
 * marcaría "fallida" por estar joven. 0 desactiva la espera.
 */
export const MATURATION_DAYS = 3;

const DAY_MS = 86_400_000;

export const RESULT_LABEL: Record<ResultClass, string> = {
  GANADOR_ALCANCE: "Ganador de alcance",
  GANADOR_AUTORIDAD: "Ganador de autoridad",
  GANADOR_CONVERSION: "Ganador de conversión",
  NEUTRO: "Neutro",
  EXPERIMENTO_FALLIDO: "Experimento fallido",
  SIN_BASELINE: "Sin baseline",
  MADURANDO: "Madurando",
};

/** Alcance = views, o alcance si la pieza no trae views (Plans/03 §3.11). */
export function reachSignal(post: AnalysisPost): number | null {
  return post.views ?? post.reach;
}

/**
 * Autoridad = (guardados + comentarios + compartidos) / alcance. Sin likes, a
 * diferencia de engagementRate: los likes son la señal más barata, y acá se
 * mide confianza, no atención. null cuando no hay alcance para dividir o
 * ninguna de las tres señales llegó.
 */
export function authorityRate(post: AnalysisPost): number | null {
  if (post.reach === null || post.reach <= 0) return null;
  if (post.saved === null && post.comments === null && post.shares === null) return null;
  return ((post.saved ?? 0) + (post.comments ?? 0) + (post.shares ?? 0)) / post.reach;
}

const SIGNALS: Record<ResultObjective, (post: AnalysisPost) => number | null> = {
  ALCANCE: reachSignal,
  AUTORIDAD: authorityRate,
};

/** Mediana, no promedio: una pieza que explotó arrastra el promedio y esconde al resto (SOC §16). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Dated {
  post: AnalysisPost;
  time: number;
}

/** Las piezas con fecha, agrupadas por formato y de la más vieja a la más nueva — un reel se compara contra reels. */
function datedByKind(posts: AnalysisPost[]): Map<BrandPostKind, Dated[]> {
  const groups = new Map<BrandPostKind, Dated[]>();
  for (const post of posts) {
    const time = post.publishedAt ? Date.parse(post.publishedAt) : Number.NaN;
    if (Number.isNaN(time)) continue;
    const group = groups.get(post.kind) ?? [];
    group.push({ post, time });
    groups.set(post.kind, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.time - b.time);
  return groups;
}

/**
 * Mediana de las últimas BASELINE_WINDOW piezas con señal entre entries[0..end).
 * La ventana se llena con piezas que tienen la señal (una pieza sin datos no
 * encoge la muestra en silencio) y la mediana 0 no sirve de denominador.
 */
function baselineFor(
  entries: Dated[],
  end: number,
  read: (post: AnalysisPost) => number | null,
): { median: number; sample: number } | null {
  const values: number[] = [];
  for (let i = end - 1; i >= 0 && values.length < BASELINE_WINDOW; i--) {
    const value = read(entries[i].post);
    if (value !== null) values.push(value);
  }
  if (values.length < MIN_BASELINE_SAMPLE) return null;
  const mid = median(values);
  return mid > 0 ? { median: mid, sample: values.length } : null;
}

function scoreFor(
  post: AnalysisPost,
  entries: Dated[],
  end: number,
  read: (post: AnalysisPost) => number | null,
): ObjectiveScore | null {
  const value = read(post);
  if (value === null) return null;
  const base = baselineFor(entries, end, read);
  return base ? { value, median: base.median, index: value / base.median, sample: base.sample } : null;
}

/**
 * Un índice alto en cualquiera de los dos objetivos hace ganador (el más alto
 * decide cuál; empate → alcance). Fallido exige que TODOS los índices
 * disponibles estén abajo: poco alcance con buena tasa de autoridad no es un
 * experimento fallido, es un post que llegó a menos gente y la que llegó
 * respondió igual.
 */
function classify(reach: ObjectiveScore | null, authority: ObjectiveScore | null): ResultClass {
  const scores = [reach, authority].filter((s): s is ObjectiveScore => s !== null);
  if (scores.length === 0) return "SIN_BASELINE";

  const reachWins = reach !== null && reach.index >= WINNER_THRESHOLD;
  const authorityWins = authority !== null && authority.index >= WINNER_THRESHOLD;
  if (reachWins || authorityWins) {
    return authorityWins && (!reachWins || authority.index > reach.index) ? "GANADOR_AUTORIDAD" : "GANADOR_ALCANCE";
  }

  return scores.every((s) => s.index <= FAILED_THRESHOLD) ? "EXPERIMENTO_FALLIDO" : "NEUTRO";
}

/**
 * Clasifica cada pieza contra su propio baseline (Plans/03 §3.11): la mediana
 * de las últimas BASELINE_WINDOW piezas del mismo formato publicadas ANTES.
 * Pura y sin estado — no se persiste, se recalcula cada vez, porque una pieza
 * puede dejar de ser ganadora cuando el resto de la cuenta sube.
 *
 * Ojo: las métricas de cada pieza son las del último snapshot, no las de una
 * edad fija (7 días, por ejemplo). Las viejas ya se asentaron y las nuevas
 * siguen sumando; MATURATION_DAYS tapa lo peor de ese sesgo, no lo elimina.
 */
export function classifyPosts(posts: AnalysisPost[], asOf: Date): Record<string, PostResult> {
  const results: Record<string, PostResult> = {};
  // Lo que no entra a ningún grupo (sin fecha válida) queda sin baseline.
  for (const post of posts) results[post.postId] = { classification: "SIN_BASELINE", reach: null, authority: null };

  const matureUntil = asOf.getTime() - MATURATION_DAYS * DAY_MS;

  for (const entries of datedByKind(posts).values()) {
    entries.forEach((entry, i) => {
      if (entry.time > matureUntil) {
        results[entry.post.postId] = { classification: "MADURANDO", reach: null, authority: null };
        return;
      }

      // "Antes" es estricto: dos piezas con la misma fecha no se miden entre sí.
      let end = i;
      while (end > 0 && entries[end - 1].time >= entry.time) end--;

      const reach = scoreFor(entry.post, entries, end, SIGNALS.ALCANCE);
      const authority = scoreFor(entry.post, entries, end, SIGNALS.AUTORIDAD);
      results[entry.post.postId] = { classification: classify(reach, authority), reach, authority };
    });
  }

  return results;
}

/**
 * El baseline de hoy por formato — contra lo que se compararía la próxima
 * pieza. Sólo cuentan las piezas ya maduras, por la misma razón que arriba.
 */
export function computeCurrentBaselines(posts: AnalysisPost[], asOf: Date): KindBaseline[] {
  const matureUntil = asOf.getTime() - MATURATION_DAYS * DAY_MS;
  const baselines: (KindBaseline & { mature: number })[] = [];

  for (const [kind, entries] of datedByKind(posts)) {
    const mature = entries.filter((e) => e.time <= matureUntil);
    const reach = baselineFor(mature, mature.length, SIGNALS.ALCANCE);
    const authority = baselineFor(mature, mature.length, SIGNALS.AUTORIDAD);
    if (reach || authority) baselines.push({ kind, reach, authority, mature: mature.length });
  }

  return baselines.sort((a, b) => b.mature - a.mature).map(({ kind, reach, authority }) => ({ kind, reach, authority }));
}

/**
 * El número que acompaña al badge ("2,3× la mediana"): el del objetivo que
 * decidió la clasificación; en neutro y fallido, alcance primero.
 */
export function headlineScore(result: PostResult): { objective: ResultObjective; score: ObjectiveScore } | null {
  if (result.classification === "GANADOR_AUTORIDAD" && result.authority) {
    return { objective: "AUTORIDAD", score: result.authority };
  }
  if (result.reach) return { objective: "ALCANCE", score: result.reach };
  if (result.authority) return { objective: "AUTORIDAD", score: result.authority };
  return null;
}

const multipleFormat = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** "2,3×" */
export function formatMultiple(index: number): string {
  return `${multipleFormat.format(index)}×`;
}

/** Un valor de baseline en su unidad: views enteros para alcance, porcentaje para autoridad. */
export function formatObjectiveValue(objective: ResultObjective, value: number): string {
  return objective === "ALCANCE" ? `${integerFormat.format(value)} views` : `${multipleFormat.format(value * 100)}%`;
}
