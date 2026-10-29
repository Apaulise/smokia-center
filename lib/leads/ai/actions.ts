"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { analyzeLeadResponse } from "@/lib/leads/ai/analyze";
import { isSalesAngle, type SalesAngle } from "@/lib/leads/ai/angles";
import { enrichLead, type EnrichmentInput, type EnrichmentResult } from "@/lib/leads/ai/enrich";
import { generateFollowup } from "@/lib/leads/ai/follow-up";
import { getGeminiApiKey, getGroqApiKey } from "@/lib/leads/ai/key";
import { rebuildLeadMemory } from "@/lib/leads/ai/memory";
import { computeNextBestAction, isReplyWorthyAction } from "@/lib/leads/ai/next-action";
import { generateOpening, type GeneratedOpening } from "@/lib/leads/ai/opening";
import { toLeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { generateNextReply } from "@/lib/leads/ai/reply";
import { rewriteMessage } from "@/lib/leads/ai/rewrite";
import { REWRITE_TONES, type RewriteTone } from "@/lib/leads/ai/rewrite-tones";
import { editDistance } from "@/lib/leads/ai/style/diff";
import { listStyleExamples } from "@/lib/leads/ai/style/examples";
import type { AnalyzeOutput } from "@/lib/leads/ai/schemas";
import {
  getLead,
  getLeadAngleCounts30d,
  getLeadIntel,
  listLeadActivities,
  listLeadMessages,
  listLeadNotes,
  listLeadSignals,
  type LeadSignalRow,
} from "@/lib/leads/queries";
import { hasConfirmedPain, planSignalWrites, type SignalPatch } from "@/lib/leads/signals";
import { openingHoursFromRaw } from "@/lib/leads/opening-hours";
import {
  EMAIL_MESSAGE_MAX_LENGTH,
  leadMessageLimit,
  leadMessageLimitError,
  type LeadMessageChannel,
} from "@/lib/leads/message-limits";
import { nextStage } from "@/lib/leads/stage-engine";
import { getSalesProfile } from "@/lib/settings/queries";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ActionState = { ok: boolean; message: string } | null;

/** Cinco leads por lote dejan margen para URL Context y la ejecución de 60 s de la página. */
const ENRICH_BATCH_MAX = 5;
/** Una llamada a Gemini por lead: 4,5 s entre llamadas respeta el límite mostrado de 15 RPM. */
const ENRICH_THROTTLE_MS = 4500;
/** Margen sobre ENRICH_BATCH_MAX para descartar los que ya estén enriquecidos sin traer la lista entera. */
const ENRICH_CANDIDATE_POOL = 500;

interface EnrichCandidate {
  id: string;
  name: string;
  status: string;
  city: string | null;
  address: string | null;
  website: string | null;
  instagram_url: string | null;
  source_url: string | null;
  raw: Json | null;
  industries: { name: string } | null;
}

function toLeadInput(lead: EnrichCandidate): EnrichmentInput {
  return {
    name: lead.name,
    industryName: lead.industries?.name ?? null,
    city: lead.city,
    address: lead.address,
    website: lead.website,
    instagramUrl: lead.instagram_url,
    sourceUrl: lead.source_url,
    openingHours: openingHoursFromRaw(lead.raw),
  };
}

/** Escribe lead_intel, el ángulo sugerido, el avance NUEVO→LISTO y las hipótesis de dolor de un enriquecimiento. */
async function persistEnrichment(ownerId: string, leadId: string, currentStatus: string, result: EnrichmentResult) {
  const supabase = await createClient();

  await supabase.from("lead_intel").upsert(
    {
      owner_id: ownerId,
      lead_id: leadId,
      enrichment: result as unknown as Json,
      enriched_at: new Date().toISOString(),
    },
    { onConflict: "lead_id" },
  );

  const update: { sales_angle?: EnrichmentResult["recommendedSalesAngle"]; status?: "LISTO" } = {};
  if (result.recommendedSalesAngle) update.sales_angle = result.recommendedSalesAngle;
  // Sólo avanza si sigue en NUEVO: si ya lo contactaron o avanzó por otro
  // lado, el enriquecimiento no le pisa el estado real (Plan §1.10).
  if (currentStatus === "NUEVO") update.status = "LISTO";
  if (Object.keys(update).length > 0) {
    await supabase.from("leads").update(update).eq("id", leadId);
  }

  // Cada possible_pain nace como hipótesis (SPA §5): el enriquecimiento nunca confirma un dolor.
  if (result.possiblePains.length > 0) {
    await supabase.from("lead_signals").insert(
      result.possiblePains.map((pain) => ({
        owner_id: ownerId,
        lead_id: leadId,
        kind: "DOLOR" as const,
        status: "HIPOTESIS" as const,
        title: pain.description.slice(0, 200),
        description: pain.description,
        business_impact: pain.businessImpact,
      })),
    );
  }
}

async function fetchEnrichCandidates(supabase: Awaited<ReturnType<typeof createClient>>, leadIds: string[]) {
  const { data } = await supabase
    .from("leads")
    .select("id, name, status, city, address, website, instagram_url, source_url, raw, industries(name)")
    .in("id", leadIds);
  return (data ?? []) as EnrichCandidate[];
}

const idSchema = z.string().uuid();

/** Botón "Enriquecer" de la ficha (§1.10): un lead, en el mismo request. */
export async function enrichOneLead(leadId: string): Promise<ActionState> {
  const user = await requireUser();
  if (!idSchema.safeParse(leadId).success) return { ok: false, message: "Lead inválido." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const supabase = await createClient();
  const [lead] = await fetchEnrichCandidates(supabase, [leadId]);
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  try {
    const result = await enrichLead({ apiKey: keyResult.apiKey, lead: toLeadInput(lead) });
    await persistEnrichment(user.id, lead.id, lead.status, result);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo enriquecer el lead." };
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Lead enriquecido." };
}

/** Lote en segundo plano con el throttle del free tier de Gemini — común a "Enriquecer lista" y "Enriquecer selección". */
function enrichCandidatesInBackground(ownerId: string, apiKey: string, candidates: EnrichCandidate[]) {
  after(async () => {
    for (const [index, lead] of candidates.entries()) {
      try {
        const result = await enrichLead({ apiKey, lead: toLeadInput(lead) });
        await persistEnrichment(ownerId, lead.id, lead.status, result);
      } catch (error) {
        // Un fallo puntual no frena el lote: el lead queda sin enriquecer y se puede reintentar.
        console.error(`No se pudo enriquecer el lead ${lead.id}:`, error instanceof Error ? error.message : error);
      }
      if (index < candidates.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, ENRICH_THROTTLE_MS));
      }
    }
  });
}

/**
 * Botón "Enriquecer lista" (§1.10): hasta ENRICH_BATCH_MAX leads sin
 * enriquecer, en segundo plano con after() — un lote entero, con el throttle
 * que exige el free tier, no entra en el tiempo de un request. Nunca
 * automático al importar: una lista de 500 leads quemaría la cuota del día en
 * el primer minuto.
 */
export async function enrichLeadListBatch(leadListId: string): Promise<ActionState> {
  const user = await requireUser();
  if (!idSchema.safeParse(leadListId).success) return { ok: false, message: "Lista inválida." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("leads")
    .select("id")
    .eq("lead_list_id", leadListId)
    .order("created_at", { ascending: true })
    .limit(ENRICH_CANDIDATE_POOL);
  const poolIds = (pool ?? []).map((row) => row.id);
  if (poolIds.length === 0) return { ok: false, message: "La lista no tiene leads." };

  const { data: enrichedRows } = await supabase
    .from("lead_intel")
    .select("lead_id")
    .in("lead_id", poolIds)
    .not("enrichment", "is", null);
  const enrichedSet = new Set((enrichedRows ?? []).map((row) => row.lead_id));
  const pendingIds = poolIds.filter((id) => !enrichedSet.has(id)).slice(0, ENRICH_BATCH_MAX);

  if (pendingIds.length === 0) {
    return { ok: true, message: "No hay leads sin enriquecer en esta lista." };
  }

  const pending = await fetchEnrichCandidates(supabase, pendingIds);
  enrichCandidatesInBackground(user.id, keyResult.apiKey, pending);

  return {
    ok: true,
    message: `Enriqueciendo ${pending.length} lead${pending.length === 1 ? "" : "s"} en segundo plano. Refrescá la pantalla en un rato para ver el avance.`,
  };
}

/**
 * "Enriquecer" sobre una selección puntual de filas (Design System §04,
 * barra de acciones masivas): mismo motor y mismo throttle que "Enriquecer
 * lista", pero acotado a los ids que la persona marcó en la tabla en vez de
 * resolver toda una lista. Tope de ENRICH_BATCH_MAX por la misma razón que
 * ahí — si hay más filas seleccionadas, se procesan las primeras cinco.
 */
export async function enrichSelectedLeads(leadIds: string[]): Promise<ActionState> {
  const user = await requireUser();
  const ids = leadIds.filter((id) => idSchema.safeParse(id).success).slice(0, ENRICH_BATCH_MAX);
  if (ids.length === 0) return { ok: false, message: "Ningún lead seleccionado es válido." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const supabase = await createClient();
  const { data: enrichedRows } = await supabase
    .from("lead_intel")
    .select("lead_id")
    .in("lead_id", ids)
    .not("enrichment", "is", null);
  const enrichedSet = new Set((enrichedRows ?? []).map((row) => row.lead_id));
  const pendingIds = ids.filter((id) => !enrichedSet.has(id));

  if (pendingIds.length === 0) {
    return { ok: true, message: "Los leads seleccionados ya estaban enriquecidos." };
  }

  const pending = await fetchEnrichCandidates(supabase, pendingIds);
  enrichCandidatesInBackground(user.id, keyResult.apiKey, pending);

  return {
    ok: true,
    message: `Enriqueciendo ${pending.length} lead${pending.length === 1 ? "" : "s"} en segundo plano. Refrescá la pantalla en un rato para ver el avance.`,
  };
}

// ── Generador de apertura (Plan §1.11) ──────────────────────────────────────

/** El bloque de estado del turno (§1.7) parte siempre del mismo recorte de la fila de `leads`. */

export type OpeningActionState = { ok: true; opening: GeneratedOpening } | { ok: false; message: string };

/** Botón "Generar apertura" de la ficha: no persiste nada, el borrador se edita en pantalla antes de confirmar (SPA §24). */
export async function generateLeadOpening(leadId: string): Promise<OpeningActionState> {
  await requireUser();
  if (!idSchema.safeParse(leadId).success) return { ok: false, message: "Lead inválido." };

  const keyResult = await getGroqApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const lead = await getLead(leadId);
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  const [salesProfile, intel, signals, notes, angleCounts, styleExamples] = await Promise.all([
    getSalesProfile(),
    getLeadIntel(leadId),
    listLeadSignals(leadId),
    listLeadNotes(leadId),
    getLeadAngleCounts30d(),
    listStyleExamples({ leadId, kind: "APERTURA" }),
  ]);

  try {
    const opening = await generateOpening({
      leadId,
      styleExamples,
      apiKey: keyResult.apiKey,
      salesProfile,
      lead: toLeadContext(lead),
      enrichment: (intel?.enrichment as EnrichmentResult | null) ?? null,
      memory: (intel?.memory as LeadMemory | null) ?? null,
      signals,
      notes,
      angleCounts,
    });
    return { ok: true, opening };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo generar la apertura." };
  }
}

/**
 * Las columnas del bucle de estilo (§1.20.1) para un insert en
 * `lead_messages`. Sin borrador no hay par que guardar: el mensaje se
 * registra igual, pero sin material de entrenamiento.
 */
function styleColumns(generatedContent: string | undefined, sent: string) {
  if (!generatedContent) return {};
  return { generated_content: generatedContent, edit_distance: editDistance(generatedContent, sent) };
}

const messageChannelSchema = z.enum(["WHATSAPP", "EMAIL", "INSTAGRAM"]);

const confirmOpeningSchema = z.object({
  leadId: z.string().uuid(),
  message: z.string().trim().min(1, "Escribí un mensaje antes de confirmarlo."),
  angle: z.string(),
  variant: z.number().int().min(1).max(9),
  channel: messageChannelSchema.default("WHATSAPP"),
  // El borrador de la IA sobre el que el humano escribió (§1.20.1). Sólo
  // llega cuando hubo edición manual: un rewrite de tono no es señal de estilo.
  generatedContent: z.string().trim().max(600).optional(),
}).superRefine((value, context) => {
  if (value.message.length <= leadMessageLimit(value.channel)) return;
  context.addIssue({
    code: "custom",
    path: ["message"],
    message: leadMessageLimitError(value.channel),
  });
});

/**
 * "Confirmar y marcar como enviado" (SPA §24): recién acá se persiste el
 * mensaje. El envío en sí sigue siendo manual (WhatsApp/Instagram/mail) —
 * esto sólo registra que ya se mandó y avanza el pipeline si correspondía.
 */
export async function confirmLeadOpening(input: {
  leadId: string;
  message: string;
  angle: SalesAngle;
  variant: number;
  channel?: LeadMessageChannel;
  generatedContent?: string;
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = confirmOpeningSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!isSalesAngle(parsed.data.angle)) return { ok: false, message: "Ángulo inválido." };

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("status").eq("id", parsed.data.leadId).maybeSingle();
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  const now = new Date().toISOString();
  const { error: messageError } = await supabase.from("lead_messages").insert({
    owner_id: user.id,
    lead_id: parsed.data.leadId,
    sender: "VENDEDOR",
    channel: parsed.data.channel,
    content: parsed.data.message,
    generated_by: "IA",
    angle: parsed.data.angle,
    variant: parsed.data.variant,
    kind: "APERTURA",
    ...styleColumns(parsed.data.generatedContent, parsed.data.message),
    confirmed: true,
    confirmed_at: now,
    occurred_at: now,
  });
  if (messageError) return { ok: false, message: "No se pudo registrar el mensaje." };

  // Sólo avanza desde NUEVO/LISTO: si ya estaba más adelante en el pipeline, no le pisa el estado real.
  const advances = lead.status === "NUEVO" || lead.status === "LISTO";
  const update: Database["public"]["Tables"]["leads"]["Update"] = { last_contacted_at: now };
  if (advances) update.status = "CONTACTADO";
  await supabase.from("leads").update(update).eq("id", parsed.data.leadId);

  if (advances) {
    await supabase.from("lead_activities").insert({
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      type: "CAMBIO_ESTADO",
      from_status: lead.status,
      to_status: "CONTACTADO",
    });
  }

  revalidatePath(`/leads/${parsed.data.leadId}`);
  revalidatePath("/leads/lista");
  return { ok: true, message: "Mensaje confirmado." };
}

// ── Analizador de respuestas (Plan §1.12) ───────────────────────────────────

export type AnalyzeActionState =
  | { ok: true; analysis: AnalyzeOutput; nextActionReason: string; messageId: string }
  | { ok: false; message: string };

const analyzeResponseSchema = z.object({
  leadId: z.string().uuid(),
  responseText: z.string().trim().min(1, "Pegá lo que contestó el prospecto.").max(4000),
  channel: z.enum(["WHATSAPP", "EMAIL", "INSTAGRAM"]).default("WHATSAPP"),
});

/**
 * "Pegá la respuesta del lead" + Analizar (SPA §23). Una sola Server Action
 * (Plan §1.12) escribe: el mensaje entrante con su análisis colgado, las
 * señales (§1.13), la memoria (§1.14), el estado vía CRMStateEngine (§1.8) y
 * la próxima acción (§1.14) — todo en la misma corrida.
 */
export async function analyzeLeadResponseAction(input: {
  leadId: string;
  responseText: string;
  channel?: "WHATSAPP" | "EMAIL" | "INSTAGRAM";
}): Promise<AnalyzeActionState> {
  const user = await requireUser();
  const parsed = analyzeResponseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const keyResult = await getGroqApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const lead = await getLead(parsed.data.leadId);
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  const [salesProfile, intel, existingSignals, notes, conversation] = await Promise.all([
    getSalesProfile(),
    getLeadIntel(parsed.data.leadId),
    listLeadSignals(parsed.data.leadId),
    listLeadNotes(parsed.data.leadId),
    listLeadMessages(parsed.data.leadId),
  ]);
  const enrichment = (intel?.enrichment as EnrichmentResult | null) ?? null;
  const memory = (intel?.memory as LeadMemory | null) ?? null;
  const leadContext = toLeadContext(lead);

  let analysis: AnalyzeOutput;
  try {
    analysis = await analyzeLeadResponse({
      apiKey: keyResult.apiKey,
      salesProfile,
      lead: leadContext,
      enrichment,
      memory,
      signals: existingSignals,
      notes,
      conversation,
      responseText: parsed.data.responseText,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo analizar la respuesta." };
  }

  const now = new Date().toISOString();

  // Señales: se resuelven en memoria antes de tocar la base (§1.13), porque
  // hacen falta para decidir la próxima acción antes de persistir el mensaje.
  const patches: SignalPatch[] = analysis.crm_update.signals.map((signal) => ({
    kind: signal.kind,
    status: signal.status,
    title: signal.title,
    description: signal.description,
    evidence: signal.evidence,
    businessImpact: signal.business_impact,
    triggerEvent: signal.trigger_event,
    timing: signal.timing,
    alreadySolved: signal.already_solved,
  }));
  const writes = planSignalWrites(existingSignals, patches);

  // La lista de señales resultante, en memoria — sin otro viaje a la base para lo que sigue.
  const updatedSignals: LeadSignalRow[] = existingSignals.map((row) => {
    const write = writes.find((w) => w.action === "update" && w.id === row.id);
    return write
      ? {
          ...row,
          status: write.status,
          title: write.title,
          description: write.description,
          evidence: write.evidence,
          business_impact: write.business_impact,
          trigger_event: write.trigger_event,
          timing: write.timing,
          already_solved: write.already_solved,
        }
      : row;
  });
  for (const write of writes) {
    if (write.action !== "insert") continue;
    updatedSignals.push({
      id: crypto.randomUUID(),
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      kind: write.kind,
      status: write.status,
      title: write.title,
      description: write.description,
      evidence: write.evidence,
      business_impact: write.business_impact,
      trigger_event: write.trigger_event,
      timing: write.timing,
      already_solved: write.already_solved,
      created_at: now,
      updated_at: now,
    });
  }

  // CRMStateEngine (§1.8): nunca retrocede, nunca decide un cierre.
  const painConfirmed = hasConfirmedPain(updatedSignals);
  const newStatus = nextStage(lead.status, {
    responseType: analysis.analysis.response_type,
    interestLevel: analysis.analysis.interest_level,
    painConfirmed,
    wantsMeeting: analysis.analysis.wants_meeting,
    disqualify: analysis.analysis.disqualify,
    notNow: analysis.analysis.not_now,
  });

  // Memoria reescrita y próxima acción (§1.14) — determinística, antes de
  // saber si hace falta completar la respuesta sugerida (ver abajo).
  const newMemory = rebuildLeadMemory({ current: memory, enrichment, analysis, signals: updatedSignals });
  const nextAction = computeNextBestAction({
    responseType: analysis.analysis.response_type,
    interestLevel: analysis.analysis.interest_level,
    painConfirmed,
    disqualify: analysis.analysis.disqualify,
    notNow: analysis.analysis.not_now,
  });

  // Respaldo (§1.12/§1.14): el prompt de analyzeLeadResponse (analyze.ts) sólo
  // le pide al modelo "proponé la próxima pregunta — una sola (SPA §9)" — no
  // conoce las instrucciones por acción de ACTION_INSTRUCTION (reply.ts), que
  // sólo recibe esta llamada de respaldo. Cuando next-best-action (recién
  // calculado acá, en TypeScript, después de la corrida) da EXPLAIN_SERVICE,
  // ASK_FOR_MEETING o CLOSE_LEAD, lo que trajo el análisis es casi siempre una
  // pregunta de descubrimiento más — coherente con SU prompt, pero la acción
  // equivocada para lo que de verdad corresponde ahora. Encontrado en un caso
  // real: interés 5/10 con dolor confirmado (condiciones de SPA §14
  // cumplidas), y el análisis sugirió seguir preguntando por la gestión de
  // turnos en vez de pedir la reunión. Por eso el respaldo no espera a que el
  // análisis venga vacío: corre siempre que la acción no sea ASK_QUESTION,
  // que es la única para la que el prompt de análisis sí está armado.
  const needsSpecializedReply = nextAction.action !== "ASK_QUESTION";
  if (
    isReplyWorthyAction(nextAction.action) &&
    (needsSpecializedReply || !analysis.suggested_reply.has_reply || !analysis.suggested_reply.message.trim())
  ) {
    try {
      const fallback = await generateNextReply({
        apiKey: keyResult.apiKey,
        salesProfile,
        lead: leadContext,
        enrichment,
        memory: newMemory,
        signals: updatedSignals,
        notes,
        nextAction,
        whatHappened: analysis.analysis.what_happened,
        conversation: [
          ...conversation,
          { sender: "LEAD", confirmed: true, kind: null, channel: parsed.data.channel, content: parsed.data.responseText },
        ],
      });
      analysis = { ...analysis, suggested_reply: { has_reply: true, message: fallback.message } };
    } catch {
      // Si también falla el respaldo, queda como vino del análisis — el humano escribe a mano.
    }
  }

  const supabase = await createClient();

  // 1. El mensaje entrante, con el análisis (ya con la respuesta sugerida completa) colgado de su propia fila.
  const { data: insertedMessage, error: messageError } = await supabase
    .from("lead_messages")
    .insert({
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      sender: "LEAD",
      channel: parsed.data.channel,
      content: parsed.data.responseText,
      analysis: analysis as unknown as Json,
      occurred_at: now,
    })
    .select("id")
    .single();
  if (messageError || !insertedMessage) return { ok: false, message: "No se pudo registrar el mensaje entrante." };

  // 2. Señales: insertar o actualizar según corresponda (§1.13), sin retroceder nunca de estado.
  for (const write of writes) {
    if (write.action === "insert") {
      await supabase.from("lead_signals").insert({
        owner_id: user.id,
        lead_id: parsed.data.leadId,
        kind: write.kind,
        status: write.status,
        title: write.title,
        description: write.description,
        evidence: write.evidence,
        business_impact: write.business_impact,
        trigger_event: write.trigger_event,
        timing: write.timing,
        already_solved: write.already_solved,
      });
    } else {
      await supabase
        .from("lead_signals")
        .update({
          status: write.status,
          title: write.title,
          description: write.description,
          evidence: write.evidence,
          business_impact: write.business_impact,
          trigger_event: write.trigger_event,
          timing: write.timing,
          already_solved: write.already_solved,
        })
        .eq("id", write.id);
    }
  }

  // 3/4/5. Memoria, próxima acción y estado — ya calculados arriba, sólo se persisten.
  await supabase.from("lead_intel").upsert(
    {
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      memory: newMemory as unknown as Json,
      next_best_action: nextAction.action,
      next_best_action_reason: nextAction.reason,
    },
    { onConflict: "lead_id" },
  );

  const leadUpdate: Database["public"]["Tables"]["leads"]["Update"] = {
    interest_level: analysis.analysis.interest_level,
    // Contestó: la fecha de seguimiento programada ya no aplica (si dijo "ahora no" con fecha, se pisa abajo).
    next_action_at: null,
  };
  if (newStatus !== lead.status) leadUpdate.status = newStatus;
  if (analysis.analysis.not_now && analysis.analysis.follow_up_date) {
    const followUpDate = new Date(analysis.analysis.follow_up_date);
    if (!Number.isNaN(followUpDate.getTime())) leadUpdate.next_action_at = followUpDate.toISOString();
  }
  await supabase.from("leads").update(leadUpdate).eq("id", parsed.data.leadId);

  // El timeline sigue siendo la fuente de verdad de la ficha (§1.12): sólo se anota si el estado se movió.
  if (newStatus !== lead.status) {
    await supabase.from("lead_activities").insert({
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      type: "CAMBIO_ESTADO",
      from_status: lead.status,
      to_status: newStatus,
    });
  }

  revalidatePath(`/leads/${parsed.data.leadId}`);
  revalidatePath("/leads/lista");
  return { ok: true, analysis, nextActionReason: nextAction.reason, messageId: insertedMessage.id };
}

// ── Reescrituras de tono y confirmación de envío (Plan §1.15) ───────────────

export type RewriteActionState = { ok: true; message: string } | { ok: false; message: string };

const rewriteSchema = z.object({
  message: z.string().trim().min(1).max(EMAIL_MESSAGE_MAX_LENGTH),
  tone: z.enum(REWRITE_TONES),
});

/** Botones "MÁS CORTO" / "MÁS INFORMAL" / "MÁS DIRECTO" (SPA §24): Groq, no persiste nada. */
export async function rewriteLeadMessage(message: string, tone: RewriteTone): Promise<RewriteActionState> {
  await requireUser();
  const parsed = rewriteSchema.safeParse({ message, tone });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const keyResult = await getGroqApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  try {
    const rewritten = await rewriteMessage({ apiKey: keyResult.apiKey, message: parsed.data.message, tone: parsed.data.tone });
    return { ok: true, message: rewritten };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo reescribir el mensaje." };
  }
}

/** Días de espera hasta el próximo seguimiento, según cuántos se mandaron sin respuesta (tras el 1.º y tras el 2.º). */
const FOLLOW_UP_WAIT_DAYS = [4, 7];

/**
 * Fecha del próximo seguimiento tras confirmar uno. Cuenta los seguimientos
 * enviados desde la última respuesta del prospecto, incluido el que se acaba
 * de registrar. Después del 3.º no queda nada programado: es el cierre.
 */
async function nextFollowUpDate(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string, nowIso: string): Promise<string | null> {
  const { data } = await supabase
    .from("lead_messages")
    .select("sender, kind, occurred_at")
    .eq("lead_id", leadId)
    .eq("confirmed", true)
    .order("occurred_at", { ascending: true });
  const thread = data ?? [];
  const lastLead = thread.map((m) => m.sender).lastIndexOf("LEAD");
  const sent = thread.slice(lastLead + 1).filter((m) => m.sender === "VENDEDOR" && m.kind === "SEGUIMIENTO").length;
  const wait = FOLLOW_UP_WAIT_DAYS[sent - 1];
  if (!wait) return null;
  return new Date(new Date(nowIso).getTime() + wait * 86_400_000).toISOString();
}

const confirmMessageSchema = z.object({
  leadId: z.string().uuid(),
  message: z.string().trim().min(1, "Escribí un mensaje antes de confirmarlo."),
  channel: messageChannelSchema.default("WHATSAPP"),
  generatedBy: z.enum(["IA", "HUMANO"]).default("IA"),
  kind: z.enum(["RESPUESTA", "SEGUIMIENTO"]).optional(),
  generatedContent: z.string().trim().max(600).optional(),
}).superRefine((value, context) => {
  if (value.message.length <= leadMessageLimit(value.channel)) return;
  context.addIssue({
    code: "custom",
    path: ["message"],
    message: leadMessageLimitError(value.channel),
  });
});

/**
 * Confirma como enviado un mensaje del vendedor que NO es la apertura — la
 * respuesta sugerida tras analizar (§1.12) o cualquier mensaje escrito a mano
 * desde la ficha. El estado del pipeline ya lo decidió el CRMStateEngine al
 * analizar; acá sólo se registra la conversación (SPA §24: no se marca como
 * enviado hasta confirmar).
 */
export async function confirmMessageSent(input: {
  leadId: string;
  message: string;
  channel?: LeadMessageChannel;
  generatedBy?: "IA" | "HUMANO";
  kind?: "RESPUESTA" | "SEGUIMIENTO";
  generatedContent?: string;
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = confirmMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id").eq("id", parsed.data.leadId).maybeSingle();
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  // El CHECK de la base sólo admite borrador en mensajes de la IA.
  const generatedContent = parsed.data.generatedBy === "IA" ? parsed.data.generatedContent : undefined;

  const now = new Date().toISOString();
  const { error } = await supabase.from("lead_messages").insert({
    owner_id: user.id,
    lead_id: parsed.data.leadId,
    sender: "VENDEDOR",
    channel: parsed.data.channel,
    content: parsed.data.message,
    generated_by: parsed.data.generatedBy,
    kind: parsed.data.kind ?? null,
    ...styleColumns(generatedContent, parsed.data.message),
    confirmed: true,
    confirmed_at: now,
    occurred_at: now,
  });
  if (error) return { ok: false, message: "No se pudo registrar el mensaje." };

  const leadUpdate: Database["public"]["Tables"]["leads"]["Update"] = { last_contacted_at: now };
  if (parsed.data.kind === "SEGUIMIENTO") {
    // Se pisa también una fecha vencida de antes: ese "retomar" ya se cumplió con este mensaje.
    leadUpdate.next_action_at = await nextFollowUpDate(supabase, parsed.data.leadId, now);
  }
  await supabase.from("leads").update(leadUpdate).eq("id", parsed.data.leadId);

  revalidatePath(`/leads/${parsed.data.leadId}`);
  revalidatePath("/leads/seguimiento");
  return { ok: true, message: "Mensaje confirmado." };
}

// ── Seguimiento futuro (Plan §1.16) ─────────────────────────────────────────

export type FollowUpActionState =
  | { ok: true; message: string | null; cannotGenerateReason: string | null }
  | { ok: false; message: string };

/** Botón "Generar seguimiento" de la ficha, para cualquier lead contactado y sin cerrar (SPA §17). Lee el hilo, las notas, la memoria y el enriquecimiento. No persiste nada. */
export async function generateLeadFollowup(leadId: string): Promise<FollowUpActionState> {
  await requireUser();
  if (!idSchema.safeParse(leadId).success) return { ok: false, message: "Lead inválido." };

  const keyResult = await getGroqApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const lead = await getLead(leadId);
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  const [salesProfile, intel, signals, notes, conversation, activities, styleExamples] = await Promise.all([
    getSalesProfile(),
    getLeadIntel(leadId),
    listLeadSignals(leadId),
    listLeadNotes(leadId),
    listLeadMessages(leadId),
    listLeadActivities(leadId),
    listStyleExamples({ leadId, kind: "SEGUIMIENTO" }),
  ]);

  // Contactos registrados a mano ("Registré un WhatsApp"): viven en `lead_activities`, no en `lead_messages`.
  const contacts = activities.filter((a) => ["WHATSAPP", "EMAIL", "LLAMADA", "REUNION"].includes(a.type));
  const lastMessage = conversation.filter((m) => m.sender === "LEAD" || m.confirmed).at(-1);
  const lastTouchAt = [lastMessage?.occurred_at, contacts[0]?.occurred_at, lead.last_contacted_at]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const daysSinceLastMessage = lastTouchAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastTouchAt).getTime()) / (24 * 60 * 60 * 1000)))
    : null;

  try {
    const followUp = await generateFollowup({
      apiKey: keyResult.apiKey,
      leadId,
      salesProfile,
      lead: toLeadContext(lead),
      enrichment: (intel?.enrichment as EnrichmentResult | null) ?? null,
      memory: (intel?.memory as LeadMemory | null) ?? null,
      signals,
      notes,
      conversation,
      contacts,
      daysSinceLastMessage,
      styleExamples,
    });
    return { ok: true, message: followUp.message, cannotGenerateReason: followUp.cannot_generate_reason };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo generar el seguimiento." };
  }
}
