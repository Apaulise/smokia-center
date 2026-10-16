import {
  median,
  TREND_MAX_AGE_DAYS,
  TREND_META_MAX_AGE_DAYS,
  TREND_MIN_LIKES,
  TREND_MIN_VIEWS,
  type InsightPost,
  type Outlier,
  type SignalGroup,
} from "@/lib/brand/competitors/insights";

import type { TrendSource } from "./schema";

/*
 * Qué cuenta como "viral" entre lo descubierto por hashtag (Plans/03 §3.15 y
 * §3.17). No hay una cuenta detrás de la que sacar una mediana propia, así
 * que a diferencia de competencia (§3.8) el criterio no es relativo a un
 * batch: es un piso absoluto. Por debajo, no cuenta como viral aunque eso deje
 * la búsqueda con menos tarjetas de las pedidas — incluso cero: mostrar
 * contenido de bajo alcance sólo para completar un cupo sería fabricar virales
 * que no existen.
 *
 * El piso depende de qué dato da cada fuente:
 *  - APIFY trae reels con views → piso de views (TREND_MIN_VIEWS), ventana corta.
 *  - META (`top_media`) no da views de piezas ajenas → piso de likes
 *    (TREND_MIN_LIKES), ventana más ancha porque ese endpoint no ordena por fecha.
 * Los dos valores nunca se mezclan en una misma mediana.
 */

const DAY_MS = 86_400_000;

export interface TrendCandidate extends InsightPost {
  source: TrendSource;
}

interface SourceRule {
  group: SignalGroup;
  maxAgeDays: number;
  floor: number;
  signal: (post: Pick<InsightPost, "views" | "likes">) => number | null;
}

const RULES: Record<TrendSource, SourceRule> = {
  APIFY: { group: "VIDEO", maxAgeDays: TREND_MAX_AGE_DAYS, floor: TREND_MIN_VIEWS, signal: (post) => post.views },
  META: { group: "IMAGEN", maxAgeDays: TREND_META_MAX_AGE_DAYS, floor: TREND_MIN_LIKES, signal: (post) => post.likes },
};

function isWithinWindow(publishedAt: string | null, maxAgeDays: number, now: Date): boolean {
  if (!publishedAt) return false;
  const time = new Date(publishedAt).getTime();
  return Number.isFinite(time) && now.getTime() - time <= maxAgeDays * DAY_MS;
}

/** ¿Pasa el piso de su fuente y está dentro de su ventana? Lo usan el tablero y el resumen de la última búsqueda. */
export function isViralTrendPost(post: Pick<TrendCandidate, "source" | "views" | "likes" | "publishedAt">, now: Date = new Date()): boolean {
  const rule = RULES[post.source];
  const signal = rule.signal(post);
  return signal !== null && signal >= rule.floor && isWithinWindow(post.publishedAt, rule.maxAgeDays, now);
}

/**
 * Lo descubierto que pasa el piso de su fuente, de mayor a menor múltiplo. El
 * multiplicador de la tarjeta es contexto —cuánto se separa de lo típico de
 * ESA fuente en lo reciente traído—, no el criterio: el criterio es el piso
 * absoluto. Se calcula sobre todo lo reciente (descartado incluido, mismo
 * motivo que en competencia: un outlier real que se descarta tiene que seguir
 * siendo recuperable desde "Ver descartadas").
 */
export function computeTrendOutliers<T extends TrendCandidate & { dismissedAt: string | null }>(
  posts: T[],
  now: Date = new Date(),
): Outlier<T>[] {
  const outliers: Outlier<T>[] = [];

  for (const source of Object.keys(RULES) as TrendSource[]) {
    const rule = RULES[source];
    const recent = posts.filter((post) => post.source === source && isWithinWindow(post.publishedAt, rule.maxAgeDays, now));

    const values = recent.map((post) => rule.signal(post)).filter((value): value is number => value !== null);
    const contextMedian = values.length > 0 ? median(values) : 0;

    for (const post of recent) {
      const value = rule.signal(post);
      if (value === null || value < rule.floor) continue;
      outliers.push({
        post,
        group: rule.group,
        value,
        median: contextMedian,
        multiple: contextMedian > 0 ? value / contextMedian : 1,
        recent: true,
      });
    }
  }

  return outliers.sort((a, b) => b.multiple - a.multiple);
}
