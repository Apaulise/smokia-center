"use server";

import { revalidatePath } from "next/cache";

import { APIFY_TERMINAL_STATUSES, getAllApifyDatasetItems, getApifyRun, startApifyRun } from "@/lib/apify/client";
import { getGeminiApiKey } from "@/lib/brand/ai/key";
import { generateIdeaFromOutlier } from "@/lib/brand/ai/outlier-idea";
import { buildOwnContext } from "@/lib/brand/ai/script-context";
import { classifyRelevance, RELEVANCE_BATCH_MAX, type RelevanceCandidate } from "@/lib/brand/competitors/relevance";
import { GROUP_SIGNAL_LABEL } from "@/lib/brand/competitors/insights";
import { computeTrendOutliers } from "@/lib/brand/trends/insights";
import { KIND_LABEL, normalizeHashtags } from "@/lib/brand/planner/schema";
import { decrypt } from "@/lib/crypto";
import { APIFY_KEY_SETTING, GEMINI_KEY_SETTING } from "@/lib/settings/constants";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

import { mapTrendPost, type NormalizedTrendPost } from "./mapper";
import type { TrendPostRow } from "./queries";
import { SearchTrendsInput, TREND_ACTOR_ID, TREND_RUN_TIMEOUT_MINUTES } from "./schema";

// Sin service role ni webhook, a propósito: cada búsqueda la dispara una
// persona y se reconcilia con SU sesión (RLS), mismo criterio que
// lib/brand/competitors/actions.ts.

const COMPETITORS_PATH = "/marca/competencia";
const PLANNER_PATH = "/marca/planificador";
const PLATFORM = "INSTAGRAM" as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type JobStatus = Database["public"]["Enums"]["job_status"];

export type TrendResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

