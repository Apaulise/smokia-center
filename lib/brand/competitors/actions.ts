"use server";

import { revalidatePath } from "next/cache";

import { APIFY_TERMINAL_STATUSES, getAllApifyDatasetItems, getApifyRun, startApifyRun } from "@/lib/apify/client";
import { getGeminiApiKey } from "@/lib/brand/ai/key";
import { generateIdeaFromOutlier } from "@/lib/brand/ai/outlier-idea";
import { buildOwnContext } from "@/lib/brand/ai/script-context";
import { computeCompetitorInsights, GROUP_SIGNAL_LABEL } from "@/lib/brand/competitors/insights";
import { KIND_LABEL, normalizeHashtags } from "@/lib/brand/planner/schema";
import { mirrorThumbnails } from "@/lib/brand/thumbnails";
import { decrypt } from "@/lib/crypto";
import { APIFY_KEY_SETTING, GEMINI_KEY_SETTING } from "@/lib/settings/constants";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

import { mapCompetitorPost, pickProfilePicUrl, type NormalizedCompetitorPost } from "./mapper";
import { classifyRelevance, RELEVANCE_BATCH_MAX, type RelevanceCandidate } from "./relevance";
import {
  AddCompetitorInput,
  COMPETITOR_ACTOR_ID,
  MAX_COMPETITORS,
  RUN_IN_FLIGHT_MINUTES,
  RUN_TIMEOUT_MINUTES,
  UpdateResultsLimitInput,
} from "./schema";

// Sin service role ni webhook, a propósito (CLAUDE.md §4): cada actualización
// la dispara una persona y se reconcilia con SU sesión, así que RLS protege
// igual que en cualquier otra consulta. El webhook de Leads es el único lugar
// donde el aislamiento depende del código; acá no hace falta agregar otro.

const COMPETITORS_PATH = "/marca/competencia";
const PLANNER_PATH = "/marca/planificador";
const PLATFORM = "INSTAGRAM" as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type JobStatus = Database["public"]["Enums"]["job_status"];

export type CompetitorResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

