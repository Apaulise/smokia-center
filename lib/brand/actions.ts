"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { runBrandChatTurn } from "@/lib/brand/ai/chat";
import type { BrandChatWireTurn } from "@/lib/brand/ai/chat-types";
import { generateBrandRecommendations } from "@/lib/brand/ai/recommendations";
import { computeBrandInsights, MIN_POSTS_FOR_ANALYSIS } from "@/lib/brand/insights";
import { getBrandPostsForAnalysis } from "@/lib/brand/queries";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { runBrandSync, type BrandSyncResult } from "@/lib/brand/sync";
import { decrypt } from "@/lib/crypto";
import { ANTHROPIC_KEY_SETTING } from "@/lib/settings/constants";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Dispara una sincronización para el usuario logueado (botón "Sincronizar ahora", §3.3). */
export async function syncBrandNow(platform: BrandPlatform): Promise<BrandSyncResult> {
  const user = await requireUser();
  const result = await runBrandSync(user.id, platform);
  revalidatePath("/marca");
  return result;
}

type ApiKeyResult = { ok: true; apiKey: string } | { ok: false; message: string };

/** Descifra la key de Anthropic guardada en Configuración. Usado por §3.5 y §3.6. */
async function getAnthropicApiKey(): Promise<ApiKeyResult> {
  const supabase = await createClient();
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", ANTHROPIC_KEY_SETTING)
    .maybeSingle();

  if (!settingsRow) {
    return { ok: false, message: "Falta cargar la API key de Anthropic en Configuración." };
  }

  try {
    return { ok: true, apiKey: decrypt(settingsRow.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}

export type GenerateAnalysisResult = { ok: true; count: number } | { ok: false; message: string };

/**
 * "Generar análisis" (§3.5): computa los patrones en TypeScript y recién ahí
 * llama al modelo — corre en sesión de usuario, sin service role, porque no
 * hay nada que saltear (RLS filtra igual que cualquier consulta propia).
 */
export async function generateBrandAnalysis(platform: BrandPlatform): Promise<GenerateAnalysisResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const keyResult = await getAnthropicApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };
  const apiKey = keyResult.apiKey;

  const posts = await getBrandPostsForAnalysis(platform);
  const insights = computeBrandInsights(posts);
  if (!insights) {
    return {
      ok: false,
      message: `Necesitás al menos ${MIN_POSTS_FOR_ANALYSIS} posts sincronizados con métricas para generar un análisis confiable.`,
    };
  }

  // Las NUEVAS de análisis anteriores son las que este análisis reemplaza (las
  // aplicadas y descartadas quedan de historial). Se anotan ahora, antes de
  // generar, para no borrar por error las que se van a insertar más abajo.
  const { data: previousNew } = await supabase
    .from("brand_recommendations")
    .select("id")
    .eq("platform", platform)
    .eq("status", "NUEVA");

  let analysis;
  try {
    analysis = await generateBrandRecommendations({ apiKey, platform, insights });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "Anthropic rechazó la key. Revisala en Configuración." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, message: `Anthropic respondió ${error.status}: ${error.message}` };
    }
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo generar el análisis." };
  }

  const { error } = await supabase.from("brand_recommendations").insert(
    analysis.recommendations.map((r) => ({
      owner_id: user.id,
      platform,
      kind: r.kind,
      objective: r.objective,
      title: r.title,
      body: r.body,
      evidence: r.evidence as Database["public"]["Tables"]["brand_recommendations"]["Insert"]["evidence"],
      period_from: insights.periodFrom,
      period_to: insights.periodTo,
    })),
  );

  if (error) return { ok: false, message: "El análisis se generó pero no se pudo guardar." };

  // SOC §29: la lectura del período (qué sabemos/sospechamos/no sabemos
  // todavía) es narrativa del análisis completo, no de una recomendación
  // puntual — se guarda aparte. Si falla, no vale la pena tirar abajo las
  // recomendaciones que sí se guardaron: se loguea y sigue.
  const { error: notesError } = await supabase.from("brand_analysis_notes").insert({
    owner_id: user.id,
    platform,
    knowns: analysis.knowns,
    hypotheses: analysis.hypotheses,
    unknowns: analysis.unknowns,
    period_from: insights.periodFrom,
    period_to: insights.periodTo,
  });
  if (notesError) console.error("brand_analysis_notes: no se pudo guardar la lectura del análisis", notesError.code);

  // Recién con el lote nuevo guardado se borra el viejo: si algo falla antes,
  // nadie se queda sin recomendaciones. El `.eq("status", "NUEVA")` repetido
  // protege a las que se marcaron como aplicadas mientras el modelo pensaba.
  const staleIds = (previousNew ?? []).map((row) => row.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("brand_recommendations")
      .delete()
      .in("id", staleIds)
      .eq("status", "NUEVA");
    if (deleteError) console.error("brand_recommendations: no se pudieron reemplazar las anteriores", deleteError.code);
  }

  revalidatePath("/marca/analisis");
  return { ok: true, count: analysis.recommendations.length };
}

