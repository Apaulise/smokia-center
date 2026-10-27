// HTTP del rol admin. La autorización y el cliente service role viven acá para
// que las rutas sólo traduzcan el request. La aislación por owner está en
// lib/automation/admin.ts.

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { adminAgentsFromEnv, decideWriteAgent } from "@/lib/automation/agents";
import type { AdminResult } from "@/lib/automation/admin";
import { agentFromBody } from "@/lib/automation/admin-schema";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export function authorizeAdmin(request: NextRequest, bodyAgent?: string | null) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const agent = decideWriteAgent({
    bodyAgent,
    headerAgent: request.headers.get("x-agent"),
    allowed: adminAgentsFromEnv(process.env),
    deniedMessage: "Este agente no tiene acceso de administrador.",
  });
  if (!agent.ok) return { ok: false as const, response: automationError(agent.status, agent.error) };
  return { ok: true as const, ownerId: auth.ownerId, agent: agent.agent };
}

export function openAdminClient() {
  try {
    return { ok: true as const, admin: createAdminClient() };
  } catch {
    return { ok: false as const, response: automationError(500, "El servidor no puede escribir en la base.") };
  }
}

export function beginAdmin(request: NextRequest, json: unknown, requireBody: boolean) {
  if (requireBody && (json == null || typeof json !== "object" || Array.isArray(json))) {
    return { ok: false as const, response: automationError(400, "Body inválido.") };
  }
  const agentField = agentFromBody(json);
  if (!agentField.ok) return { ok: false as const, response: automationError(400, agentField.error) };
  const auth = authorizeAdmin(request, agentField.agent);
  if (!auth.ok) return auth;
  const client = openAdminClient();
  if (!client.ok) return client;
  return { ok: true as const, ownerId: auth.ownerId, agent: auth.agent, admin: client.admin };
}

export function adminResponse(result: AdminResult) {
  if (!result.ok) {
    const body: Record<string, unknown> = { error: result.error };
    if (result.details !== undefined) body.details = result.details;
    if (result.id) body.id = result.id;
    return NextResponse.json(body, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export function revalidateCrm(body: Record<string, unknown>) {
  revalidatePath("/leads");
  revalidatePath("/leads/lista");
  revalidatePath("/leads/seguimiento");
  revalidatePath("/leads/objetivo");
  const leadId = leadIdOf(body);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

function leadIdOf(body: Record<string, unknown>): string | null {
  if (typeof body.leadId === "string") return body.leadId;
  const row = body.row;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.lead_id === "string") return record.lead_id;
  if (body.resource === "leads" && typeof record.id === "string") return record.id;
  return null;
}
