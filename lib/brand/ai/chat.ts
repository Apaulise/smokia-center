import type { BrandChatWireTurn, WireBlock } from "./chat-types";
import { getContentOS } from "./content-os";
import { buildContentOSStateBlock, type GoalSnapshot } from "./prompts";
import { BRAND_CHAT_TOOLS, runBrandChatTool } from "./tools";
import { attributeFollowers } from "@/lib/brand/goals/attribution";
import { computeGoalProgress } from "@/lib/brand/goals/progress";
import { getCurrentGoal, getFollowerSnapshots } from "@/lib/brand/goals/queries";
import { computeBrandInsights } from "@/lib/brand/insights";
import { streamGeminiChat, type GeminiContent, type GeminiPart } from "@/lib/gemini/client";
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

/** Marca que Gemini 3 acepta para un functionCall que no viene de una vuelta suya (hilos de la época de Anthropic). */
const SKIP_SIGNATURE = "skip_thought_signature_validator";

/** Traduce el historial guardado (bloques text/tool_use/tool_result) a contents de Gemini. Los bloques de la época de Anthropic (thinking, server_tool_use…) se descartan. */
function toGeminiContents(turns: BrandChatWireTurn[]): GeminiContent[] {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  const nameById = new Map<string, string>();
  for (const turn of turns) {
    if (typeof turn.content === "string") continue;
    for (const b of turn.content as WireBlock[]) {
      if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
        callIds.add(b.id);
        nameById.set(b.id, b.name);
      }
      if (b.type === "tool_result" && typeof b.tool_use_id === "string") resultIds.add(b.tool_use_id);
    }
  }
  // Una llamada sin su resultado (o al revés) hace que Gemini rechace el pedido: sólo pasan las parejas completas.
  const paired = (id: string) => callIds.has(id) && resultIds.has(id);

  const out: GeminiContent[] = [];
  for (const turn of turns) {
    if (typeof turn.content === "string") {
      if (turn.content) out.push({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] });
      continue;
    }
    const blocks = turn.content as WireBlock[];
    const parts: GeminiPart[] = [];
    if (turn.role === "assistant") {
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string" && b.text) parts.push({ text: b.text });
        if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string" && paired(b.id)) {
          parts.push({
            functionCall: { name: b.name, args: (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown> },
            thoughtSignature: typeof b.signature === "string" ? b.signature : SKIP_SIGNATURE,
          });
        }
      }
      if (parts.length > 0) out.push({ role: "model", parts });
    } else {
      for (const b of blocks) {
        if (b.type === "tool_result" && typeof b.tool_use_id === "string" && paired(b.tool_use_id)) {
          const key = b.is_error ? "error" : "result";
          parts.push({ functionResponse: { name: nameById.get(b.tool_use_id) ?? "herramienta", response: { [key]: String(b.content) } } });
        }
      }
      if (parts.length > 0) out.push({ role: "user", parts });
    }
  }
  return out;
}

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
  const contents = toGeminiContents(priorTurns);

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

  const systemWithState = `${system}

${stateBlock}`;
  const tools = BRAND_CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.input_schema,
  }));

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
      let liveText = "";
      let lastFlush = 0;
      let flushing = false;

      const result = await streamGeminiChat({
        apiKey: params.apiKey,
        system: systemWithState,
        contents,
        tools,
        onText: (delta) => {
          liveText += delta;
          const now = Date.now();
          if (flushing || now - lastFlush < FLUSH_INTERVAL_MS) return;
          lastFlush = now;
          flushing = true;
          void persist("EN_CURSO", null, liveText).finally(() => {
            flushing = false;
          });
        },
      });

      const calls = result.toolCalls.map((call) => ({ ...call, id: `call_${crypto.randomUUID()}` }));
      const blocks: WireBlock[] = [];
      if (result.text) blocks.push({ type: "text", text: result.text });
      for (const call of calls) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args, signature: call.signature });
      if (blocks.length > 0) wireTurns.push({ role: "assistant", content: blocks });

      const modelParts: GeminiPart[] = [];
      if (result.text) modelParts.push({ text: result.text });
      for (const call of calls) {
        modelParts.push({ functionCall: { name: call.name, args: call.args }, thoughtSignature: call.signature ?? SKIP_SIGNATURE });
      }
      if (modelParts.length > 0) contents.push({ role: "model", parts: modelParts });

      if (calls.length > 0) {
        const results: WireBlock[] = [];
        const responseParts: GeminiPart[] = [];
        for (const call of calls) {
          const outcome = await runBrandChatTool(call.name, call.args, {
            platform: params.platform,
            ownerId: params.ownerId,
            geminiApiKey: params.apiKey,
          });
          results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.content, is_error: outcome.isError });
          responseParts.push({
            functionResponse: { name: call.name, response: { [outcome.isError ? "error" : "result"]: outcome.content } },
          });
        }
        wireTurns.push({ role: "user", content: results });
        contents.push({ role: "user", parts: responseParts });
        await persist("EN_CURSO", null);
        continue;
      }

      if (!result.text) {
        await persist("FALLIDO", "El modelo devolvió una respuesta vacía. Probá de nuevo.");
        return;
      }
      if (result.finishReason === "MAX_TOKENS") {
        await persist("COMPLETADO", "La respuesta se cortó por largo — pedile que continúe o que sea más breve.");
        return;
      }

      await persist("COMPLETADO", null);
      return;
    }

    await persist("COMPLETADO", "Se llegó al máximo de vueltas de herramientas — la respuesta puede estar incompleta.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado generando la respuesta.";
    await persist("FALLIDO", message).catch(() => {});
  }
}
