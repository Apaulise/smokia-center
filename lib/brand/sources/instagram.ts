import {
  getMetaCredentials,
  graphGet,
  graphGetAll,
  graphPost,
  MetaApiError,
  mapWithConcurrency,
  type MetaCredentials,
} from "@/lib/meta/client";

import type {
  BrandAudienceDimension,
  BrandPostKind,
  BrandSourceProvider,
  NormalizedAccountSnapshot,
  NormalizedAudienceRow,
  NormalizedComment,
  NormalizedDailyMetrics,
  NormalizedPost,
  PublishMedia,
  PublishParams,
  PublishResult,
} from "./types";
import { asRecord, firstNumber, firstString } from "./utils";

/** Cuántas piezas se traen como máximo por sincronización (las más nuevas primero). */
const MAX_MEDIA = 200;
/**
 * A cuántas de las más nuevas se les piden insights y comentarios: es una
 * llamada por pieza, y la corrida entera tiene que entrar en los 60 s de la
 * función. Las más viejas ya no se mueven; conservan su última foto buena.
 */
const INSIGHTS_WINDOW = 60;
const CONCURRENCY = 8;
/** Días hacia atrás (contando hoy) de métricas diarias de la cuenta. */
const DAILY_DAYS = 7;
const DAY_MS = 86_400_000;

const AUDIENCE_BREAKDOWNS: Record<BrandAudienceDimension, string> = {
  EDAD: "age",
  GENERO: "gender",
  CIUDAD: "city",
  PAIS: "country",
};

/**
 * Sólo cubre lo que devuelve `/media` (feed): REEL, POST, CARRUSEL, VIDEO. Las
 * historias viven en `/stories` y duran 24 h: no entran a la biblioteca.
 */
function mapMediaKind(row: Record<string, unknown>): BrandPostKind | null {
  if (firstString(row, ["media_product_type"]) === "REELS") return "REEL";
  switch (firstString(row, ["media_type"])) {
    case "CAROUSEL_ALBUM":
      return "CARRUSEL";
    case "VIDEO":
      return "VIDEO";
    case "IMAGE":
      return "POST";
    default:
      return null;
  }
}

/**
 * Las respuestas de `/insights` vienen como `data: [{ name, values: [{ value }] }]`
 * (métricas por período) o `data: [{ name, total_value: { value } }]` (las de
 * `metric_type=total_value`). Se aplanan a `{ nombre: número }`.
 */
function readInsights(body: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = asRecord(body)?.data;
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    const row = asRecord(item);
    const name = row ? firstString(row, ["name"]) : null;
    if (!row || !name) continue;
    const fromValues = Array.isArray(row.values) ? firstNumber(asRecord(row.values[0]) ?? {}, ["value"]) : null;
    const fromTotal = firstNumber(asRecord(row.total_value) ?? {}, ["value"]);
    const value = fromTotal ?? fromValues;
    if (value !== null) out[name] = value;
  }
  return out;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function fetchAccounts(credentials: MetaCredentials): Promise<NormalizedAccountSnapshot[]> {
  const row = asRecord(
    await graphGet(credentials, credentials.userId, {
      fields: "id,username,name,biography,website,followers_count,follows_count,media_count",
    }),
  );
  if (!row) return [];

  return [
    {
      externalId: firstString(row, ["id"]) ?? credentials.userId,
      username: firstString(row, ["username"]),
      displayName: firstString(row, ["name"]),
      biography: firstString(row, ["biography"]),
      website: firstString(row, ["website"]),
      followersCount: firstNumber(row, ["followers_count"]),
      followsCount: firstNumber(row, ["follows_count"]),
      mediaCount: firstNumber(row, ["media_count"]),
    },
  ];
}

/**
 * Métricas diarias. Instagram sólo da una serie por día para `follower_count`;
 * el resto (`reach`, `views`, …) sale con `metric_type=total_value`, que agrega
 * la ventana pedida — por eso se pide una vez por día, con una ventana de 24 h
 * (UTC). Cada pedido es independiente: uno que falle (ej. un día sin datos)
 * no tira abajo los demás.
 */
