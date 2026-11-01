// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/:id/reply — "el lead contestó esto".
// { channel?, content, occurred_at?, response_type?, interest_level?, wants_meeting?, disqualify? }
// El agente va en agent o en X-Agent. Sin response_type corre el analizador.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { decideWriteAgent, replyAgentsFromEnv } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { recordAutomationReply, replyBodySchema } from "@/lib/automation/reply";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const json = await request.json().catch(() => null);
  const parsed = replyBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const agent = decideWriteAgent({
    bodyAgent: parsed.data.agent,
    headerAgent: request.headers.get("x-agent"),
    allowed: replyAgentsFromEnv(process.env),
    deniedMessage: "Este agente no puede registrar respuestas.",
  });
  if (!agent.ok) return automationError(agent.status, agent.error);

  const result = await recordAutomationReply(createAdminClient(), auth.ownerId, id, agent.agent, parsed.data);
  if (!result.ok) return automationError(result.status, result.message);

  if (!result.duplicate) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/lista");
    revalidatePath("/leads/seguimiento");
    revalidatePath("/operaciones/analisis");
  }
  return NextResponse.json(result);
}
