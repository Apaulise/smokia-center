import { z } from "zod";

import { graphGet, mapWithConcurrency, MetaApiError, type MetaCredentials } from "@/lib/meta/client";
import type { Database } from "@/lib/supabase/database.types";

import { META_CONCURRENCY, META_RESULTS_PER_HASHTAG, META_TOP_MEDIA_TIMEOUT_MS } from "./schema";

/*
 * Descubrir virales con la API oficial de Meta (Plans/03 §3.17): la búsqueda
 * por hashtag de la Graph API, que a diferencia del scraper de Apify (feed
 * reciente) tiene el endpoint `top_media`: lo más popular del hashtag.
 *
 * Lo que NO da, y por eso el resto del código no lo asume: views de piezas
 * ajenas, el @usuario del autor y una miniatura para videos.
 */

type PostKind = Database["public"]["Enums"]["brand_post_kind"];

const FIELDS = "id,media_type,media_product_type,caption,like_count,comments_count,timestamp,permalink,media_url";

/** Meta cambia sin avisar, igual que un scraper: nada de esto se asume, todo se valida. */
const HashtagSearchSchema = z.object({ data: z.array(z.object({ id: z.string() })).default([]) });
const PageSchema = z.object({ data: z.array(z.unknown()).default([]) });
const MediaSchema = z.object({
  id: z.string().min(1),
  media_type: z.string().nullish(),
  media_product_type: z.string().nullish(),
  caption: z.string().nullish(),
  like_count: z.number().nullish(),
  comments_count: z.number().nullish(),
  timestamp: z.string().nullish(),
  permalink: z.string().nullish(),
  media_url: z.string().nullish(),
});

/** Una pieza descubierta por `top_media`, ya normalizada. */
export interface NormalizedMetaTrendPost {
  externalId: string;
  kind: PostKind;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  raw: Record<string, unknown>;
}

/** `media_type` y `media_product_type` de la Graph API → el formato de la app. */
export function metaKind(mediaType: string | null | undefined, productType: string | null | undefined): PostKind {
  if (mediaType === "CAROUSEL_ALBUM") return "CARRUSEL";
  if (mediaType === "VIDEO") return productType === "REELS" ? "REEL" : "VIDEO";
  return "POST";
}

/** Meta devuelve `+0000` sin los dos puntos: se normaliza antes de parsear, y una fecha ilegible queda null. */
function toIso(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const time = new Date(timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function mapMetaTrendPost(raw: unknown): NormalizedMetaTrendPost | null {
  const parsed = MediaSchema.safeParse(raw);
  if (!parsed.success) return null;
  const media = parsed.data;
  const kind = metaKind(media.media_type, media.media_product_type);

  return {
    externalId: media.id,
    kind,
    permalink: media.permalink ?? null,
    caption: media.caption ?? null,
    // En un video `media_url` es el mp4, no una imagen: la tarjeta cae a su placeholder.
    thumbnailUrl: kind === "REEL" || kind === "VIDEO" ? null : (media.media_url ?? null),
    publishedAt: toIso(media.timestamp),
    likes: media.like_count ?? null,
    comments: media.comments_count ?? null,
    raw: media as Record<string, unknown>,
  };
}

async function fetchTopMedia(credentials: MetaCredentials, tag: string): Promise<NormalizedMetaTrendPost[]> {
  const search = HashtagSearchSchema.safeParse(
    await graphGet(credentials, "ig_hashtag_search", { user_id: credentials.userId, q: tag }),
  );
  const hashtagId = search.success ? search.data.data[0]?.id : undefined;
  if (!hashtagId) throw new MetaApiError(`Instagram no encontró el hashtag #${tag}.`, true);

  const page = PageSchema.parse(
    await graphGet(
      credentials,
      `${hashtagId}/top_media`,
      { user_id: credentials.userId, fields: FIELDS, limit: META_RESULTS_PER_HASHTAG },
      META_TOP_MEDIA_TIMEOUT_MS,
    ),
  );
  return page.data.flatMap((item) => {
    const post = mapMetaTrendPost(item);
    return post ? [post] : [];
  });
}

export interface MetaTrendsResult {
  posts: NormalizedMetaTrendPost[];
  /** Hashtags que fallaron, con el motivo. Un hashtag caído no tira los otros. */
  failures: { tag: string; message: string }[];
}

/** Lo más popular de cada hashtag. Una pieza que aparece en dos hashtags entra una sola vez. */
export async function fetchMetaTrends(credentials: MetaCredentials, tags: string[]): Promise<MetaTrendsResult> {
  const results = await mapWithConcurrency(tags, META_CONCURRENCY, async (tag) => {
    try {
      return { tag, posts: await fetchTopMedia(credentials, tag), error: null };
    } catch (error) {
      const message = error instanceof MetaApiError ? error.message : "Error desconocido al consultar Instagram.";
      return { tag, posts: [] as NormalizedMetaTrendPost[], error: message };
    }
  });

  const unique = new Map<string, NormalizedMetaTrendPost>();
  for (const result of results) for (const post of result.posts) unique.set(post.externalId, post);

  return {
    posts: [...unique.values()],
    failures: results.flatMap((result) => (result.error ? [{ tag: result.tag, message: result.error }] : [])),
  };
}