async function getApifyToken(supabase: Supabase): Promise<CompetitorResult<{ token: string }>> {
  const { data: row } = await supabase.from("settings").select("value_encrypted").eq("key", APIFY_KEY_SETTING).maybeSingle();
  if (!row) return { ok: false, message: "Cargá tu API key de Apify en Configuración antes de traer publicaciones." };
  try {
    return { ok: true, token: decrypt(row.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key de Apify guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}

/**
 * Lanza la corrida de una cuenta. Antes de gastar, comprueba que no haya una
 * vigente: Apify cobra por resultado, y un doble clic o dos pestañas no
 * pueden pagar dos veces la misma cuenta.
 */
async function launchRun(
  supabase: Supabase,
  token: string,
  competitor: { id: string; username: string; results_limit: number; status: JobStatus; last_run_started_at: string | null },
): Promise<CompetitorResult> {
  if (competitor.status === "EN_CURSO" && competitor.last_run_started_at) {
    const ageMinutes = (Date.now() - new Date(competitor.last_run_started_at).getTime()) / 60_000;
    if (ageMinutes < RUN_IN_FLIGHT_MINUTES) {
      return { ok: false, message: `@${competitor.username} ya se está actualizando.` };
    }
  }

  const input = {
    directUrls: [`https://www.instagram.com/${competitor.username}/`],
    resultsType: "posts",
    resultsLimit: competitor.results_limit,
    // Probado contra corridas reales (§3.14): con `resultsType: "posts"` el
    // actor NO devuelve la foto de perfil en ninguna clave, ni siquiera con
    // addParentData en true — el item trae ownerId, ownerUsername y
    // ownerFullName y nada más del perfil. Queda en false, que es lo que era, y
    // el avatar cae a la inicial. Para tener la foto habría que sumar una
    // corrida `resultsType: "details"` por cuenta (1 resultado extra, centavos).
    addParentData: false,
  };

  try {
    // Sin webhookUrl: la reconciliación entra por la pantalla, ver el header.
    const run = await startApifyRun({ token, actorId: COMPETITOR_ACTOR_ID, input });
    await supabase
      .from("brand_competitors")
      .update({
        status: "EN_CURSO",
        apify_run_id: run.id,
        last_run_started_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", competitor.id);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    await supabase.from("brand_competitors").update({ status: "FALLIDO", last_error: message }).eq("id", competitor.id);
    return { ok: false, message: `Apify rechazó la corrida: ${message}` };
  }
}

/** Suma una cuenta a seguir y trae sus publicaciones. */
export async function addCompetitor(input: AddCompetitorInput): Promise<CompetitorResult<{ id: string }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsed = AddCompetitorInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Los datos no son válidos." };
  const { username, resultsLimit } = parsed.data;

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return keyResult;

  const { count } = await supabase.from("brand_competitors").select("id", { count: "exact", head: true }).eq("platform", PLATFORM);
  if ((count ?? 0) >= MAX_COMPETITORS) {
    return { ok: false, message: `Ya seguís ${MAX_COMPETITORS} cuentas, que es el tope: cada actualización cuesta plata. Sacá alguna antes de sumar otra.` };
  }

  const { data: row, error } = await supabase
    .from("brand_competitors")
    .insert({ owner_id: user.id, platform: PLATFORM, username, results_limit: resultsLimit })
    .select("id, username, results_limit, status, last_run_started_at")
    .single();

  if (error) {
    // 23505 = unique_violation sobre (owner_id, platform, username)
    return { ok: false, message: error.code === "23505" ? `Ya seguís a @${username}.` : "No se pudo guardar la cuenta." };
  }

  const launched = await launchRun(supabase, keyResult.token, row);
  revalidatePath(COMPETITORS_PATH);
  // La cuenta queda guardada aunque la corrida no arranque: se reintenta con "Actualizar".
  if (!launched.ok) return { ok: false, message: `Se guardó @${username}, pero ${launched.message}` };
  return { ok: true, id: row.id };
}

/** Vuelve a traer las publicaciones de una cuenta. */
export async function refreshCompetitor(id: string): Promise<CompetitorResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: competitor } = await supabase
    .from("brand_competitors")
    .select("id, username, results_limit, status, last_run_started_at")
    .eq("id", id)
    .maybeSingle();
  if (!competitor) return { ok: false, message: "La cuenta no existe." };

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return keyResult;

  const result = await launchRun(supabase, keyResult.token, competitor);
  revalidatePath(COMPETITORS_PATH);
  return result;
}

/** Actualiza todas las cuentas seguidas. Salta las que ya tienen una corrida vigente. */
export async function refreshAllCompetitors(): Promise<CompetitorResult<{ started: number; skipped: number }>> {
  await requireUser();
  const supabase = await createClient();

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return keyResult;

  const { data: competitors } = await supabase
    .from("brand_competitors")
    .select("id, username, results_limit, status, last_run_started_at")
    .eq("platform", PLATFORM);

  let started = 0;
  let skipped = 0;
  let firstError: string | null = null;
  // En serie y no en paralelo: son pocas cuentas y así un error de la key corta a la primera en vez de
  // fallar N veces.
  for (const competitor of competitors ?? []) {
    const result = await launchRun(supabase, keyResult.token, competitor);
    if (result.ok) started += 1;
    else if (competitor.status === "EN_CURSO") skipped += 1;
    else {
      firstError = result.message;
      break;
    }
  }

  revalidatePath(COMPETITORS_PATH);
  if (firstError) return { ok: false, message: firstError };
  return { ok: true, started, skipped };
}

/** Deja de seguir una cuenta y borra sus publicaciones (el FK las arrastra). */
export async function deleteCompetitor(id: string): Promise<CompetitorResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("brand_competitors").delete().eq("id", id);
  if (error) return { ok: false, message: "No se pudo eliminar la cuenta." };
  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

export type ReconcileCompetitorResult = { status: JobStatus | "NOT_FOUND"; imported: number };

/**
 * La reconciliación de una cuenta: pregunta a Apify por la corrida y, si
 * terminó, pagina el dataset e importa. Es idempotente — dos pestañas, un
 * sondeo que se pisa con otro, o reabrir la pantalla no duplican nada porque
 * el import es un upsert por (owner_id, competitor_id, external_id).
 *
 * Se llama desde `CompetitorPoller` al abrir la pantalla y mientras haya una
 * corrida en curso.
 */
export async function reconcileCompetitor(id: string): Promise<ReconcileCompetitorResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: competitor } = await supabase.from("brand_competitors").select("*").eq("id", id).maybeSingle();
  if (!competitor) return { status: "NOT_FOUND", imported: 0 };

  // Ya cerrada, o nunca lanzada: nada para hacer. Es lo que hace segura la doble llamada.
  if (competitor.status !== "EN_CURSO" || !competitor.apify_run_id) return { status: competitor.status, imported: 0 };

  const fail = async (message: string, cost: number | null = null) => {
    await supabase
      .from("brand_competitors")
      .update({ status: "FALLIDO", last_error: message, ...(cost !== null ? { last_cost_usd: cost } : {}) })
      .eq("id", id);
    revalidatePath(COMPETITORS_PATH);
    return { status: "FALLIDO" as const, imported: 0 };
  };

  const keyResult = await getApifyToken(supabase);
  if (!keyResult.ok) return fail(keyResult.message);

  // El vencimiento vale para cualquier razón por la que no se llegue a un resultado (corrida colgada, o una
  // corrida que Apify ya no devuelve): sin él, el sondeo esperaría para siempre.
  const startedAt = competitor.last_run_started_at ? new Date(competitor.last_run_started_at).getTime() : Date.now();
  const overdue = (Date.now() - startedAt) / 60_000 > RUN_TIMEOUT_MINUTES;

  let run;
  try {
    run = await getApifyRun({ token: keyResult.token, runId: competitor.apify_run_id });
  } catch (error) {
    // Un fallo de red acá no es un fallo de la corrida: se reintenta en el próximo sondeo, hasta que venza.
    console.error("No se pudo consultar la corrida de un competidor:", error instanceof Error ? error.message : error);
    return overdue ? fail(`No se pudo consultar la corrida en ${RUN_TIMEOUT_MINUTES} minutos.`) : { status: "EN_CURSO", imported: 0 };
  }

  if (!APIFY_TERMINAL_STATUSES.has(run.status)) {
    return overdue ? fail(`La corrida no terminó en ${RUN_TIMEOUT_MINUTES} minutos.`, run.costUsd) : { status: "EN_CURSO", imported: 0 };
  }

  if (run.status !== "SUCCEEDED") return fail(`Apify terminó con estado ${run.status}.`, run.costUsd);

  let items: unknown[];
  try {
    items = await getAllApifyDatasetItems({ token: keyResult.token, datasetId: run.defaultDatasetId });
  } catch (error) {
    console.error("No se pudo leer el dataset de un competidor:", error instanceof Error ? error.message : error);
    return overdue ? fail("No se pudo leer el resultado de la corrida.", run.costUsd) : { status: "EN_CURSO", imported: 0 };
  }

  // Un Map por external_id: si el dataset repite una publicación, un upsert con filas repetidas en el mismo
  // statement rompe con "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const posts = new Map<string, NormalizedCompetitorPost>();
  let displayName: string | null = null;
  let profilePicUrl: string | null = null;
  for (const item of items) {
    const post = mapCompetitorPost(item);
    if (!post) continue;
    posts.set(post.externalId, post);
    const owner = (item as Record<string, unknown>).ownerFullName;
    if (!displayName && typeof owner === "string" && owner.trim()) displayName = owner.trim();
    if (!profilePicUrl) profilePicUrl = pickProfilePicUrl(item);
  }

  if (posts.size === 0) {
    // Una corrida exitosa sin publicaciones no es un éxito para el usuario: cuenta privada, usuario mal escrito o inexistente.
    return fail("Apify no devolvió publicaciones. Revisá que el usuario esté bien escrito y que la cuenta sea pública.", run.costUsd);
  }

  const thumbnails = await mirrorThumbnails(supabase, user.id, "competitors", [...posts.values()]);

  const { error } = await supabase.from("brand_competitor_posts").upsert(
    [...posts.values()].map((post) => ({
      owner_id: user.id,
      competitor_id: id,
      external_id: post.externalId,
      kind: post.kind,
      permalink: post.permalink,
      caption: post.caption,
      thumbnail_url: thumbnails.get(post.externalId) ?? null,
      published_at: post.publishedAt,
      likes: post.likes,
      comments: post.comments,
      views: post.views,
      is_pinned: post.isPinned,
      raw: post.raw as Json,
    })),
    { onConflict: "owner_id,competitor_id,external_id" },
  );
  if (error) return fail(`No se pudo importar: ${error.message}`, run.costUsd);

  await supabase
    .from("brand_competitors")
    .update({
      status: "COMPLETADO",
      last_error: null,
      last_cost_usd: run.costUsd,
      last_synced_at: new Date().toISOString(),
      ...(displayName ? { display_name: displayName } : {}),
      ...(profilePicUrl ? { profile_pic_url: profilePicUrl } : {}),
    })
    .eq("id", id);

  // Clasificar lo recién importado es gratis (free tier) y deja la pantalla
  // lista al abrirla. Si falla, no toca el resultado de la importación.
  await classifyPendingForCompetitor(supabase, id);

  revalidatePath(COMPETITORS_PATH);
  return { status: "COMPLETADO", imported: posts.size };
}

