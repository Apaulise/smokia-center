// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito
// (CLAUDE.md §4). Este módulo no envía WhatsApp, mails ni ningún mensaje:
// sólo guarda lo que reporta Mr. Pou y devuelve las decisiones ya tomadas.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { asOps } from "@/lib/ops/db";
import { isMissingSchema, type ApprovalsQuery, type OpsIngestPayload } from "@/lib/ops/schema";

type Admin = SupabaseClient<Database>;

export type IngestResult =
  | { ok: true; id: string; externalId: string; type: OpsIngestPayload["type"]; unchanged: boolean }
  | { ok: false; status: number; error: string };

function fail(status: number, error: string): IngestResult {
  return { ok: false, status, error };
}

function schemaOrGeneric(error: { code?: string; message?: string } | null, action: string): IngestResult {
  if (isMissingSchema(error)) return fail(503, "Falta aplicar la migración de Operaciones.");
  console.error(`ops ${action}:`, error?.code);
  if (error?.code === "23514") return fail(400, "El registro no cumple las reglas de la tabla.");
  return fail(500, "No se pudo guardar el registro.");
}

async function leadBelongsToOwner(admin: Admin, ownerId: string, leadId: string): Promise<IngestResult | null> {
  const { data, error } = await admin.from("leads").select("id").eq("id", leadId).eq("owner_id", ownerId).maybeSingle();
  if (error) {
    console.error("ops approval: no se pudo verificar el lead", error.code);
    return fail(500, "No se pudo verificar el lead.");
  }
  if (!data) return fail(400, "Ese lead no pertenece a este owner.");
  return null;
}

export async function ingestOps(admin: Admin, ownerId: string, payload: OpsIngestPayload): Promise<IngestResult> {
  if (payload.type === "approval" && payload.leadId) {
    const denied = await leadBelongsToOwner(admin, ownerId, payload.leadId);
    if (denied) return denied;
  }

  const ops = asOps(admin);
  const occurredAt = "occurredAt" in payload && payload.occurredAt ? payload.occurredAt : new Date().toISOString();

  if (payload.type === "status") {
    const { data, error } = await ops
      .from("ops_status")
      .upsert(
        {
          owner_id: ownerId,
          external_id: payload.externalId,
          area: payload.area,
          agent: payload.agent,
          title: payload.title,
          detail: payload.detail,
          estado: payload.estado,
          needs_ok: payload.needsOk,
          occurred_at: occurredAt,
        },
        { onConflict: "owner_id,external_id" },
      )
      .select("id")
      .single();
    if (error || !data) return schemaOrGeneric(error, "status");
    return { ok: true, id: data.id, externalId: payload.externalId, type: "status", unchanged: false };
  }

  if (payload.type === "improvement") {
    const { data, error } = await ops
      .from("ops_improvements")
      .upsert(
        {
          owner_id: ownerId,
          external_id: payload.externalId,
          area: payload.area,
          title: payload.title,
          body: payload.body,
          impact: payload.impact,
          impact_score: payload.impactScore,
          status: payload.status,
          week_label: payload.weekLabel,
        },
        { onConflict: "owner_id,external_id" },
      )
      .select("id")
      .single();
    if (error || !data) return schemaOrGeneric(error, "improvement");
    return { ok: true, id: data.id, externalId: payload.externalId, type: "improvement", unchanged: false };
  }

  return saveApproval(ops, ownerId, payload, occurredAt);
}

async function saveApproval(
  ops: ReturnType<typeof asOps>,
  ownerId: string,
  payload: Extract<OpsIngestPayload, { type: "approval" }>,
  occurredAt: string,
): Promise<IngestResult> {
  const fields = {
    lead_id: payload.leadId,
    lead_name: payload.leadName,
    channel: payload.channel,
    draft_body: payload.draftBody,
    reason: payload.reason,
    agent: payload.agent,
    occurred_at: occurredAt,
  };

  const { data: existing, error: readError } = await ops
    .from("ops_approvals")
    .select("id, decision")
    .eq("owner_id", ownerId)
    .eq("external_id", payload.externalId)
    .maybeSingle();
  if (readError) return schemaOrGeneric(readError, "approval");

  if (existing && existing.decision !== "pending") {
    return { ok: true, id: existing.id, externalId: payload.externalId, type: "approval", unchanged: true };
  }

  if (existing) {
    const { error } = await ops.from("ops_approvals").update(fields).eq("id", existing.id).eq("owner_id", ownerId);
    if (error) return schemaOrGeneric(error, "approval");
    return { ok: true, id: existing.id, externalId: payload.externalId, type: "approval", unchanged: false };
  }

  const { data, error } = await ops
    .from("ops_approvals")
    .insert({
      ...fields,
      owner_id: ownerId,
      external_id: payload.externalId,
      decision: "pending",
      history: [] as Json,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await ops
      .from("ops_approvals")
      .select("id, decision")
      .eq("owner_id", ownerId)
      .eq("external_id", payload.externalId)
      .maybeSingle();
    if (!raced) return schemaOrGeneric(error, "approval");
    if (raced.decision !== "pending") {
      return { ok: true, id: raced.id, externalId: payload.externalId, type: "approval", unchanged: true };
    }
    const { error: updateError } = await ops.from("ops_approvals").update(fields).eq("id", raced.id).eq("owner_id", ownerId);
    if (updateError) return schemaOrGeneric(updateError, "approval");
    return { ok: true, id: raced.id, externalId: payload.externalId, type: "approval", unchanged: false };
  }

  if (error || !data) return schemaOrGeneric(error, "approval");
  return { ok: true, id: data.id, externalId: payload.externalId, type: "approval", unchanged: false };
}

export interface ApiApproval {
  id: string;
  externalId: string;
  leadId: string | null;
  leadName: string;
  channel: string;
  agent: string;
  reason: string;
  draftBody: string;
  finalBody: string | null;
  decision: string;
  decidedAt: string | null;
  occurredAt: string;
}

/** Lo ya decidido, para que el orquestador lo lea. Esta función no envía nada. */
export async function listOpsApprovals(admin: Admin, ownerId: string, query: ApprovalsQuery): Promise<
  { ok: true; approvals: ApiApproval[] } | { ok: false; status: number; error: string }
> {
  let request = asOps(admin)
    .from("ops_approvals")
    .select("id, external_id, lead_id, lead_name, channel, agent, reason, draft_body, final_body, decision, decided_at, occurred_at")
    .eq("owner_id", ownerId)
    .eq("decision", query.decision)
    .order("decided_at", { ascending: true, nullsFirst: false })
    .limit(query.limit);

  if (query.since) request = request.gte("decided_at", query.since);

  const { data, error } = await request;
  if (error) {
    if (isMissingSchema(error)) return { ok: false, status: 503, error: "Falta aplicar la migración de Operaciones." };
    console.error("ops approvals: no se pudo listar", error.code);
    return { ok: false, status: 500, error: "No se pudo leer la cola." };
  }

  return {
    ok: true,
    approvals: (data ?? []).map((row) => ({
      id: row.id,
      externalId: row.external_id,
      leadId: row.lead_id,
      leadName: row.lead_name,
      channel: row.channel,
      agent: row.agent,
      reason: row.reason,
      draftBody: row.draft_body,
      finalBody: row.final_body,
      decision: row.decision,
      decidedAt: row.decided_at,
      occurredAt: row.occurred_at,
    })),
  };
}
