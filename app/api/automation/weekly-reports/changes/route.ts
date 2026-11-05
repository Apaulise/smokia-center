// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// PATCH /api/automation/weekly-reports/changes — escribe el resultado de un
// cambio aprobado, en prueba o medido. No cambia el status: sólo sugiere.
// No pisa un resultado escrito a mano (409 manual_result). No envía mensajes.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { decideWriteAgent } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { writeChangeResult, type WriteChangeResult } from "@/lib/automation/weekly";
import { createAdminClient } from "@/lib/supabase/admin";
import { canPublishWeekly, weeklyPublishAgents } from "@/lib/weekly/access";
import { camelizeWeekly, changeResultPayload } from "@/lib/weekly/schema";

export async function PATCH(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = changeResultPayload.safeParse(camelizeWeekly(json));
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const auth = authorizeAgent(request, parsed.data.agent);
  if (!auth.ok) return auth.response;
  if (!canPublishWeekly(auth.agent, parsed.data.area, process.env)) {
    return automationError(403, "Este agente no puede publicar el análisis de esa área.");
  }

  const admin = openAdmin();
  if (!admin.ok) return admin.response;

  const result = await writeChangeResult(admin.client, auth.ownerId, auth.agent, parsed.data);
  if (!result.ok) return changeError(result);
  if (!result.unchanged) revalidatePath("/operaciones/analisis");
  return NextResponse.json({
    id: result.id,
    area: result.area,
    week: result.week,
    key: result.key,
    unchanged: result.unchanged,
  });
}

function changeError(result: Extract<WriteChangeResult, { ok: false }>) {
  const body = result.code ? { error: result.error, code: result.code } : { error: result.error };
  return NextResponse.json(body, { status: result.status });
}

function authorizeAgent(request: NextRequest, bodyAgent: string | null | undefined) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const agent = decideWriteAgent({
    bodyAgent,
    headerAgent: request.headers.get("x-agent"),
    allowed: weeklyPublishAgents(process.env),
    deniedMessage: "Este agente no puede publicar el análisis semanal.",
  });
  if (!agent.ok) return { ok: false as const, response: automationError(agent.status, agent.error) };
  return { ok: true as const, ownerId: auth.ownerId, agent: agent.agent };
}

function openAdmin() {
  try {
    return { ok: true as const, client: createAdminClient() };
  } catch {
    return { ok: false as const, response: automationError(500, "El servidor no puede escribir en la base.") };
  }
}
