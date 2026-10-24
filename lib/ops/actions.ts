"use server";

// La cola sólo cambia el estado del registro. No arma links de WhatsApp,
// no manda mails y no llama a ningún servicio externo.

import { revalidatePath } from "next/cache";

import type { Json } from "@/lib/supabase/database.types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { z } from "zod";

import { asOps } from "./db";
import { isMissingSchema, parseHistory, resolveApprovalDecision } from "./schema";
import type { DecisionEvent } from "./schema";

export type OpsActionState = { ok: true } | { ok: false; message: string };

const decideSchema = z.object({
  id: z.uuid(),
  action: z.enum(["approve", "skip", "reopen"]),
  finalBody: z.string().max(4000).optional(),
});

function refreshOps() {
  revalidatePath("/operaciones");
  revalidatePath("/operaciones/aprobaciones");
  revalidatePath("/operaciones/areas");
  revalidatePath("/operaciones/auditor");
}

/**
 * Aprobar, saltar o volver a la cola. Deja la decisión y un evento en
 * `history`. No contacta al lead.
 */
export async function decideApproval(input: { id: string; action: "approve" | "skip" | "reopen"; finalBody?: string }): Promise<OpsActionState> {
  const user = await requireUser();
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "No se pudo registrar la decisión." };

  const supabase = asOps(await createClient());
  const { data: row, error } = await supabase
    .from("ops_approvals")
    .select("id, decision, draft_body, history")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { ok: false, message: "Falta aplicar la migración de Operaciones." };
    console.error("ops_approvals: no se pudo leer para decidir", error.code);
    return { ok: false, message: "No se pudo registrar la decisión." };
  }
  if (!row) return { ok: false, message: "Ese borrador no está en tu cola." };

  const now = new Date().toISOString();
  let decision: DecisionEvent["decision"];
  let finalBody: string | null = null;
  let decidedAt: string | null = now;
  let decidedBy: string | null = user.id;

  if (parsed.data.action === "approve") {
    const text = (parsed.data.finalBody ?? row.draft_body).trim();
    if (!text) return { ok: false, message: "El mensaje no puede quedar vacío." };
    decision = resolveApprovalDecision(row.draft_body, text);
    finalBody = text;
  } else if (parsed.data.action === "skip") {
    decision = "skipped";
  } else {
    decision = "pending";
    decidedAt = null;
    decidedBy = null;
  }

  const alreadyRecorded = row.decision === decision && decision !== "approved" && decision !== "edited";
  if (alreadyRecorded) return { ok: true };

  const history: DecisionEvent[] = [
    ...parseHistory(row.history),
    { decision, finalBody, at: now, by: user.id },
  ];

  const { error: updateError } = await supabase
    .from("ops_approvals")
    .update({
      decision,
      final_body: finalBody,
      decided_at: decidedAt,
      decided_by: decidedBy,
      history: history as unknown as Json,
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("ops_approvals: no se pudo guardar la decisión", updateError.code);
    return { ok: false, message: "No se pudo registrar la decisión." };
  }

  refreshOps();
  return { ok: true };
}