// ── Relevancia (Plans/03 §3.14) ──────────────────────────────────────────

async function getGeminiToken(supabase: Supabase): Promise<string | null> {
  const { data: row } = await supabase.from("settings").select("value_encrypted").eq("key", GEMINI_KEY_SETTING).maybeSingle();
  if (!row) return null;
  try {
    return decrypt(row.value_encrypted);
  } catch {
    return null;
  }
}

/**
 * Los candidatos a clasificar: outliers recientes, no descartados, todavía sin
 * puntaje. Se calculan igual que en la pantalla — la mediana sobre TODO lo
 * traído de la cuenta, la recencia sólo sobre el candidato — porque clasificar
 * lo que no se va a mostrar es gastar llamadas al pedo.
 */
async function collectRelevanceCandidates(supabase: Supabase, competitorIds: string[]): Promise<RelevanceCandidate[]> {
  if (competitorIds.length === 0) return [];

  const { data: competitors } = await supabase.from("brand_competitors").select("id, username").in("id", competitorIds);
  if (!competitors || competitors.length === 0) return [];

  const { data: rows } = await supabase
    .from("brand_competitor_posts")
    .select("id, competitor_id, kind, published_at, likes, comments, views, caption, relevance_checked_at, dismissed_at")
    .in("competitor_id", competitorIds);
  if (!rows) return [];

  const usernameById = new Map(competitors.map((competitor) => [competitor.id, competitor.username]));
  const byCompetitor = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCompetitor.get(row.competitor_id) ?? [];
    list.push(row);
    byCompetitor.set(row.competitor_id, list);
  }

  const candidates: RelevanceCandidate[] = [];
  for (const [competitorId, list] of byCompetitor) {
    const insights = computeCompetitorInsights(
      list.map((row) => ({
        id: row.id,
        kind: row.kind,
        publishedAt: row.published_at,
        likes: row.likes,
        comments: row.comments,
        views: row.views,
      })),
    );
    const source = new Map(list.map((row) => [row.id, row]));
    for (const outlier of insights.outliers) {
      if (!outlier.recent) continue;
      const row = source.get(outlier.post.id);
      if (!row || row.relevance_checked_at || row.dismissed_at) continue;
      candidates.push({
        id: row.id,
        username: usernameById.get(competitorId) ?? "cuenta",
        kind: row.kind,
        caption: row.caption,
        publishedAt: row.published_at,
        multiple: outlier.multiple,
      });
    }
  }
  return candidates;
}