export async function updateBrandRecommendationStatus(
  id: string,
  status: Database["public"]["Enums"]["brand_recommendation_status"],
) {
  const supabase = await createClient();
  await supabase.from("brand_recommendations").update({ status }).eq("id", id);
  revalidatePath("/marca/analisis");
}

function toWireTurnsJson(turns: BrandChatWireTurn[]): Json {
  return turns as unknown as Json;
}

export type SendChatMessageResult = { ok: true; threadId: string; assistantMessageId: string } | { ok: false; message: string };

/**
 * "Enviar" del chat de generación (§3.6). Inserta el mensaje del usuario y un
 * placeholder de la respuesta, y programa el turno con after(): el request
 * vuelve enseguida con los ids, y el cliente sigue la respuesta creciendo por
 * Realtime sobre brand_chat_messages — lib/brand/ai/chat.ts hace el streaming
 * y va escribiendo, ya fuera del ciclo de este request.
 */
export async function sendBrandChatMessage(params: {
  threadId: string | null;
  platform: BrandPlatform;
  text: string;
}): Promise<SendChatMessageResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const text = params.text.trim();
  if (!text) return { ok: false, message: "Escribí un mensaje." };

  const keyResult = await getAnthropicApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  let threadId = params.threadId;
  if (!threadId) {
    const { data: thread, error: threadError } = await supabase
      .from("brand_chat_threads")
      .insert({ owner_id: user.id, platform: params.platform, title: text.slice(0, 80) })
      .select("id")
      .single();
    if (threadError || !thread) return { ok: false, message: "No se pudo iniciar la conversación." };
    threadId = thread.id;
  }

  const userTurns: BrandChatWireTurn[] = [{ role: "user", content: text }];
  const { error: userError } = await supabase.from("brand_chat_messages").insert({
    owner_id: user.id,
    thread_id: threadId,
    role: "USUARIO",
    status: "COMPLETADO",
    content: toWireTurnsJson(userTurns),
  });
  if (userError) return { ok: false, message: "No se pudo guardar tu mensaje." };

  const { data: assistantRow, error: assistantError } = await supabase
    .from("brand_chat_messages")
    .insert({ owner_id: user.id, thread_id: threadId, role: "ASISTENTE", status: "EN_CURSO", content: [] })
    .select("id")
    .single();
  if (assistantError || !assistantRow) return { ok: false, message: "No se pudo iniciar la respuesta." };

  const runParams = {
    threadId,
    platform: params.platform,
    ownerId: user.id,
    apiKey: keyResult.apiKey,
    assistantMessageId: assistantRow.id,
  };
  after(() => runBrandChatTurn(runParams));

  return { ok: true, threadId, assistantMessageId: assistantRow.id };
}

export type SaveContentIdeaResult = { ok: true; id: string } | { ok: false; message: string };

/** "Guardar como idea" (§3.6): crea el brand_content_items que va a alimentar el planificador (§3.7). */
export async function saveBrandContentIdea(input: {
  threadId: string | null;
  platform: BrandPlatform;
  kind: Database["public"]["Enums"]["brand_post_kind"];
  title: string;
  idea?: string;
  caption?: string;
  hashtags?: string[];
}): Promise<SaveContentIdeaResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { ok: false, message: "Ponele un título a la idea." };

  const { data, error } = await supabase
    .from("brand_content_items")
    .insert({
      owner_id: user.id,
      platform: input.platform,
      kind: input.kind,
      title,
      idea: input.idea?.trim() || null,
      caption: input.caption?.trim() || null,
      hashtags: input.hashtags ?? [],
      source_thread_id: input.threadId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: "No se pudo guardar la idea." };
  return { ok: true, id: data.id };
}