async function fetchDailyMetrics(credentials: MetaCredentials): Promise<NormalizedDailyMetrics[]> {
  const externalId = credentials.userId;
  const now = Date.now();
  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  const dayStarts = Array.from({ length: DAILY_DAYS }, (_, i) => startOfToday - i * DAY_MS);

  const perDay = await mapWithConcurrency(dayStarts, CONCURRENCY, async (dayStart) => {
    try {
      const body = await graphGet(credentials, `${credentials.userId}/insights`, {
        metric: "reach,views,profile_views,accounts_engaged,total_interactions",
        metric_type: "total_value",
        period: "day",
        since: Math.floor(dayStart / 1000),
        until: Math.floor((dayStart + DAY_MS) / 1000),
      });
      return { dayStart, metrics: readInsights(body) };
    } catch {
      return { dayStart, metrics: {} as Record<string, number> };
    }
  });

  // Nuevos seguidores por día: serie temporal. `end_time` es el FIN del período de 24 h,
  // así que el día al que pertenece el valor es el anterior.
  const newFollowersByDay = new Map<string, number>();
  try {
    const body = asRecord(
      await graphGet(credentials, `${credentials.userId}/insights`, {
        metric: "follower_count",
        period: "day",
        since: Math.floor((startOfToday - (DAILY_DAYS - 1) * DAY_MS) / 1000),
        until: Math.floor((startOfToday + DAY_MS) / 1000),
      }),
    );
    const series = Array.isArray(body?.data) ? asRecord(body.data[0]) : null;
    for (const entry of Array.isArray(series?.values) ? series.values : []) {
      const point = asRecord(entry);
      const value = point ? firstNumber(point, ["value"]) : null;
      const endTime = point ? firstString(point, ["end_time"]) : null;
      if (value === null || !endTime) continue;
      const end = Date.parse(endTime);
      if (Number.isFinite(end)) newFollowersByDay.set(isoDay(end - DAY_MS), value);
    }
  } catch {
    // sin serie de seguidores (ej. menos de 100): el resto de las métricas sigue valiendo
  }

  return perDay
    .map(({ dayStart, metrics }): NormalizedDailyMetrics => {
      const date = isoDay(dayStart);
      return {
        externalId,
        date,
        reach: metrics.reach ?? null,
        // `impressions` está discontinuada desde la v22: `views` es su reemplazo.
        impressions: metrics.views ?? null,
        profileViews: metrics.profile_views ?? null,
        newFollowers: newFollowersByDay.get(date) ?? null,
        accountsEngaged: metrics.accounts_engaged ?? null,
        totalInteractions: metrics.total_interactions ?? null,
      };
    })
    .filter((day) => day.reach !== null || day.impressions !== null || day.newFollowers !== null);
}

// Un pedido con una métrica que la pieza no soporta falla ENTERO, así que se va
// de más completo a más básico hasta que uno entre.
const REEL_METRIC_TIERS = [
  "reach,views,saved,shares,likes,comments,ig_reels_avg_watch_time,ig_reels_video_view_total_time",
  "reach,views,saved,shares",
  "reach,saved,shares",
];
const FEED_METRIC_TIERS = [
  "reach,views,saved,shares,likes,comments,follows",
  "reach,views,saved,shares",
  "reach,saved,shares",
];

async function fetchMediaInsights(credentials: MetaCredentials, mediaId: string, isReel: boolean): Promise<Record<string, number>> {
  for (const metric of isReel ? REEL_METRIC_TIERS : FEED_METRIC_TIERS) {
    try {
      return readInsights(await graphGet(credentials, `${mediaId}/insights`, { metric }));
    } catch (error) {
      // Un token vencido no se arregla bajando de nivel: que suba y corte la sincronización.
      if (error instanceof MetaApiError && (error.code === 190 || !error.definitive)) throw error;
    }
  }
  return {};
}

async function fetchMedia(credentials: MetaCredentials): Promise<NormalizedPost[]> {
  const rows = await graphGetAll(
    credentials,
    `${credentials.userId}/media`,
    {
      fields:
        "id,media_type,media_product_type,permalink,caption,media_url,thumbnail_url,timestamp,like_count,comments_count",
    },
    MAX_MEDIA,
  );

  const items = rows.flatMap((raw) => {
    const row = asRecord(raw);
    const externalId = row ? firstString(row, ["id"]) : null;
    const kind = row ? mapMediaKind(row) : null;
    return row && externalId && kind ? [{ row, externalId, kind }] : [];
  });

  // `/media` viene de la más nueva a la más vieja: los insights van sólo para las primeras.
  const insightsById = new Map<string, Record<string, number>>();
  await mapWithConcurrency(items.slice(0, INSIGHTS_WINDOW), CONCURRENCY, async ({ externalId, kind }) => {
    insightsById.set(externalId, await fetchMediaInsights(credentials, externalId, kind === "REEL"));
  });

  return items.map(({ row, externalId, kind }): NormalizedPost => {
    const insights = insightsById.get(externalId);
    const base = {
      externalId,
      kind,
      permalink: firstString(row, ["permalink"]),
      caption: firstString(row, ["caption"]),
      mediaUrl: firstString(row, ["media_url"]),
      thumbnailUrl: firstString(row, ["thumbnail_url"]),
      publishedAt: firstString(row, ["timestamp"]),
    };

    // Fuera de la ventana no se llenan métricas: ver `BrandSourceProvider.fetchMedia`.
    if (!insights) {
      return {
        ...base,
        reach: null,
        impressions: null,
        views: null,
        likes: null,
        comments: null,
        shares: null,
        saved: null,
        reelTotalWatchTimeMs: null,
        reelAvgWatchTimeMs: null,
        reelSkipRate: null,
        newFollowers: null,
        raw: row,
      };
    }

    return {
      ...base,
      reach: insights.reach ?? null,
      // `impressions` por pieza está discontinuada desde la v22: `views` es su reemplazo.
      impressions: null,
      views: insights.views ?? null,
      likes: insights.likes ?? firstNumber(row, ["like_count"]),
      comments: insights.comments ?? firstNumber(row, ["comments_count"]),
      shares: insights.shares ?? null,
      saved: insights.saved ?? null,
      reelTotalWatchTimeMs: insights.ig_reels_video_view_total_time ?? null,
      reelAvgWatchTimeMs: insights.ig_reels_avg_watch_time ?? null,
      // Meta no expone la tasa de salto de un Reel.
      reelSkipRate: null,
      newFollowers: insights.follows ?? null,
      raw: { ...row, insights },
    };
  });
}

