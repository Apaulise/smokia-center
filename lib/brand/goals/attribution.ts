import { addDays, daysBetween, utcDayOf } from "./days";
import type { FollowerSnapshot } from "./progress";

/*
 * Seguidores que dejó cada pieza (Plans/03 §3.13). Instagram no da el dato
 * directo para los reels (`media_follows` viene null en reels y 0 en
 * carruseles), así que lo que se calcula es una ESTIMACIÓN: los seguidores
 * netos entre la foto de antes de publicar y la de 72 h después.
 *
 * Es una pista de baja confianza y nunca clasifica una pieza (`classifyPosts`
 * sigue siendo por alcance y autoridad, SOC §17). Tres cosas la debilitan y
 * por eso viajan con el número:
 *   · ventana compartida: otra pieza propia salió dentro de las 72 h, y los
 *     seguidores de las dos se mezclan;
 *   · muestra chica: con ~50 seguidores un solo seguidor domina la ventana;
 *   · las fotos son diarias y no tienen hora, así que la ventana es ±1 día.
 */

/** La ventana posterior a publicar: 72 h, en días porque las fotos son diarias. */
export const WINDOW_DAYS = 3;
export const WINDOW_HOURS = WINDOW_DAYS * 24;

/** Cuántos días antes del día de publicación puede estar la foto "de antes". */
export const BASE_TOLERANCE_DAYS = 2;
/** Cuánto se puede correr la foto "de después" respecto de publicación + 72 h. */
export const END_TOLERANCE_DAYS = 1;

/** Con menos piezas con ventana limpia no hay "las demás" contra las que comparar. */
export const MIN_POSTS_FOR_SURPRISES = 5;
/** Una pieza es sorpresa si su tasa es ≥ este múltiplo de la mediana de las demás. */
export const SURPRISE_MULTIPLE = 2;

/** Los únicos formatos para los que Instagram da `media_follows`. */
const DIRECT_KINDS: readonly string[] = ["POST", "CARRUSEL"];

const HOUR_MS = 3_600_000;

export interface AttributionPost {
  postId: string;
  kind: string;
  publishedAt: string | null;
  views: number | null;
  /** `new_followers` de la pieza: el dato directo de Instagram, cuando existe. */
  newFollowers: number | null;
}

export type PostFollowerGain =
  | {
      status: "OK";
      /** DIRECTO: lo informa Instagram. ESTIMADO: diferencia de fotos en la ventana. */
      source: "DIRECTO" | "ESTIMADO";
      followers: number;
      /** Otra pieza propia salió dentro de las 72 h: los seguidores de las dos se mezclan. Sólo aplica a ESTIMADO. */
      sharedWindow: boolean;
      /** Días reales entre las dos fotos usadas (ESTIMADO). null en DIRECTO. */
      windowDays: number | null;
      /** Seguidores por cada 1.000 views. null sin views. */
      perThousandViews: number | null;
    }
  /** Todavía no pasaron las 72 h. */
  | { status: "MADURANDO" }
  /** Pasaron, pero faltan fotos diarias alrededor de las fechas (un hueco en la sincronización). */
  | { status: "SIN_DATOS" };

export interface FollowerSurprise {
  postId: string;
  followers: number;
  views: number;
  perThousandViews: number;
  /** Mediana de la tasa de las demás piezas con ventana limpia. */
  medianPerThousand: number;
  multiple: number;
}

export interface AttributionResult {
  gains: Record<string, PostFollowerGain>;
  surprises: FollowerSurprise[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function perThousand(followers: number, views: number | null): number | null {
  return views !== null && views > 0 ? (followers / views) * 1000 : null;
}

/** La foto más reciente que no pasa del día dado, y no más vieja que la tolerancia. */
function findBase(sorted: FollowerSnapshot[], publishDay: string): FollowerSnapshot | null {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].day > publishDay) continue;
    return daysBetween(sorted[i].day, publishDay) <= BASE_TOLERANCE_DAYS ? sorted[i] : null;
  }
  return null;
}

