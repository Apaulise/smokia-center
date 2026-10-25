// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads/:id — el lead con sus últimas 20 actividades y
// sus últimos 20 mensajes. El lead incluye `email` (string o null).
//
// PATCH /api/automation/leads/:id — corrige el lead sin registrar un contacto.
// Body: { agent?, phone?, notes?, next_action_at? }. El agente va en `agent`
// o en el header `X-Agent`. Hace falta al menos uno de phone, notes o
// next_action_at. No cambia status, no toca last_contacted_at y no inserta
// lead_messages. Si hubo un cambio real, deja una actividad NOTA con el agente.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { decideWriteAgent, writeAgentsFromEnv } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { correctLeadForAutomation } from "@/lib/automation/correct-lead";
import { leadPlanningBodySchema, toLeadCorrectionInput } from "@/lib/automation/lead-planning";
import { getLeadForAutomation } from "@/lib/automation/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const result = await getLeadForAutomation(createAdminClient(), auth.ownerId, id);
  if (!result) return automationError(404, "Lead no encontrado.");
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const json = await request.json().catch(() => null);
  const parsed = leadPlanningBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const agent = decideWriteAgent({
    bodyAgent: parsed.data.agent,
    headerAgent: request.headers.get("x-agent"),
    allowed: writeAgentsFromEnv(process.env),
  });
  if (!agent.ok) return automationError(agent.status, agent.error);

  const result = await correctLeadForAutomation(
    createAdminClient(),
    auth.ownerId,
    id,
    agent.agent,
    toLeadCorrectionInput(parsed.data),
  );
  if (!result.ok) {
    const status =
      result.reason === "not_found" ? 404 : result.reason === "conflict" ? 409 : result.reason === "invalid_phone" ? 400 : 500;
    return automationError(status, result.message);
  }

  if (result.changed) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/lista");
    revalidatePath("/leads/seguimiento");
    revalidatePath("/leads");
  }

  return NextResponse.json({
    id: result.id,
    name: result.name,
    phone: result.phone,
    phoneE164: result.phoneE164,
    notes: result.notes,
    nextActionAt: result.nextActionAt,
    status: result.status,
    updatedAt: result.updatedAt,
    agent: result.agent,
    activity: result.activity,
  });
}