async function getApifyToken(supabase: Supabase): Promise<TrendResult<{ token: string }>> {
  const { data: row } = await supabase.from("settings").select("value_encrypted").eq("key", APIFY_KEY_SETTING).maybeSingle();
  if (!row) return { ok: false, message: "Cargá tu API key de Apify en Configuración antes de buscar virales." };
  try {
    return { ok: true, token: decrypt(row.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key de Apify guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}

async function getGeminiToken(supabase: Supabase): Promise<string | null> {
  const { data: row } = await supabase.from("settings").select("value_encrypted").eq("key", GEMINI_KEY_SETTING).maybeSingle();
  if (!row) return null;
  try {
    return decrypt(row.value_encrypted);
  } catch {
    return null;
  }
}

/** "Buscar virales": una corrida por hashtags, con la misma URL de la página del hashtag en vez de un perfil. */
export async function searchTrends(input: SearchTrendsInput): Promise<TrendResult<{ id: string }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsed = SearchTrendsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Los datos no son válidos." };
  const { hashtags, resultsLimit } = parsed.data;

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return keyResult;

  const { data: row, error } = await supabase
    .from("brand_trend_searches")
    .insert({ owner_id: user.id, query: hashtags.join(", "), results_limit: resultsLimit })
    .select("id")
    .single();
  if (error || !row) return { ok: false, message: "No se pudo guardar la búsqueda." };

  const input_ = {
    hashtags,
    resultsType: "reels",
    resultsLimit,
  };

  try {
    const run = await startApifyRun({ token: keyResult.token, actorId: TREND_ACTOR_ID, input: input_ });
    await supabase
      .from("brand_trend_searches")
      .update({ status: "EN_CURSO", apify_run_id: run.id, last_run_started_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
  } catch (runError) {
    const message = runError instanceof Error ? runError.message : "Error desconocido.";
    await supabase.from("brand_trend_searches").update({ status: "FALLIDO", last_error: message }).eq("id", row.id);
    revalidatePath(COMPETITORS_PATH);
    return { ok: false, message: `Apify rechazó la corrida: ${message}` };
  }

  revalidatePath(COMPETITORS_PATH);
  return { ok: true, id: row.id };
}

export type ReconcileTrendSearchResult = { status: JobStatus | "NOT_FOUND"; imported: number };

/**
 * Reconcilia una búsqueda: pregunta a Apify, y si terminó, pagina el dataset
 * e importa. Idempotente — upsert por (owner_id, external_id) — mismo patrón
 * que reconcileCompetitor. Se llama desde TrendPoller.
 */
export async function reconcileTrendSearch(id: string): Promise<ReconcileTrendSearchResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: search } = await supabase.from("brand_trend_searches").select("*").eq("id", id).maybeSingle();
  if (!search) return { status: "NOT_FOUND", imported: 0 };

  if (search.status !== "EN_CURSO" || !search.apify_run_id) return { status: search.status, imported: 0 };

  const fail = async (message: string, cost: number | null = null) => {
    await supabase
      .from("brand_trend_searches")
      .update({ status: "FALLIDO", last_error: message, ...(cost !== null ? { last_cost_usd: cost } : {}) })
      .eq("id", id);
    revalidatePath(COMPETITORS_PATH);
    return { status: "FALLIDO" as const, imported: 0 };
  };

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return fail(keyResult.message);

  const startedAt = search.last_run_started_at ? new Date(search.last_run_started_at).getTime() : Date.now();
  const overdue = (Date.now() - startedAt) / 60_000 > TREND_RUN_TIMEOUT_MINUTES;

  let run;
  try {
    run = await getApifyRun({ token: keyResult.token, runId: search.apify_run_id });
  } catch (fetchError) {
    console.error("No se pudo consultar la corrida de una búsqueda de virales:", fetchError instanceof Error ? fetchError.message : fetchError);
    return overdue ? fail(`No se pudo consultar la corrida en ${TREND_RUN_TIMEOUT_MINUTES} minutos.`) : { status: "EN_CURSO", imported: 0 };
  }

  if (!APIFY_TERMINAL_STATUSES.has(run.status)) {
    return overdue ? fail(`La corrida no terminó en ${TREND_RUN_TIMEOUT_MINUTES} minutos.`, run.costUsd) : { status: "EN_CURSO", imported: 0 };
  }

  if (run.status !== "SUCCEEDED") return fail(`Apify terminó con estado ${run.status}.`, run.costUsd);

  let items: unknown[];
  try {
    items = await getAllApifyDatasetItems({ token: keyResult.token, datasetId: run.defaultDatasetId });
  } catch (readError) {
    console.error("No se pudo leer el dataset de una búsqueda de virales:", readError instanceof Error ? readError.message : readError);
    return overdue ? fail("No se pudo leer el resultado de la corrida.", run.costUsd) : { status: "EN_CURSO", imported: 0 };
  }

  // Un Map por external_id: si el dataset repite un reel, un upsert con filas repetidas rompe el ON CONFLICT.
  const posts = new Map<string, NormalizedTrendPost>();
  for (const item of items) {
    const post = mapTrendPost(item);
    if (post) posts.set(post.externalId, post);
  }

  if (posts.size === 0) {
    return fail("Apify no devolvió reels para esos hashtags. Probá con otros.", run.costUsd);
  }

  const { error } = await supabase.from("brand_trend_posts").upsert(
    [...posts.values()].map((post) => ({
      owner_id: user.id,
      search_id: id,
      external_id: post.externalId,
      username: post.username,
      display_name: post.displayName,
      profile_pic_url: post.profilePicUrl,
      kind: "REEL" as const,
      permalink: post.permalink,
      caption: post.caption,
      thumbnail_url: post.thumbnailUrl,
      published_at: post.publishedAt,
      likes: post.likes,
      comments: post.comments,
      views: post.views,
      raw: post.raw as Json,
    })),
    { onConflict: "owner_id,external_id" },
  );
  if (error) return fail(`No se pudo importar: ${error.message}`, run.costUsd);

  await supabase
    .from("brand_trend_searches")
    .update({ status: "COMPLETADO", last_error: null, last_cost_usd: run.costUsd, last_synced_at: new Date().toISOString() })
    .eq("id", id);

  // Clasificar lo recién importado es gratis (free tier) y deja la pantalla lista al abrirla.
  await classifyPendingTrends(supabase);

  revalidatePath(COMPETITORS_PATH);
  return { status: "COMPLETADO", imported: posts.size };
}

// ── Relevancia ────────────────────────────────────────────────────────────

/** Los candidatos a clasificar: todo lo que hoy se muestra como outlier descubierto y todavía no pasó por el clasificador. */
async function collectTrendRelevanceCandidates(supabase: Supabase): Promise<RelevanceCandidate[]> {
  const { posts, outliers } = await getTrendPostsWithInsightsFor(supabase);
  const byId = new Map(posts.map((post) => [post.id, post]));

  const candidates: RelevanceCandidate[] = [];
  for (const outlier of outliers) {
    const post = byId.get(outlier.post.id);
    if (!post || post.relevanceCheckedAt || post.dismissedAt) continue;
    candidates.push({
      id: post.id,
      username: post.username,
      kind: post.kind,
      caption: post.caption,
      publishedAt: post.publishedAt,
      multiple: outlier.multiple,
    });
  }
  return candidates;
}

/** getTrendPostsWithInsights toma la sesión del contexto de Server Component; acá se necesita con el mismo supabase ya autenticado del caller. */
async function getTrendPostsWithInsightsFor(supabase: Supabase) {
  const { data: rows, error } = await supabase
    .from("brand_trend_posts")
    .select(
      "id, username, display_name, profile_pic_url, kind, permalink, caption, thumbnail_url, published_at, likes, comments, views, dismissed_at, relevance_score, relevance_reason, relevance_checked_at",
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(5000);
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

  const outliers = computeTrendOutliers(posts);
  return { posts, outliers };
}

async function writeTrendVerdicts(supabase: Supabase, verdicts: { id: string; score: number; reason: string }[]): Promise<void> {
  const checkedAt = new Date().toISOString();
  for (const verdict of verdicts) {
    await supabase
      .from("brand_trend_posts")
      .update({ relevance_score: verdict.score, relevance_reason: verdict.reason, relevance_checked_at: checkedAt })
      .eq("id", verdict.id);
  }
}

async function classifyPendingTrends(supabase: Supabase): Promise<void> {
  const apiKey = await getGeminiToken(supabase);
  if (!apiKey) return;
  const candidates = await collectTrendRelevanceCandidates(supabase);
  if (candidates.length === 0) return;
  await writeTrendVerdicts(supabase, await classifyRelevance({ apiKey, candidates }));
}

/** "Clasificar" en el tablero: pasa por todo lo pendiente, propio y descubierto (esta mitad). */
export async function classifyPendingTrendOutliers(): Promise<TrendResult<{ classified: number; pending: number }>> {
  await requireUser();
  const supabase = await createClient();

  const apiKey = await getGeminiToken(supabase);
  if (!apiKey) return { ok: false, message: "Cargá tu API key de Google AI Studio en Configuración para clasificar." };

  const candidates = await collectTrendRelevanceCandidates(supabase);
  if (candidates.length === 0) return { ok: true, classified: 0, pending: 0 };

  let classified = 0;
  for (let index = 0; index < candidates.length; index += RELEVANCE_BATCH_MAX) {
    const batch = candidates.slice(index, index + RELEVANCE_BATCH_MAX);
    const verdicts = await classifyRelevance({ apiKey, candidates: batch });
    if (verdicts.length === 0) break;
    await writeTrendVerdicts(supabase, verdicts);
    classified += verdicts.length;
  }

  revalidatePath(COMPETITORS_PATH);
  if (classified === 0) return { ok: false, message: "Gemini no devolvió ninguna clasificación. Probá de nuevo en un rato." };
  return { ok: true, classified, pending: candidates.length - classified };
}

// ── Descartar ─────────────────────────────────────────────────────────────

export async function dismissTrendPost(id: string): Promise<TrendResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("brand_trend_posts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: "No se pudo descartar el reel." };
  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

export async function restoreTrendPost(id: string): Promise<TrendResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("brand_trend_posts").update({ dismissed_at: null }).eq("id", id);
  if (error) return { ok: false, message: "No se pudo restaurar el reel." };
  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

// ── "Usar": un reel descubierto → una idea propia ────────────────────────

export type CreateTrendIdeaResult = TrendResult<{ id: string; title: string; reused: boolean }>;

/** Calco de createIdeaFromOutlier (lib/brand/competitors/actions.ts), sobre brand_trend_posts. */
export async function createIdeaFromTrendPost(postId: string): Promise<CreateTrendIdeaResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("brand_content_items")
    .select("id, title")
    .eq("source_trend_post_id", postId)
    .order("created_at", { ascending: true })
    .limit(1);
  const already = existing?.[0];
  if (already) return { ok: true, id: already.id, title: already.title, reused: true };

  const { data: post } = await supabase.from("brand_trend_posts").select("*").eq("id", postId).maybeSingle();
  if (!post) return { ok: false, message: "El reel no existe." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  // El multiplicador se recalcula sobre el batch actual: citar un número que no salió del código sería inventarlo.
  const { outliers } = await getTrendPostsWithInsightsFor(supabase);
  const outlier = outliers.find((candidate) => candidate.post.id === postId);
  if (!outlier) {
    return { ok: false, message: "Ese reel ya no está entre los descubiertos vigentes." };
  }

  let generated;
  try {
    generated = await generateIdeaFromOutlier({
      apiKey: keyResult.apiKey,
      username: post.username,
      displayName: post.display_name,
      kind: KIND_LABEL[post.kind],
      multiple: outlier.multiple,
      value: outlier.value,
      median: outlier.median,
      signalLabel: GROUP_SIGNAL_LABEL[outlier.group],
      publishedAt: post.published_at,
      caption: post.caption,
      permalink: post.permalink,
      ownContext: await buildOwnContext(),
    });
  } catch (genError) {
    console.error("No se pudo generar la idea desde un reel descubierto:", genError instanceof Error ? genError.message : genError);
    return { ok: false, message: "No se pudo generar la idea. Probá de nuevo." };
  }

  const { data: row, error } = await supabase
    .from("brand_content_items")
    .insert({
      owner_id: user.id,
      platform: PLATFORM,
      status: "IDEA",
      kind: generated.kind,
      title: generated.title,
      objective: generated.objective,
      hypothesis: generated.hypothesis,
      hook: generated.hook,
      angle: generated.angle,
      idea: generated.idea,
      caption: generated.caption || null,
      hashtags: normalizeHashtags(generated.hashtags),
      source_trend_post_id: postId,
      source_url: post.permalink,
    })
    .select("id, title")
    .single();

  if (error || !row) return { ok: false, message: "La idea se generó pero no se pudo guardar." };

  revalidatePath(PLANNER_PATH);
  revalidatePath(COMPETITORS_PATH);
  return { ok: true, id: row.id, title: row.title, reused: false };
}
