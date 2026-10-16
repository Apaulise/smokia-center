import { getMetaCredentials } from "@/lib/meta/client";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { type InsightPost, type Outlier } from "@/lib/brand/competitors/insights";

import { computeTrendOutliers, isViralTrendPost } from "./insights";
import { META_HASHTAGS_PER_WEEK, parseHashtags, type TrendSource } from "./schema";

type JobStatus = Database["public"]["Enums"]["job_status"];
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** PostgREST corta en 1.000 filas por default: se pide explícito, mismo criterio que competitors/queries.ts. */
const POSTS_MAX_ROWS = 5000;

const POST_COLUMNS =
  "id, source, username, display_name, profile_pic_url, kind, permalink, caption, thumbnail_url, published_at, likes, comments, views, dismissed_at, relevance_score, relevance_reason, relevance_checked_at";

export interface TrendPostRow extends InsightPost {
  source: TrendSource;
  /** null en lo que viene de Meta: `top_media` no devuelve el autor. */
  username: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  dismissedAt: string | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  relevanceCheckedAt: string | null;
}

export interface TrendPostsWithInsights {
  posts: TrendPostRow[];
  outliers: Outlier<TrendPostRow>[];
}

/** El código corto de una publicación, que es lo único que comparten los ids de Apify y los de la Graph API. */
function shortcodeOf(permalink: string | null): string | null {
  return permalink?.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] ?? null;
}

/**
 * La misma publicación puede llegar por las dos fuentes (con ids distintos).
 * Se queda la de Apify, que trae views y autor; la de Meta no aporta nada más.
 */
export function dedupeTrendPosts<T extends { source: TrendSource; permalink: string | null }>(posts: T[]): T[] {
  const apify = new Set(posts.filter((post) => post.source === "APIFY").map((post) => shortcodeOf(post.permalink)));
  return posts.filter((post) => {
    if (post.source !== "META") return true;
    const code = shortcodeOf(post.permalink);
    return code === null || !apify.has(code);
  });
}

/**
 * Todo lo descubierto del usuario con sus outliers (§3.15, §3.17). Lo comparten
 * la pantalla y las acciones del servidor, para que el mapeo no se escriba dos veces.
 */
export async function loadTrendPosts(supabase: Supabase): Promise<TrendPostsWithInsights> {
  const { data: rows, error } = await supabase
    .from("brand_trend_posts")
    .select(POST_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(POSTS_MAX_ROWS);
  if (error) throw error;

  const posts = dedupeTrendPosts<TrendPostRow>(
    (rows ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      kind: row.kind,
      publishedAt: row.published_at,
      likes: row.likes,
      comments: row.comments,
      views: row.views,
      username: row.username,
      displayName: row.display_name,
      profilePicUrl: row.profile_pic_url,
      permalink: row.permalink,
      caption: row.caption,
      thumbnailUrl: row.thumbnail_url,
      dismissedAt: row.dismissed_at,
      relevanceScore: row.relevance_score,
      relevanceReason: row.relevance_reason,
      relevanceCheckedAt: row.relevance_checked_at,
    })),
  );

  // Todo entra al cálculo, descartado incluido: computeTrendOutliers lo filtra internamente
  // y así un outlier real que se descarta sigue siendo recuperable desde "Ver descartadas".
  return { posts, outliers: computeTrendOutliers(posts) };
}

export async function getTrendPostsWithInsights(): Promise<TrendPostsWithInsights> {
  return loadTrendPosts(await createClient());
}

export interface IdeaFromTrendPost {
  id: string;
  title: string;
}

/** Calco de getIdeasFromOutliers (lib/brand/competitors/queries.ts), sobre source_trend_post_id. */
export async function getIdeasFromTrendPosts(): Promise<Map<string, IdeaFromTrendPost>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("id, title, source_trend_post_id")
    .not("source_trend_post_id", "is", null);
  if (error) throw error;

  return new Map(
    (data ?? []).flatMap((row) => (row.source_trend_post_id ? [[row.source_trend_post_id, { id: row.id, title: row.title }] as const] : [])),
  );
}

export interface LastTrendSearch {
  query: string;
  source: TrendSource;
  status: JobStatus;
  lastError: string | null;
  /** Piezas que trajo la corrida. Sólo con la búsqueda COMPLETADO. */
  imported: number;
  /** De esas, las que hoy califican como virales (piso y ventana de su fuente). */
  viral: number;
}

/**
 * La búsqueda más reciente: sus hashtags precargan el input de "Buscar
 * virales", y su estado/error se muestran al lado del botón — sin esto, una
 * búsqueda que falla es invisible (no hay una tabla de búsquedas como la de
 * cuentas seguidas).
 */
export async function getLastTrendSearch(): Promise<LastTrendSearch | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brand_trend_searches")
    .select("id, query, source, status, last_error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  let imported = 0;
  let viral = 0;
  if (data.status === "COMPLETADO") {
    const { data: posts } = await supabase
      .from("brand_trend_posts")
      .select("source, views, likes, published_at")
      .eq("search_id", data.id)
      .limit(POSTS_MAX_ROWS);
    imported = posts?.length ?? 0;
    viral = (posts ?? []).filter((post) =>
      isViralTrendPost({ source: post.source, views: post.views, likes: post.likes, publishedAt: post.published_at }),
    ).length;
  }
  return { query: data.query, source: data.source, status: data.status, lastError: data.last_error, imported, viral };
}

/** Las búsquedas todavía en curso, para que TrendPoller sepa qué reconciliar. Sólo Apify: la de Meta es síncrona. */
export async function getPendingTrendSearchIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("brand_trend_searches").select("id").eq("source", "APIFY").eq("status", "EN_CURSO");
  return (data ?? []).map((row) => row.id);
}

// ── Cupo de la API de Meta ────────────────────────────────────────────────

const WEEK_MS = 7 * 86_400_000;

/**
 * Los hashtags que ya se consultaron por Meta en los últimos 7 días. Meta
 * cuenta hashtags ÚNICOS: repetir uno de esta lista no gasta cupo.
 */
export async function getMetaUsedHashtags(supabase: Supabase): Promise<Set<string>> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const { data } = await supabase
    .from("brand_trend_searches")
    .select("query")
    .eq("source", "META")
    .eq("status", "COMPLETADO")
    .gte("created_at", since);
  return new Set((data ?? []).flatMap((row) => parseHashtags(row.query)));
}

export type MetaDiscoveryStatus =
  | { state: "ready"; remaining: number }
  | { state: "no-connection" }
  /** El token es de Instagram Login (`IG…`): esa API no puede buscar hashtags. */
  | { state: "wrong-token" };

/** ¿Puede este usuario buscar por Meta ahora, y cuántos hashtags nuevos le quedan esta semana? */
export async function getMetaDiscoveryStatus(): Promise<MetaDiscoveryStatus> {
  const user = await requireUser();
  const supabase = await createClient();

  const credentials = await getMetaCredentials(supabase, user.id);
  if (!credentials) return { state: "no-connection" };
  if (credentials.accessToken.startsWith("IG")) return { state: "wrong-token" };

  const used = await getMetaUsedHashtags(supabase);
  return { state: "ready", remaining: Math.max(META_HASHTAGS_PER_WEEK - used.size, 0) };
}
