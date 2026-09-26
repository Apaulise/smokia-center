import { median, TREND_MAX_AGE_DAYS, TREND_MIN_VIEWS, type InsightPost, type Outlier } from "@/lib/brand/competitors/insights";

/*
 * Qué cuenta como "viral" entre reels descubiertos por hashtag (Plans/03
 * §3.15). No hay una cuenta detrás de la que sacar una mediana propia, así
 * que a diferencia de competencia (§3.8) el criterio no es relativo a un
 * batch: es un piso absoluto de views (TREND_MIN_VIEWS). Por debajo, no
 * cuenta como viral aunque eso deje la búsqueda con menos tarjetas de las
 * pedidas — incluso cero: mostrar contenido de bajo alcance sólo para
 * completar un cupo sería fabricar virales que no existen.
 */

const DAY_MS = 86_400_000;

function isWithinTrendWindow(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const time = new Date(publishedAt).getTime();
  return Number.isFinite(time) && now.getTime() - time <= TREND_MAX_AGE_DAYS * DAY_MS;
}

/**
 * Los reels descubiertos con al menos TREND_MIN_VIEWS, de mayor a menor. El
 * multiplicador que se muestra en la tarjeta es contexto —cuánto se separa de
 * lo típico de ESTA búsqueda—, no el criterio: el criterio es el piso
 * absoluto. Por eso se calcula sobre todo lo reciente (descartado incluido,
 * mismo motivo que en competencia: un outlier real que se descarta tiene que
 * seguir siendo recuperable desde "Ver descartadas").
 */
export function computeTrendOutliers<T extends InsightPost & { dismissedAt: string | null }>(
  posts: T[],
  now: Date = new Date(),
): Outlier<T>[] {
  const recent = posts.filter((post) => isWithinTrendWindow(post.publishedAt, now));

  const views = recent.map((post) => post.views).filter((value): value is number => value !== null);
  const contextMedian = views.length > 0 ? median(views) : 0;

  return recent
    .filter((post) => post.views !== null && post.views >= TREND_MIN_VIEWS)
    .map((post) => ({
      post,
      group: "VIDEO" as const,
      value: post.views as number,
      median: contextMedian,
      multiple: contextMedian > 0 ? (post.views as number) / contextMedian : 1,
      recent: true,
    }))
    .sort((a, b) => b.value - a.value);
}