/** Escribe el veredicto de cada pieza. Un update por fila: son pocas y cada una tiene SU motivo. */
async function writeVerdicts(supabase: Supabase, verdicts: { id: string; score: number; reason: string }[]): Promise<void> {
  const checkedAt = new Date().toISOString();
  for (const verdict of verdicts) {
    await supabase
      .from("brand_competitor_posts")
      .update({ relevance_score: verdict.score, relevance_reason: verdict.reason, relevance_checked_at: checkedAt })
      .eq("id", verdict.id);
  }
}

/** Clasifica lo pendiente de UNA cuenta, al terminar de importarla. Nunca rompe la importación. */
async function classifyPendingForCompetitor(supabase: Supabase, competitorId: string): Promise<void> {
  const apiKey = await getGeminiToken(supabase);
  if (!apiKey) return;
  const candidates = await collectRelevanceCandidates(supabase, [competitorId]);
  if (candidates.length === 0) return;
  await writeVerdicts(supabase, await classifyRelevance({ apiKey, candidates }));
}

/**
 * "Clasificar": pasa por todo lo pendiente de todas las cuentas. Existe porque
 * la key de Gemini se puede cargar DESPUÉS de haber importado, y porque lo que
 * se trajo antes de §3.14 nunca pasó por el clasificador.
 */
export async function classifyPendingOutliers(): Promise<CompetitorResult<{ classified: number; pending: number }>> {
  await requireUser();
  const supabase = await createClient();

  const apiKey = await getGeminiToken(supabase);
  if (!apiKey) {
    return { ok: false, message: "Cargá tu API key de Google AI Studio en Configuración para clasificar." };
  }

  const { data: competitors } = await supabase.from("brand_competitors").select("id").eq("platform", PLATFORM);
  const candidates = await collectRelevanceCandidates(supabase, (competitors ?? []).map((competitor) => competitor.id));
  if (candidates.length === 0) return { ok: true, classified: 0, pending: 0 };

  // En lotes y en serie: el free tier tiene límite por minuto y son pocas piezas.
  let classified = 0;
  for (let index = 0; index < candidates.length; index += RELEVANCE_BATCH_MAX) {
    const batch = candidates.slice(index, index + RELEVANCE_BATCH_MAX);
    const verdicts = await classifyRelevance({ apiKey, candidates: batch });
    // classifyRelevance ya logueó por qué devolvió nada: insistir con el resto sería repetir el error.
    if (verdicts.length === 0) break;
    await writeVerdicts(supabase, verdicts);
    classified += verdicts.length;
  }

  revalidatePath(COMPETITORS_PATH);
  if (classified === 0) return { ok: false, message: "Gemini no devolvió ninguna clasificación. Probá de nuevo en un rato." };
  return { ok: true, classified, pending: candidates.length - classified };
}

