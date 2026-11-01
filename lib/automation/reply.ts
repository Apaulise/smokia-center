// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito.

import { z } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { findDuplicateMessage } from "@/lib/automation/dedupe";
import { resolveOccurredAt } from "@/lib/automation/occurred-at";
import { decrypt } from "@/lib/crypto";
import { analyzeLeadResponse } from "@/lib/leads/ai/analyze";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { rebuildLeadMemory } from "@/lib/leads/ai/memory";
import { computeNextBestAction } from "@/lib/leads/ai/next-action";
import { toLeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { AnalyzeOutputSchema, type AnalyzeOutput } from "@/lib/leads/ai/schemas";
import type { LeadsClient } from "@/lib/leads/contact";
import type { LeadNoteRow, LeadSignalRow } from "@/lib/leads/queries";
import { hasConfirmedPain, planSignalWrites, type SignalPatch } from "@/lib/leads/signals";
import { nextStage } from "@/lib/leads/stage-engine";
import type { LeadStatus } from "@/lib/leads/status";
import { interestLevelOf, responseTypeOf } from "@/lib/weekly/compute";
import { GROQ_KEY_SETTING, SALES_PROFILE_SETTING } from "@/lib/settings/constants";
import type { Json } from "@/lib/supabase/database.types";

const LIVE_MS = 48 * 60 * 60 * 1000;

export const replyBodySchema = z.object({
  agent: automationAgentIdSchema.optional(),
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("WHATSAPP"),
  content: z.string().trim().min(1).max(4000),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
  response_type: z.enum(["HUMANA", "AUTORESPUESTA"]).optional(),
  interest_level: z.number().int().min(0).max(10).optional(),
  wants_meeting: z.boolean().optional(),
  disqualify: z.boolean().optional(),
});

export type ReplyBody = z.infer<typeof replyBodySchema>;

export type ReplyResult =
  | {
      ok: true;
      duplicate: boolean;
      leadId: string;
      messageId: string;
      occurredAt: string;
      responseType: "HUMANA" | "AUTORESPUESTA" | null;
      interestLevel: number | null;
      previousStatus: LeadStatus;
      status: LeadStatus;
      analyzed: boolean;
    }
  | { ok: false; status: 404 | 422 | 500 | 502; message: string };

/** Clasificación que manda el agente, con la forma que ya lee la ficha y el panel. */
export function manualReplyAnalysis(input: {
  agent: string;
  responseType: "HUMANA" | "AUTORESPUESTA";
  interestLevel: number;
  wantsMeeting: boolean;
  disqualify: boolean;
}): AnalyzeOutput {
  return AnalyzeOutputSchema.parse({
    analysis: {
      response_type: input.responseType,
      what_happened: `La registró el agente ${input.agent}.`,
      learned: null,
      interest_level: input.interestLevel,
      wants_meeting: input.wantsMeeting,
      disqualify: input.disqualify,
      not_now: false,
      not_now_reason: null,
      not_now_opportunity: null,
      follow_up_date: null,
    },
    crm_update: { signals: [] },
    strategy: { reasoning: `Clasificación cargada por ${input.agent}, sin corrida del analizador.` },
    suggested_reply: { message: "", has_reply: false },
  });
}

/**
 * Registra lo que contestó el lead. Si el body trae `response_type`, no llama
 * al modelo. Si no lo trae, corre el mismo analizador que la ficha. Repetir
 * el mismo texto y la misma hora no inserta otra fila ni vuelve a mover el estado.
 */
export async function recordAutomationReply(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  agent: string,
  body: ReplyBody,
  now = new Date(),
): Promise<ReplyResult> {
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, name, phone, status, city, interest_level, next_action_at, industries(name)")
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (leadError) return { ok: false, status: 500, message: "No se pudo leer el lead." };
  if (!lead) return { ok: false, status: 404, message: "Lead no encontrado." };

  const occurred = resolveOccurredAt(body.occurred_at, now);
  if (!occurred.ok) return { ok: false, status: 422, message: occurred.message };

  let duplicate: Awaited<ReturnType<typeof findDuplicateMessage>>;
  try {
    duplicate = await findDuplicateMessage(admin, ownerId, leadId, "LEAD", body.channel, body.content, occurred.iso);
  } catch {
    return { ok: false, status: 500, message: "No se pudo revisar si la respuesta ya estaba." };
  }
  if (duplicate) {
    const responseType = responseTypeOf(duplicate.analysis);
    return {
      ok: true,
      duplicate: true,
      leadId,
      messageId: duplicate.id,
      occurredAt: duplicate.occurred_at,
      responseType,
      interestLevel: interestLevelOf(duplicate.analysis),
      previousStatus: lead.status,
      status: lead.status,
      analyzed: false,
    };
  }

  let analysis: AnalyzeOutput;
  let analyzed = false;
  let analyzerRun: AnalyzerRun | null = null;
  if (body.response_type) {
    analysis = manualReplyAnalysis({
      agent,
      responseType: body.response_type,
      interestLevel: body.interest_level ?? 0,
      wantsMeeting: body.wants_meeting ?? false,
      disqualify: body.disqualify ?? false,
    });
  } else {
    const ran = await runAnalyzer(admin, ownerId, lead, body.content);
    if (!ran.ok) return ran;
    analysis = ran.analysis;
    analyzed = true;
    analyzerRun = ran;
  }

  const { data: message, error: messageError } = await admin
    .from("lead_messages")
    .insert({
      owner_id: ownerId,
      lead_id: leadId,
      sender: "LEAD",
      channel: body.channel,
      content: body.content,
      analysis: { ...analysis, registered_by: agent } as unknown as Json,
      confirmed: true,
      confirmed_at: now.toISOString(),
      occurred_at: occurred.iso,
    })
    .select("id")
    .single();
  if (messageError || !message) return { ok: false, status: 500, message: "No se pudo registrar la respuesta." };

  if (analyzerRun) await persistAnalyzerSideEffects(admin, ownerId, leadId, analyzerRun);

  const pain = body.response_type ? await confirmedPain(admin, ownerId, leadId) : false;
  const newStatus = body.response_type
    ? nextStage(lead.status, {
        responseType: analysis.analysis.response_type,
        interestLevel: analysis.analysis.interest_level,
        painConfirmed: pain,
        wantsMeeting: analysis.analysis.wants_meeting,
        disqualify: analysis.analysis.disqualify,
        notNow: false,
      })
    : (analyzerRun?.status ?? lead.status);
  const live = now.getTime() - Date.parse(occurred.iso) < LIVE_MS;
  const leadUpdate: { status?: LeadStatus; interest_level?: number; next_action_at?: string | null } = {};
  if (newStatus !== lead.status) leadUpdate.status = newStatus;
  const interestWasSent = body.response_type ? body.interest_level != null : true;
  if (interestWasSent && (live || lead.interest_level == null)) {
    leadUpdate.interest_level = analysis.analysis.interest_level;
  }
  if (live) {
    leadUpdate.next_action_at = followUpInstant(analysis);
  }
  if (Object.keys(leadUpdate).length > 0) {
    const { error } = await admin.from("leads").update(leadUpdate).eq("id", leadId).eq("owner_id", ownerId);
    if (error) return { ok: false, status: 500, message: "La respuesta quedó guardada, pero no se pudo actualizar el lead." };
  }
  if (newStatus !== lead.status) {
    await admin.from("lead_activities").insert({
      owner_id: ownerId,
      lead_id: leadId,
      type: "CAMBIO_ESTADO",
      from_status: lead.status,
      to_status: newStatus,
      occurred_at: occurred.iso,
    });
  }

  return {
    ok: true,
    duplicate: false,
    leadId,
    messageId: message.id,
    occurredAt: occurred.iso,
    responseType: analysis.analysis.response_type,
    interestLevel: analysis.analysis.interest_level,
    previousStatus: lead.status,
    status: newStatus,
    analyzed,
  };
}

function followUpInstant(analysis: AnalyzeOutput): string | null {
  if (!analysis.analysis.not_now || !analysis.analysis.follow_up_date) return null;
  const date = new Date(analysis.analysis.follow_up_date);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function confirmedPain(admin: LeadsClient, ownerId: string, leadId: string): Promise<boolean> {
  const { data } = await admin.from("lead_signals").select("kind, status, title, evidence").eq("owner_id", ownerId).eq("lead_id", leadId);
  return hasConfirmedPain(data ?? []);
}

interface AnalyzerRun {
  ok: true;
  analysis: AnalyzeOutput;
  writes: ReturnType<typeof planSignalWrites>;
  memory: LeadMemory;
  nextAction: ReturnType<typeof computeNextBestAction>;
  status: LeadStatus;
}

async function runAnalyzer(
  admin: LeadsClient,
  ownerId: string,
  lead: {
    id: string;
    name: string;
    status: LeadStatus;
    city: string | null;
    interest_level: number | null;
    industries: { name: string } | { name: string }[] | null;
  },
  responseText: string,
): Promise<AnalyzerRun | { ok: false; status: 422 | 500 | 502; message: string }> {
  const apiKey = await readSetting(admin, ownerId, GROQ_KEY_SETTING);
  if (!apiKey) {
    return { ok: false, status: 422, message: "Falta cargar la API key de Groq en Configuración (o no se pudo leer)." };
  }

  const [salesProfile, intel, signals, notes, thread] = await Promise.all([
    readSetting(admin, ownerId, SALES_PROFILE_SETTING),
    admin.from("lead_intel").select("enrichment, memory").eq("owner_id", ownerId).eq("lead_id", lead.id).maybeSingle(),
    admin.from("lead_signals").select("*").eq("owner_id", ownerId).eq("lead_id", lead.id).order("created_at", { ascending: false }),
    admin
      .from("lead_activities")
      .select("content, occurred_at")
      .eq("owner_id", ownerId)
      .eq("lead_id", lead.id)
      .eq("type", "NOTA")
      .order("occurred_at", { ascending: true }),
    admin
      .from("lead_messages")
      .select("sender, confirmed, kind, channel, content")
      .eq("owner_id", ownerId)
      .eq("lead_id", lead.id)
      .order("occurred_at", { ascending: true }),
  ]);
  if (intel.error || signals.error || notes.error || thread.error) {
    return { ok: false, status: 500, message: "No se pudo armar el contexto del lead." };
  }

  const industry = Array.isArray(lead.industries) ? (lead.industries[0] ?? null) : lead.industries;
  const existingSignals = (signals.data ?? []) as LeadSignalRow[];
  const noteRows: LeadNoteRow[] = (notes.data ?? []).flatMap((row) =>
    row.content ? [{ content: row.content, occurred_at: row.occurred_at }] : [],
  );

  let analysis: AnalyzeOutput;
  try {
    analysis = await analyzeLeadResponse({
      apiKey,
      salesProfile: salesProfile ?? "",
      lead: toLeadContext({
        name: lead.name,
        status: lead.status,
        interest_level: lead.interest_level,
        city: lead.city,
        industries: industry,
      }),
      enrichment: (intel.data?.enrichment as EnrichmentResult | null) ?? null,
      memory: (intel.data?.memory as LeadMemory | null) ?? null,
      signals: existingSignals,
      notes: noteRows,
      conversation: thread.data ?? [],
      responseText,
    });
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "No se pudo analizar la respuesta." };
  }

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
  const updated = existingSignals.map((row) => {
    const write = writes.find((item) => item.action === "update" && item.id === row.id);
    return write ? { ...row, ...write } : row;
  });
  const painConfirmed = hasConfirmedPain(updated);
  const status = nextStage(lead.status, {
    responseType: analysis.analysis.response_type,
    interestLevel: analysis.analysis.interest_level,
    painConfirmed,
    wantsMeeting: analysis.analysis.wants_meeting,
    disqualify: analysis.analysis.disqualify,
    notNow: analysis.analysis.not_now,
  });

  return {
    ok: true,
    analysis,
    writes,
    memory: rebuildLeadMemory({
      current: (intel.data?.memory as LeadMemory | null) ?? null,
      enrichment: (intel.data?.enrichment as EnrichmentResult | null) ?? null,
      analysis,
      signals: updated,
    }),
    nextAction: computeNextBestAction({
      responseType: analysis.analysis.response_type,
      interestLevel: analysis.analysis.interest_level,
      painConfirmed,
      disqualify: analysis.analysis.disqualify,
      notNow: analysis.analysis.not_now,
    }),
    status,
  };
}

async function persistAnalyzerSideEffects(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  ran: AnalyzerRun,
): Promise<void> {
  for (const write of ran.writes) {
    if (write.action === "insert") {
      await admin.from("lead_signals").insert({
        owner_id: ownerId,
        lead_id: leadId,
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
      await admin
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
        .eq("id", write.id)
        .eq("owner_id", ownerId);
    }
  }
  await admin.from("lead_intel").upsert(
    {
      owner_id: ownerId,
      lead_id: leadId,
      memory: ran.memory as unknown as Json,
      next_best_action: ran.nextAction.action,
      next_best_action_reason: ran.nextAction.reason,
    },
    { onConflict: "lead_id" },
  );
}

async function readSetting(admin: LeadsClient, ownerId: string, key: string): Promise<string | null> {
  const { data } = await admin.from("settings").select("value_encrypted").eq("owner_id", ownerId).eq("key", key).maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.value_encrypted);
  } catch {
    return null;
  }
}
