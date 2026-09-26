import Anthropic from "@anthropic-ai/sdk";

import type { BrandChatWireTurn } from "./chat-types";
import { createAnthropicClient } from "./client";
import { getContentOS } from "./content-os";
import { buildContentOSStateBlock, type GoalSnapshot } from "./prompts";
import { BRAND_CHAT_TOOLS, runBrandChatTool } from "./tools";
import { attributeFollowers } from "@/lib/brand/goals/attribution";
import { computeGoalProgress } from "@/lib/brand/goals/progress";
import { getCurrentGoal, getFollowerSnapshots } from "@/lib/brand/goals/queries";
import { computeBrandInsights } from "@/lib/brand/insights";
import { todayIso } from "@/lib/leads/calendar";
import { getKnowledgeCounts, getOpenExperiments } from "@/lib/brand/knowledge/queries";
import { getPublishedHypotheses } from "@/lib/brand/planner/queries";
import { getBrandPostsForAnalysis, getLatestBrandSyncJob } from "@/lib/brand/queries";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Tope de vueltas modelo↔herramienta por turno, para no dejar un loop corriendo sin límite (y sin gastar de más). */
const MAX_TOOL_ROUNDS = 8;
/** Cada cuánto como mínimo se escribe el texto parcial a la base mientras se streamea. */
const FLUSH_INTERVAL_MS = 400;

type JobStatus = Database["public"]["Enums"]["job_status"];

function toJson(turns: BrandChatWireTurn[]): Json {
  return turns as unknown as Json;
}

/**
 * Corre un turno completo del chat de generación (Plans/03 §3.6) y persiste
 * el resultado en brand_chat_messages a medida que llega — el cliente lo ve
 * crecer por Realtime, sin que esta función le devuelva nada directamente.
 *
 * Se llama desde un after() de la Server Action (lib/brand/actions.ts): el
 * request original ya respondió, así que acá no hay límite de streaming HTTP,
 * sólo el maxDuration de la página (ver app/(app)/marca/generar/page.tsx).
 */
