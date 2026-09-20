import { getCompetitorsWithInsights } from "@/lib/brand/competitors/queries";
import { getBrandLatestPosts } from "@/lib/brand/queries";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import type { StepItem } from "./next-steps";
import type { FollowerSnapshot } from "./progress";
import type { BrandGoal } from "./schema";

/** Tres meses de fotos sobran para el ritmo (ventana de 28 días) y para atribuir piezas recientes. */
const SNAPSHOT_MAX_ROWS = 400;
const PLANNING_MAX_ROWS = 300;
const LINKABLE_POSTS_LOOKBACK = 60;

/**
 * La meta que se está trabajando. Sin una activa devuelve la última cumplida,
 * para que la tarjeta pueda decir "meta cumplida" en vez de volver a pedir una
 * como si nunca hubiera existido.
 */
export async function getCurrentGoal(platform: BrandPlatform): Promise<BrandGoal | null> {
  const supabase = await createClient();

  const { data: active, error } = await supabase
    .from("brand_goals")
    .select("*")
    .eq("platform", platform)
    .eq("status", "ACTIVA")
    .maybeSingle();
  if (error) throw error;
  if (active) return active;

  const { data: achieved, error: achievedError } = await supabase
    .from("brand_goals")
    .select("*")
    .eq("platform", platform)
    .eq("status", "CUMPLIDA")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (achievedError) throw achievedError;
  return achieved;
}

/**
 * Las fotos diarias del contador de seguidores, de la más vieja a la más nueva.
 * Sólo las que traen `followers_count`: las filas de métricas diarias que
 * escribe la sincronización para días pasados (alcance, interacciones) no lo
 * tienen, y no son una foto del contador.
 */
export async function getFollowerSnapshots(platform: BrandPlatform): Promise<FollowerSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_account_metrics")
    .select("captured_on, followers_count, brand_accounts!inner(platform)")
    .eq("brand_accounts.platform", platform)
    .not("followers_count", "is", null)
    .order("captured_on", { ascending: false })
    .limit(SNAPSHOT_MAX_ROWS);
  if (error) throw error;

  return (data ?? [])
    .flatMap((row) => (row.followers_count === null ? [] : [{ day: row.captured_on, followers: row.followers_count }]))
    .reverse();
}

export interface PlanningRow {
  id: string;
  title: string;
  kind: Database["public"]["Enums"]["brand_post_kind"];
  status: string;
  hypothesis: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  post_id: string | null;
  parent_item_id: string | null;
  knowledge_id: string | null;
}

/** Todas las piezas del planificador, con lo justo para "próximos pasos" y para el resumen de la semana. */
export async function getPlanningRows(platform: BrandPlatform): Promise<PlanningRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("id, title, kind, status, hypothesis, scheduled_for, published_at, post_id, parent_item_id, knowledge_id")
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(PLANNING_MAX_ROWS);
  if (error) throw error;
  return data ?? [];
}

export function toStepItems(rows: PlanningRow[]): StepItem[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    hypothesis: row.hypothesis,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    postId: row.post_id,
  }));
}

/**
 * De la base de conocimiento, lo que "próximos pasos" necesita saber: qué posts
 * ya tienen una conclusión escrita (una nota vinculada) y cuáles son las notas de
 * RADAR. Una sola consulta con tres columnas.
 */
export async function getKnowledgeUsage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_knowledge").select("id, collection, post_id");
  if (error) throw error;

  const notes = data ?? [];
  return {
    radarIds: new Set(notes.filter((note) => note.collection === "RADAR").map((note) => note.id)),
    concludedPostIds: new Set(notes.flatMap((note) => (note.post_id ? [note.post_id] : []))),
  };
}

/** Cuántas piezas dicen haber salido de una nota de RADAR (`knowledge_id`). */
export function countPiecesFromRadar(rows: PlanningRow[], radarIds: ReadonlySet<string>): number {
  return rows.filter((row) => row.knowledge_id !== null && radarIds.has(row.knowledge_id)).length;
}

/** Cuántas publicaciones de la competencia están por encima de lo habitual de su propia cuenta (§3.8). */
export async function countCompetitorOutliers(platform: BrandPlatform): Promise<number> {
  const competitors = await getCompetitorsWithInsights(platform);
  return competitors.reduce((sum, entry) => sum + entry.insights.outliers.length, 0);
}

/** `finished_at` de la última sincronización que terminó bien. */
export async function getLastCompletedSyncAt(platform: BrandPlatform): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_sync_jobs")
    .select("finished_at")
    .eq("platform", platform)
    .eq("status", "COMPLETADO")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.finished_at ?? null;
}

export interface LinkablePost {
  postId: string;
  kind: string;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
}

/**
 * Los posts propios recientes que todavía no están enlazados a ninguna pieza:
 * lo que ofrece "Ya la publiqué". El filtro por formato compatible lo hace el
 * diálogo, que sabe de qué pieza se trata.
 */
export async function getLinkablePosts(platform: BrandPlatform): Promise<LinkablePost[]> {
  const supabase = await createClient();
  const [posts, linked] = await Promise.all([
    getBrandLatestPosts(platform, LINKABLE_POSTS_LOOKBACK),
    supabase.from("brand_content_items").select("post_id").not("post_id", "is", null),
  ]);
  if (linked.error) throw linked.error;

  const taken = new Set((linked.data ?? []).flatMap((row) => (row.post_id ? [row.post_id] : [])));
  return posts
    .filter((post) => !taken.has(post.post_id))
    .map((post) => ({
      postId: post.post_id,
      kind: post.kind,
      caption: post.caption,
      thumbnailUrl: post.thumbnail_url,
      publishedAt: post.published_at,
      views: post.views,
    }));
}