/** La foto más cercana a publicación + 72 h dentro de la tolerancia; a igual distancia, la más temprana. */
function findEnd(sorted: FollowerSnapshot[], publishDay: string): FollowerSnapshot | null {
  const target = addDays(publishDay, WINDOW_DAYS);
  let best: FollowerSnapshot | null = null;
  let bestDistance = Infinity;
  for (const snapshot of sorted) {
    const distance = Math.abs(daysBetween(target, snapshot.day));
    if (distance <= END_TOLERANCE_DAYS && distance < bestDistance) {
      best = snapshot;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Seguidores por pieza y las sorpresas. `now` va por parámetro para que sea
 * determinista. Las historias no están en `posts` (no entran a la biblioteca),
 * así que una historia publicada dentro de la ventana no marca "compartida".
 */
export function attributeFollowers(params: {
  posts: AttributionPost[];
  snapshots: FollowerSnapshot[];
  now: Date;
}): AttributionResult {
  const { posts, now } = params;
  const sorted = [...new Map(params.snapshots.map((s) => [s.day, s])).values()].sort((a, b) => a.day.localeCompare(b.day));

  const times = posts.map((post) => (post.publishedAt ? Date.parse(post.publishedAt) : Number.NaN));
  const gains: Record<string, PostFollowerGain> = {};

  posts.forEach((post, index) => {
    const time = times[index];
    if (Number.isNaN(time)) {
      gains[post.postId] = { status: "SIN_DATOS" };
      return;
    }

    if (now.getTime() < time + WINDOW_HOURS * HOUR_MS) {
      gains[post.postId] = { status: "MADURANDO" };
      return;
    }

    if (DIRECT_KINDS.includes(post.kind) && post.newFollowers !== null) {
      gains[post.postId] = {
        status: "OK",
        source: "DIRECTO",
        followers: post.newFollowers,
        sharedWindow: false,
        windowDays: null,
        perThousandViews: perThousand(post.newFollowers, post.views),
      };
      return;
    }

    const publishDay = utcDayOf(new Date(time));
    const base = findBase(sorted, publishDay);
    const end = findEnd(sorted, publishDay);
    if (!base || !end || end.day <= base.day) {
      gains[post.postId] = { status: "SIN_DATOS" };
      return;
    }

    const followers = end.followers - base.followers;
    // Dos ventanas de 72 h se pisan cuando las publicaciones están a menos de 72 h una de otra.
    const sharedWindow = times.some(
      (other, i) => i !== index && !Number.isNaN(other) && Math.abs(other - time) < WINDOW_HOURS * HOUR_MS,
    );

    gains[post.postId] = {
      status: "OK",
      source: "ESTIMADO",
      followers,
      sharedWindow,
      windowDays: daysBetween(base.day, end.day),
      perThousandViews: perThousand(followers, post.views),
    };
  });

  return { gains, surprises: findSurprises(posts, gains) };
}

/**
 * Las piezas con ventana limpia cuya tasa (seguidores por 1.000 views) duplica la
 * mediana de las DEMÁS. Es el "un video de 10 mil views dejó más seguidores que
 * uno de 100 mil, para tener en cuenta": una pista informativa, nunca una
 * clasificación. Sólo compara estimaciones entre sí (un dato directo y una
 * estimación no se miden con la misma vara), y exige una mediana mayor a 0: con
 * mediana cero cualquier seguidor sería "infinitas veces" el resto.
 */
function findSurprises(posts: AttributionPost[], gains: Record<string, PostFollowerGain>): FollowerSurprise[] {
  const candidates = posts.flatMap((post) => {
    const gain = gains[post.postId];
    if (gain?.status !== "OK" || gain.source !== "ESTIMADO" || gain.sharedWindow) return [];
    if (gain.perThousandViews === null || post.views === null) return [];
    return [{ postId: post.postId, followers: gain.followers, views: post.views, rate: gain.perThousandViews }];
  });
  if (candidates.length < MIN_POSTS_FOR_SURPRISES) return [];

  const surprises: FollowerSurprise[] = [];
  for (const candidate of candidates) {
    const others = candidates.filter((c) => c.postId !== candidate.postId).map((c) => c.rate);
    const mid = median(others);
    if (mid <= 0 || candidate.rate < SURPRISE_MULTIPLE * mid) continue;
    surprises.push({
      postId: candidate.postId,
      followers: candidate.followers,
      views: candidate.views,
      perThousandViews: candidate.rate,
      medianPerThousand: mid,
      multiple: candidate.rate / mid,
    });
  }
  return surprises.sort((a, b) => b.multiple - a.multiple);
}