export async function runBrandChatTurn(params: {
  threadId: string;
  platform: BrandPlatform;
  /** Dueño de las notas que las tools de memoria escriban (§3.12). */
  ownerId: string;
  apiKey: string;
  assistantMessageId: string;
}): Promise<void> {
  const supabase = await createClient();

  const { data: historyRows, error: historyError } = await supabase
    .from("brand_chat_messages")
    .select("content")
    .eq("thread_id", params.threadId)
    .neq("id", params.assistantMessageId)
    .order("created_at", { ascending: true });

  if (historyError) {
    await supabase
      .from("brand_chat_messages")
      .update({ status: "FALLIDO", error: "No se pudo leer el historial de la conversación." })
      .eq("id", params.assistantMessageId);
    return;
  }

  // El mensaje del usuario que disparó este turno ya está insertado (lo hizo
  // la Server Action antes de programar este after()), así que ya viene
  // incluido acá — no hace falta agregarlo de nuevo.
  const priorTurns = (historyRows ?? []).flatMap((row) => row.content as unknown as BrandChatWireTurn[]);
  const messages: Anthropic.MessageParam[] = priorTurns.map((turn) => ({ role: turn.role, content: turn.content }));

  const [posts, knowledgeCounts, openExperiments, hypotheses, currentGoal, snapshots, latestSyncJob] = await Promise.all([
    getBrandPostsForAnalysis(params.platform),
    getKnowledgeCounts(),
    getOpenExperiments(),
    getPublishedHypotheses(params.platform),
    getCurrentGoal(params.platform),
    getFollowerSnapshots(params.platform),
    getLatestBrandSyncJob(params.platform),
  ]);
  const lastSyncedAt = latestSyncJob?.status === "COMPLETADO" ? latestSyncJob.finished_at : null;
  const insights = computeBrandInsights(posts);
  // La meta y las sorpresas de seguidores (§3.13) van como dato del turno, calculadas acá:
  // el modelo las cita, no las recalcula.
  const now = new Date();
  const goal: GoalSnapshot = {
    progress: currentGoal
      ? computeGoalProgress({
          goal: {
            targetFollowers: currentGoal.target_followers,
            baselineFollowers: currentGoal.baseline_followers,
            baselineDate: currentGoal.baseline_date,
            deadline: currentGoal.deadline,
          },
          snapshots,
          today: todayIso(),
        })
      : null,
    surprises: attributeFollowers({
      posts: posts.map((post) => ({
        postId: post.postId,
        kind: post.kind,
        publishedAt: post.publishedAt,
        views: post.views,
        newFollowers: post.newFollowers,
      })),
      snapshots,
      now,
    }).surprises,
  };
  const system = getContentOS();
  // Estado variable (§3.10): no se cachea, así que no entra al `system` de
  // arriba — viaja como mensaje de sistema a mitad de conversación, después
  // del último turno del usuario, y se arma de nuevo en cada vuelta del loop
  // sin persistirse en `messages` (si se guardara, el próximo turno lo vería
  // desactualizado, y el objetivo es que sea la lectura del momento).
  const stateBlock = buildContentOSStateBlock(
    params.platform,
    insights,
    posts,
    { counts: knowledgeCounts, openExperiments },
    hypotheses,
    goal,
    lastSyncedAt,
  );

  const client = createAnthropicClient(params.apiKey);
  const tools = [...BRAND_CHAT_TOOLS, { type: "web_search_20260209", name: "web_search", max_uses: 5 } as const];

  const wireTurns: BrandChatWireTurn[] = [];

  async function persist(status: JobStatus, errorMessage: string | null, previewText?: string) {
    const turns = previewText !== undefined ? [...wireTurns, { role: "assistant" as const, content: previewText }] : wireTurns;
    await supabase
      .from("brand_chat_messages")
      .update({ content: toJson(turns), status, error: errorMessage })
      .eq("id", params.assistantMessageId);
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.messages.stream({
        model: "claude-opus-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools,
        messages: [...messages, { role: "system", content: stateBlock }],
      });

      let liveText = "";
      let lastFlush = 0;
      let flushing = false;

      stream.on("text", (delta) => {
        liveText += delta;
        const now = Date.now();
        if (flushing || now - lastFlush < FLUSH_INTERVAL_MS) return;
        lastFlush = now;
        flushing = true;
        void persist("EN_CURSO", null, liveText).finally(() => {
          flushing = false;
        });
      });

      const message = await stream.finalMessage();
      // El SOC son ~5.500 tokens cacheados (§3.10): si cache_read da 0 a
      // partir del segundo mensaje del hilo, algo variable se coló en el
      // prefijo y cada mensaje está costando diez veces más.
      console.log(
        `[brand-chat] cache_read=${message.usage.cache_read_input_tokens ?? 0} cache_write=${message.usage.cache_creation_input_tokens ?? 0} input=${message.usage.input_tokens}`,
      );
      wireTurns.push({ role: "assistant", content: message.content });
      messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "tool_use") {
        const toolUses = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          const result = await runBrandChatTool(toolUse.name, toolUse.input, { platform: params.platform, ownerId: params.ownerId });
          results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError });
        }
        wireTurns.push({ role: "user", content: results });
        messages.push({ role: "user", content: results });
        await persist("EN_CURSO", null);
        continue;
      }

      if (message.stop_reason === "pause_turn") {
        await persist("EN_CURSO", null);
        continue;
      }

      if (message.stop_reason === "refusal") {
        await persist("FALLIDO", "Claude no pudo responder por una política de seguridad.");
        return;
      }

      await persist("COMPLETADO", null);
      return;
    }

    await persist("COMPLETADO", "Se llegó al máximo de vueltas de herramientas — la respuesta puede estar incompleta.");
  } catch (error) {
    const message =
      error instanceof Anthropic.AuthenticationError
        ? "Anthropic rechazó la key configurada."
        : error instanceof Anthropic.APIError
          ? `Anthropic respondió ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Error inesperado generando la respuesta.";
    await persist("FALLIDO", message).catch(() => {});
  }
}
