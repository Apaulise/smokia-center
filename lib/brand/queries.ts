import { classifyPosts } from "@/lib/brand/insights/baseline";
import type { AnalysisPost, PostResult } from "@/lib/brand/insights/types";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ContentSortField =
  | "published_at"
  | "views"
  | "reel_avg_watch_time_ms"
  | "reel_skip_rate"
  | "saved"
  | "shares"
  | "new_followers";

const LIBRARY_MAX_ROWS = 500;

/** null cuando no hay ninguna cuenta conectada para esta plataforma — la señal del zero-state. */
export async function getBrandAccountSummary(platform: BrandPlatform, days = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_account_summary", { p_platform: platform, days }).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBrandMetricsTimeline(platform: BrandPlatform, days = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_metrics_timeline", { p_platform: platform, days });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandAudienceSummary(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_audience_summary", { p_platform: platform });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandLatestPosts(platform: BrandPlatform, limit = 8) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_latest_posts", { p_platform: platform, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandContentViewsTotal(platform: BrandPlatform): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_content_views_total", { p_platform: platform });
  if (error) throw error;
  return data ?? 0;
}

export async function getBrandContentLibrary(
  platform: BrandPlatform,
  options: {
    sort?: ContentSortField;
    ascending?: boolean;
    kind?: Database["public"]["Enums"]["brand_post_kind"];
    /** Fechas `YYYY-MM-DD`, filtran por published_at. */
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const supabase = await createClient();
  let query = supabase.rpc("brand_latest_posts", { p_platform: platform, p_limit: LIBRARY_MAX_ROWS });

  if (options.kind) query = query.eq("kind", options.kind);
  if (options.dateFrom) query = query.gte("published_at", options.dateFrom);
  if (options.dateTo) query = query.lte("published_at", `${options.dateTo}T23:59:59`);

  const { data, error } = await query.order(options.sort ?? "published_at", {
    ascending: options.ascending ?? false,
    nullsFirst: false,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandPost(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_posts")
    .select("*, brand_accounts(username, display_name)")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBrandPostMetricsHistory(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_post_metrics")
    .select("*")
    .eq("post_id", postId)
    .order("captured_on", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandPostComments(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_post_comments")
    .select("*")
    .eq("post_id", postId)
    .order("commented_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Todo el contenido con métricas, ya mapeado a camelCase para lib/brand/insights/
 * (CLAUDE.md §5 — el mapeo pasa acá, no en cada caller). El tope de 500 filas
 * de la biblioteca sobra para calcular patrones (Plans/03 §3.5).
 */
export async function getBrandPostsForAnalysis(platform: BrandPlatform): Promise<AnalysisPost[]> {
  const rows = await getBrandContentLibrary(platform, { sort: "published_at", ascending: true });
  return rows.map((row) => ({
    postId: row.post_id,
    kind: row.kind,
    caption: row.caption,
    permalink: row.permalink,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    reach: row.reach,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    saved: row.saved,
    shares: row.shares,
    newFollowers: row.new_followers,
    reelAvgWatchTimeMs: row.reel_avg_watch_time_ms,
    reelSkipRate: row.reel_skip_rate,
  }));
}

/**
 * La clasificación de todas las piezas (Plans/03 §3.11), por postId. Se pide
 * sobre el catálogo completo y no sobre lo que la pantalla filtró: el baseline
 * de un reel son los reels anteriores, se vean o no en la grilla.
 */
export async function getBrandPostClassifications(platform: BrandPlatform): Promise<Record<string, PostResult>> {
  const posts = await getBrandPostsForAnalysis(platform);
  return classifyPosts(posts, new Date());
}

export async function getBrandRecommendations(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_recommendations")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** La lectura del análisis más reciente (SOC §29: qué sabemos/sospechamos/no sabemos todavía). */
export async function getLatestBrandAnalysisNote(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_analysis_notes")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const CHAT_THREADS_MAX = 50;

/** Las conversaciones de la plataforma, la más nueva primero — el historial del chat (§3.6). */
export async function getBrandChatThreads(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_chat_threads")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(CHAT_THREADS_MAX);
  if (error) throw error;
  return data ?? [];
}

/** Las ideas guardadas desde el chat, la más nueva primero (§3.6). El planificador (§3.7) las va a tomar de esta misma tabla. */
export async function getBrandContentItems(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBrandChatMessages(threadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLatestBrandSyncJob(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_sync_jobs")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