// ── Descartar un outlier ─────────────────────────────────────────────────

/**
 * La ✕ de la tarjeta. No borra la fila: la próxima corrida la volvería a traer
 * y el descarte se perdería.
 */
export async function dismissCompetitorPost(id: string): Promise<CompetitorResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("brand_competitor_posts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: "No se pudo descartar la publicación." };
  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

export async function restoreCompetitorPost(id: string): Promise<CompetitorResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("brand_competitor_posts").update({ dismissed_at: null }).eq("id", id);
  if (error) return { ok: false, message: "No se pudo restaurar la publicación." };
  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

// ── Cuántas publicaciones trae la próxima corrida ────────────────────────

/**
 * Cambia el tope de la cuenta. No relanza nada: aplica a la PRÓXIMA
 * actualización, porque relanzar acá sería cobrar sin que nadie lo pida.
 */
export async function updateCompetitorResultsLimit(input: UpdateResultsLimitInput): Promise<CompetitorResult> {
  await requireUser();
  const supabase = await createClient();

  const parsed = UpdateResultsLimitInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Los datos no son válidos." };

  const { error } = await supabase
    .from("brand_competitors")
    .update({ results_limit: parsed.data.resultsLimit })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, message: "No se pudo guardar el cambio." };

  revalidatePath(COMPETITORS_PATH);
  return { ok: true };
}

// ── "Usar": un outlier ajeno → una idea propia (Plans/03 §3.14) ──────────

export type CreateIdeaResult = CompetitorResult<{ id: string; title: string; reused: boolean }>;

/**
 * Genera una pieza a partir de una publicación ajena y la deja en la bandeja
 * "Sin fecha" del planificador, con el reel de origen referenciado.
 *
 * Si ya hay una pieza hecha desde ese mismo outlier, devuelve esa en vez de
 * generar otra: el botón ya muestra "Ver la idea", pero dos pestañas no pueden
 * pagar dos veces lo mismo.
 */
export async function createIdeaFromOutlier(postId: string): Promise<CreateIdeaResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("brand_content_items")
    .select("id, title")
    .eq("source_competitor_post_id", postId)
    .order("created_at", { ascending: true })
    .limit(1);
  const already = existing?.[0];
  if (already) return { ok: true, id: already.id, title: already.title, reused: true };

  const { data: post } = await supabase.from("brand_competitor_posts").select("*").eq("id", postId).maybeSingle();
  if (!post) return { ok: false, message: "La publicación no existe." };

  const { data: competitor } = await supabase
    .from("brand_competitors")
    .select("id, username, display_name")
    .eq("id", post.competitor_id)
    .maybeSingle();
  if (!competitor) return { ok: false, message: "La cuenta de esa publicación ya no está." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  // El múltiplo y la mediana se recalculan sobre las publicaciones de esa cuenta:
  // el prompt cita el rendimiento, y citar un número que no salió del código sería inventarlo.
  const { data: siblings } = await supabase
    .from("brand_competitor_posts")
    .select("id, kind, published_at, likes, comments, views")
    .eq("competitor_id", post.competitor_id);

  const insights = computeCompetitorInsights(
    (siblings ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      publishedAt: row.published_at,
      likes: row.likes,
      comments: row.comments,
      views: row.views,
    })),
  );
  const outlier = insights.outliers.find((candidate) => candidate.post.id === postId);
  if (!outlier) {
    return { ok: false, message: "Esa publicación ya no se separa de lo habitual de su cuenta." };
  }

  let generated;
  try {
    generated = await generateIdeaFromOutlier({
      apiKey: keyResult.apiKey,
      username: competitor.username,
      displayName: competitor.display_name,
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
  } catch (error) {
    console.error("No se pudo generar la idea:", error instanceof Error ? error.message : error);
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
      source_competitor_post_id: postId,
      // El permalink copiado: sobrevive a dejar de seguir la cuenta, que borra la fila de origen.
      source_url: post.permalink,
    })
    .select("id, title")
    .single();

  if (error || !row) return { ok: false, message: "La idea se generó pero no se pudo guardar." };

  revalidatePath(PLANNER_PATH);
  revalidatePath(COMPETITORS_PATH);
  return { ok: true, id: row.id, title: row.title, reused: false };
}
