"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { computeNextBestAction } from "@/lib/leads/ai/next-action";
import { editDistance } from "@/lib/leads/ai/style/diff";
import { messageAnalysisDetails, withReviewedResponseType, type ResponseType } from "@/lib/leads/message-analysis";
import { hasConfirmedPain } from "@/lib/leads/signals";
import { nextStage } from "@/lib/leads/stage-engine";
import { createClient, requireUser } from "@/lib/supabase/server";

export type MessageActionState =
  | { ok: true; message: string; nextActionReason?: string; latest?: boolean }
  | { ok: false; message: string };

const editMessageSchema = z.object({
  messageId: z.string().uuid(),
  content: z.string().trim().min(1, "El mensaje no puede quedar vacío.").max(4000, "El mensaje es demasiado largo."),
});

export async function updateLeadMessageContent(input: { messageId: string; content: string }): Promise<MessageActionState> {
  const user = await requireUser();
  const parsed = editMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data: row, error: readError } = await supabase
    .from("lead_messages")
    .select("id, lead_id, sender, generated_by, generated_content")
    .eq("id", parsed.data.messageId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError || !row) return { ok: false, message: "Mensaje no encontrado." };

  const styleUpdate = row.sender === "VENDEDOR" && row.generated_by === "IA" && row.generated_content
    ? { edit_distance: editDistance(row.generated_content, parsed.data.content) }
    : {};
  const { error } = await supabase
    .from("lead_messages")
    .update({ content: parsed.data.content, ...styleUpdate })
    .eq("id", row.id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, message: "No se pudo editar el mensaje." };

  revalidatePath(`/leads/${row.lead_id}`);
  return { ok: true, message: "Mensaje actualizado." };
}

const reviewSchema = z.object({
  messageId: z.string().uuid(),
  responseType: z.enum(["AUTORESPUESTA", "HUMANA"]),
});

/**
 * La revisión humana reemplaza el tipo efectivo usado por métricas y próxima
 * acción. Sólo recalcula el estado actual si éste es el último mensaje del
 * lead; una corrección histórica no debe pisar decisiones posteriores.
 */
export async function reviewLeadMessageResponseType(input: {
  messageId: string;
  responseType: ResponseType;
}): Promise<MessageActionState> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Clasificación inválida." };

  const supabase = await createClient();
  const { data: message, error: readError } = await supabase
    .from("lead_messages")
    .select("id, lead_id, sender, analysis")
    .eq("id", parsed.data.messageId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError || !message) return { ok: false, message: "Mensaje no encontrado." };
  if (message.sender !== "LEAD") return { ok: false, message: "Sólo se clasifican respuestas del lead." };

  const details = messageAnalysisDetails(message.analysis);
  if (!details) return { ok: false, message: "Este mensaje todavía no tiene un análisis válido." };

  const reviewedAnalysis = withReviewedResponseType(message.analysis, parsed.data.responseType, new Date().toISOString());
  if (!reviewedAnalysis) return { ok: false, message: "No se pudo revisar el análisis." };

  const { error: updateError } = await supabase
    .from("lead_messages")
    .update({ analysis: reviewedAnalysis })
    .eq("id", message.id)
    .eq("owner_id", user.id);
  if (updateError) return { ok: false, message: "No se pudo guardar la clasificación." };

  const [{ data: latest }, { data: lead }, { data: signals }] = await Promise.all([
    supabase.from("lead_messages").select("id").eq("lead_id", message.lead_id).eq("sender", "LEAD").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("leads").select("id, status").eq("id", message.lead_id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("lead_signals").select("kind, status, title, evidence").eq("lead_id", message.lead_id).eq("owner_id", user.id),
  ]);
  const isLatest = latest?.id === message.id;
  let nextActionReason: string | undefined;

  if (isLatest && lead) {
    const analysis = details.analysis.analysis;
    const painConfirmed = hasConfirmedPain(signals ?? []);
    const isHuman = parsed.data.responseType === "HUMANA";
    const effectiveInterest = isHuman ? analysis.interest_level : 0;
    const nextAction = computeNextBestAction({
      responseType: parsed.data.responseType,
      interestLevel: effectiveInterest,
      painConfirmed,
      disqualify: isHuman && analysis.disqualify,
      notNow: isHuman && analysis.not_now,
    });
    nextActionReason = nextAction.reason;

    let status = nextStage(lead.status, {
      responseType: parsed.data.responseType,
      interestLevel: effectiveInterest,
      painConfirmed,
      wantsMeeting: isHuman && analysis.wants_meeting,
      disqualify: isHuman && analysis.disqualify,
      notNow: isHuman && analysis.not_now,
    });
    // Si la respuesta recién analizada era la que llevó a RESPONDIO, una
    // corrección a autorespuesta puede volver de forma segura a ese estado.
    if (parsed.data.responseType === "AUTORESPUESTA" && lead.status === "RESPONDIO") status = "AUTORESPUESTA";

    await Promise.all([
      supabase.from("lead_intel").update({ next_best_action: nextAction.action, next_best_action_reason: nextAction.reason }).eq("lead_id", lead.id),
      supabase.from("leads").update({ status, interest_level: effectiveInterest }).eq("id", lead.id),
    ]);

    if (status !== lead.status) {
      await supabase.from("lead_activities").insert({
        owner_id: user.id,
        lead_id: lead.id,
        type: "CAMBIO_ESTADO",
        from_status: lead.status,
        to_status: status,
      });
    }
  }

  revalidatePath(`/leads/${message.lead_id}`);
  revalidatePath("/leads/lista");
  revalidatePath("/leads/seguimiento");
  return {
    ok: true,
    message: isLatest ? "Clasificación y próxima acción actualizadas." : "Clasificación histórica actualizada.",
    nextActionReason,
    latest: isLatest,
  };
}
