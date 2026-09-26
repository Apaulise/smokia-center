import { mapCompetitorPost, pickProfilePicUrl } from "@/lib/brand/competitors/mapper";
import { asRecord, firstString } from "@/lib/brand/sources/utils";

/** Un reel descubierto por hashtag, ya normalizado (Plans/03 §3.15). */
export interface NormalizedTrendPost {
  externalId: string;
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  raw: Record<string, unknown>;
}

/**
 * Un item del dataset de `apify/instagram-scraper` cuando `directUrls` apunta
 * a un hashtag → un reel descubierto. Reusa `mapCompetitorPost` para todo lo
 * que ya sabe leer (id, caption, thumbnail, fecha, likes/comentarios/views) y
 * suma lo que acá sí importa: la cuenta dueña, porque no hay una fila de
 * competidor seguido detrás. Sin `username` resoluble se descarta el item —
 * acá el usuario ajeno ES el dato, no un adorno.
 *
 * Sólo reels: es lo que se pidió, y el único formato con `views` público, que
 * es el proxy de "alcance" que existe.
 */
export function mapTrendPost(raw: unknown): NormalizedTrendPost | null {
  const post = mapCompetitorPost(raw);
  if (!post || post.kind !== "REEL") return null;

  const item = asRecord(raw);
  if (!item) return null;

  const username = firstString(item, ["ownerUsername"]);
  if (!username) return null;

  return {
    externalId: post.externalId,
    username,
    displayName: firstString(item, ["ownerFullName"]),
    profilePicUrl: pickProfilePicUrl(item),
    permalink: post.permalink,
    caption: post.caption,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
    likes: post.likes,
    comments: post.comments,
    views: post.views,
    raw: item,
  };
}
