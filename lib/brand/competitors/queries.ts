import type { BrandPlatform } from "@/lib/brand/sources/types";
import { APIFY_KEY_SETTING, GEMINI_KEY_SETTING } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";

import { computeCompetitorInsights, type CompetitorInsights, type InsightPost } from "./insights";
import type { Competitor } from "./schema";

/** PostgREST corta en 1.000 filas por default: con el tope de cuentas y de publicaciones por corrida no se llega, pero se pide explícito. */
const POSTS_MAX_ROWS = 5000;

const POST_COLUMNS =
  "id, competitor_id, kind, permalink, caption, thumbnail_url, published_at, likes, comments, views, is_pinned, dismissed_at, relevance_score, relevance_reason, relevance_checked_at";

export interface CompetitorPostRow extends InsightPost {
  competitorId: string;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  isPinned: boolean;
  /** Descartada a mano desde la pantalla (§3.14). */
  dismissedAt: string | null;
  /** 0-100, o null si todavía no pasó por el clasificador. Sin dato no se esconde nada. */
  relevanceScore: number | null;
  relevanceReason: string | null;
  relevanceCheckedAt: string | null;
}

export interface CompetitorWithInsights {
  competitor: Competitor;
  posts: CompetitorPostRow[];
  insights: CompetitorInsights<CompetitorPostRow>;
}

/** ¿Hay una API key de Apify cargada? Sin ella no se puede traer nada, y la pantalla lo dice antes de ofrecer botones. */
export async function hasApifyKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key").eq("key", APIFY_KEY_SETTING).maybeSingle();
  return data !== null;
}

/** ¿Hay key del clasificador? Sin ella la pantalla funciona igual, sólo que sin el filtro por nicho. */
export async function hasGeminiKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key").eq("key", GEMINI_KEY_SETTING).maybeSingle();
  return data !== null;
}

export interface IdeaFromOutlier {
  id: string;
  title: string;
}

/**
 * Qué outliers ya se convirtieron en una pieza. Una sola consulta para toda la
 * pantalla: la tarjeta necesita saberlo para ofrecer "Ver la idea" en vez de
 * "Usar" — y para no volver a pagar por lo mismo.
 */
export async function getIdeasFromOutliers(): Promise<Map<string, IdeaFromOutlier>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("id, title, source_competitor_post_id")
    .not("source_competitor_post_id", "is", null);
  if (error) throw error;

  return new Map(
    (data ?? []).flatMap((row) =>
      row.source_competitor_post_id ? [[row.source_competitor_post_id, { id: row.id, title: row.title }] as const] : [],
    ),
  );
}

/**
 * Las cuentas seguidas con sus publicaciones y lo calculado de ellas. Una sola
 * consulta de publicaciones para todas (agrupadas acá): son pocas cuentas y
 * N consultas serían N viajes a la base.
 */
export async function getCompetitorsWithInsights(platform: BrandPlatform): Promise<CompetitorWithInsights[]> {
  const supabase = await createClient();

  const { data: competitors, error } = await supabase
    .from("brand_competitors")
    .select("*")
    .eq("platform", platform)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!competitors || competitors.length === 0) return [];

  const { data: rows, error: postsError } = await supabase
    .from("brand_competitor_posts")
    .select(POST_COLUMNS)
    .in(
      "competitor_id",
      competitors.map((c) => c.id),
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(POSTS_MAX_ROWS);
  if (postsError) throw postsError;

  const byCompetitor = new Map<string, CompetitorPostRow[]>();
  for (const row of rows ?? []) {
    const post: CompetitorPostRow = {
      id: row.id,
      competitorId: row.competitor_id,
      kind: row.kind,
      publishedAt: row.published_at,
      likes: row.likes,
      comments: row.comments,
      views: row.views,
      permalink: row.permalink,
      caption: row.caption,
      thumbnailUrl: row.thumbnail_url,
      isPinned: row.is_pinned,
      dismissedAt: row.dismissed_at,
      relevanceScore: row.relevance_score,
      relevanceReason: row.relevance_reason,
      relevanceCheckedAt: row.relevance_checked_at,
    };
    const list = byCompetitor.get(row.competitor_id) ?? [];
    list.push(post);
    byCompetitor.set(row.competitor_id, list);
  }

  const now = new Date();
  return competitors.map((competitor) => {
    const posts = byCompetitor.get(competitor.id) ?? [];
    return { competitor, posts, insights: computeCompetitorInsights(posts, now) };
  });
}