async function fetchComments(credentials: MetaCredentials, posts: NormalizedPost[]): Promise<NormalizedComment[]> {
  const withComments = posts.filter((post) => (post.comments ?? 0) > 0);

  const perPost = await mapWithConcurrency(withComments, CONCURRENCY, async (post) => {
    try {
      const fields = "id,text,username,timestamp,like_count";
      const topLevel = await graphGetAll(
        credentials,
        `${post.externalId}/comments`,
        { fields: `${fields},replies{${fields}}` },
        200,
      );
      // `comments_count` cuenta también las respuestas, y `/comments` sólo trae las de primer
      // nivel: las respuestas vienen anidadas y se aplanan acá.
      const rows = topLevel.flatMap((raw) => {
        const replies = asRecord(asRecord(raw)?.replies)?.data;
        return [raw, ...(Array.isArray(replies) ? replies : [])];
      });
      return rows.flatMap((raw): NormalizedComment[] => {
        const row = asRecord(raw);
        const externalId = row ? firstString(row, ["id"]) : null;
        if (!row || !externalId) return [];
        return [
          {
            postExternalId: post.externalId,
            externalId,
            username: firstString(row, ["username"]),
            body: firstString(row, ["text"]),
            likeCount: firstNumber(row, ["like_count"]),
            commentedAt: firstString(row, ["timestamp"]),
          },
        ];
      });
    } catch (error) {
      if (error instanceof MetaApiError && error.code === 190) throw error;
      // los comentarios de una pieza que no se pudieron leer no frenan a las demás
      return [];
    }
  });

  return perPost.flat();
}

/**
 * Demografía de seguidores. Instagram la da sólo con 100 seguidores o más, y
 * un pedido por dimensión (mezclar dos en el mismo produciría un cruce
 * ambiguo). Una dimensión que falla queda vacía sin tirar las otras.
 */
async function fetchAudience(credentials: MetaCredentials): Promise<NormalizedAudienceRow[]> {
  const dimensions = Object.keys(AUDIENCE_BREAKDOWNS) as BrandAudienceDimension[];

  const perDimension = await Promise.all(
    dimensions.map(async (dimension): Promise<NormalizedAudienceRow[]> => {
      try {
        const body = asRecord(
          await graphGet(credentials, `${credentials.userId}/insights`, {
            metric: "follower_demographics",
            period: "lifetime",
            metric_type: "total_value",
            breakdown: AUDIENCE_BREAKDOWNS[dimension],
          }),
        );
        const totalValue = Array.isArray(body?.data) ? asRecord(asRecord(body.data[0])?.total_value) : null;
        const breakdown = Array.isArray(totalValue?.breakdowns) ? asRecord(totalValue.breakdowns[0]) : null;

        return (Array.isArray(breakdown?.results) ? breakdown.results : []).flatMap((raw): NormalizedAudienceRow[] => {
          const result = asRecord(raw);
          const values = Array.isArray(result?.dimension_values) ? result.dimension_values : [];
          const value = typeof values[0] === "string" ? values[0].trim() : "";
          const size = result ? firstNumber(result, ["value"]) : null;
          return value && size !== null ? [{ dimension, value, size }] : [];
        });
      } catch {
        return [];
      }
    }),
  );

  return perDimension.flat();
}

// ── Publicación ──────────────────────────────────────────────────────────
//
// Instagram publica en tres pasos: se crea un "contenedor" con el archivo
// (Instagram lo descarga de su URL pública), se espera a que lo procese, y
// recién ahí se lo publica. Sólo el último paso hace visible algo, y eso da la
// regla para no duplicar posts: cualquier fallo ANTES de `media_publish` es
// definitivo (no salió nada, reintentar es seguro); sólo un corte durante
// `media_publish` deja la duda de si salió.

