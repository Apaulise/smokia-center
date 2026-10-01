import { createClient } from "@/lib/supabase/server";

import { computeTrendOutliers } from "./insights";
import { TREND_MAX_AGE_DAYS, TREND_MIN_VIEWS, type InsightPost, type Outlier } from "@/lib/brand/competitors/insights";
import type { Database } from "@/lib/supabase/database.types";

type JobStatus = Database["public"]["Enums"]["job_status"];

/** PostgREST corta en 1.000 filas por default: se pide explícito, mismo criterio que competitors/queries.ts. */
const POSTS_MAX_ROWS = 5000;

const POST_COLUMNS =
  "id, username, display_name, profile_pic_url, kind, permalink, caption, thumbnail_url, published_at, likes, comments, views, dismissed_at, relevance_score, relevance_reason, relevance_checked_at";

export interface TrendPostRow extends InsightPost {
  username: string;
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
  status: JobStatus;
  lastError: string | null;
  /** Reels que trajo la corrida. Sólo con la búsqueda COMPLETADO. */
  imported: number;
  /** De esos, los que hoy califican como virales (piso de views y ventana de recencia). */
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
    .select("id, query, status, last_error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  let imported = 0;
  let viral = 0;
  if (data.status === "COMPLETADO") {
    const { data: posts } = await supabase
      .from("brand_trend_posts")
      .select("views, published_at")
      .eq("search_id", data.id)
      .limit(POSTS_MAX_ROWS);
    const cutoff = Date.now() - TREND_MAX_AGE_DAYS * 86_400_000;
    imported = posts?.length ?? 0;
    viral = (posts ?? []).filter(
      (post) => (post.views ?? 0) >= TREND_MIN_VIEWS && post.published_at !== null && new Date(post.published_at).getTime() >= cutoff,
    ).length;
  }
  return { query: data.query, status: data.status, lastError: data.last_error, imported, viral };
}

/** Las búsquedas todavía en curso, para que TrendPoller sepa qué reconciliar. */
export async function getPendingTrendSearchIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("brand_trend_searches").select("id").eq("status", "EN_CURSO");
  return (data ?? []).map((row) => row.id);
}

/**
 * Todos los reels descubiertos del usuario, con sus outliers calculados sobre
 * el batch entero (§3.15) — no por cuenta, como en competencia.
 */
export async function getTrendPostsWithInsights(): Promise<TrendPostsWithInsights> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("brand_trend_posts")
    .select(POST_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(POSTS_MAX_ROWS);
  if (error) throw error;

  const posts: TrendPostRow[] = (rows ?? []).map((row) => ({
    id: row.id,
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
  }));

  // Todo entra al cálculo, descartado incluido: computeTrendOutliers lo filtra internamente
  // y así un outlier real que se descarta sigue siendo recuperable desde "Ver descartadas".
  const outliers = computeTrendOutliers(posts);

  return { posts, outliers };
}