/** Presupuesto total de la publicación: entra en el `maxDuration` de la página del planificador. */
const PUBLISH_BUDGET_MS = 50_000;
const POLL_INTERVAL_MS = 3_000;
/** Lo mínimo que tiene que quedar de presupuesto para arrancar `media_publish`. */
const MIN_PUBLISH_CALL_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un error de un paso previo a `media_publish` nunca deja una publicación en duda. */
function definitive(error: unknown): MetaApiError {
  if (error instanceof MetaApiError) return new MetaApiError(error.message, true, error.code, error.subcode);
  return new MetaApiError(error instanceof Error ? error.message : "Error desconocido publicando.", true);
}

async function createContainer(credentials: MetaCredentials, params: Record<string, string | boolean | undefined>): Promise<string> {
  try {
    const body = await graphPost(credentials, `${credentials.userId}/media`, params);
    const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : null;
    if (!id) throw new MetaApiError("Instagram no devolvió el id del contenedor.", true);
    return id;
  } catch (error) {
    throw definitive(error);
  }
}

/** Espera a que Instagram termine de procesar el archivo (un video puede tardar decenas de segundos). */
async function waitForContainer(credentials: MetaCredentials, containerId: string, deadline: number): Promise<void> {
  while (true) {
    let status: string | null = null;
    let detail: string | null = null;
    try {
      const row = asRecord(await graphGet(credentials, containerId, { fields: "status_code,status" }));
      status = row ? firstString(row, ["status_code"]) : null;
      detail = row ? firstString(row, ["status"]) : null;
    } catch (error) {
      throw definitive(error);
    }

    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new MetaApiError(`Instagram no pudo procesar el archivo (${detail ?? status}).`, true);
    }
    if (Date.now() + POLL_INTERVAL_MS + MIN_PUBLISH_CALL_MS > deadline) {
      throw new MetaApiError(
        "Instagram sigue procesando el archivo. No se publicó nada: probá de nuevo en un minuto.",
        true,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function mediaParams(file: PublishMedia, extra: Record<string, string | boolean | undefined>) {
  return file.type === "VIDEO" ? { video_url: file.url, ...extra } : { image_url: file.url, ...extra };
}

async function publish(credentials: MetaCredentials, { kind, caption, media }: PublishParams): Promise<PublishResult> {
  const deadline = Date.now() + PUBLISH_BUDGET_MS;

  const first = media[0];
  if (!first) throw new MetaApiError("La pieza no tiene archivos para publicar.", true);

  let containerId: string;
  switch (kind) {
    case "REEL":
    case "VIDEO":
      containerId = await createContainer(credentials, { media_type: "REELS", video_url: first.url, caption: caption ?? undefined });
      break;
    case "POST":
      containerId = await createContainer(credentials, { image_url: first.url, caption: caption ?? undefined });
      break;
    case "HISTORIA":
      // Las historias no llevan caption.
      containerId = await createContainer(credentials, mediaParams(first, { media_type: "STORIES" }));
      break;
    case "CARRUSEL": {
      const children = await mapWithConcurrency(media, CONCURRENCY, (file) =>
        createContainer(credentials, mediaParams(file, { is_carousel_item: true, ...(file.type === "VIDEO" ? { media_type: "VIDEO" } : {}) })),
      );
      for (const child of children) await waitForContainer(credentials, child, deadline);
      containerId = await createContainer(credentials, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: caption ?? undefined,
      });
      break;
    }
    default:
      throw new MetaApiError(`Instagram no publica piezas de tipo ${kind}.`, true);
  }

  await waitForContainer(credentials, containerId, deadline);

  const body = await graphPost(
    credentials,
    `${credentials.userId}/media_publish`,
    { creation_id: containerId },
    Math.max(deadline - Date.now(), MIN_PUBLISH_CALL_MS),
  );
  const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : null;
  return { externalId: id, message: "Publicado en Instagram." };
}

export const instagramProvider: BrandSourceProvider = {
  id: "INSTAGRAM",
  label: "Instagram",

  capabilities: {
    audience: true,
    stories: true,
    // Instagram publica todo video simple como Reel, así que REEL y VIDEO comparten flujo.
    publish: ["REEL", "VIDEO", "POST", "CARRUSEL", "HISTORIA"],
  },

  async connect(supabase, ownerId) {
    const credentials = await getMetaCredentials(supabase, ownerId);
    if (!credentials) return null;
    return {
      fetchAccounts: () => fetchAccounts(credentials),
      fetchDailyMetrics: () => fetchDailyMetrics(credentials),
      fetchMedia: () => fetchMedia(credentials),
      fetchAudience: () => fetchAudience(credentials),
      fetchComments: (posts) => fetchComments(credentials, posts),
      publish: (params) => publish(credentials, params),
    };
  },
};
