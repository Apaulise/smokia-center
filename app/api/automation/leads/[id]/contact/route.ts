// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/:id/contact — "le mandé este mensaje".
// Body histórico: { channel?, content, status?, next_action_at?, note?, opening? }.
// Campos nuevos, todos opcionales: occurred_at, kind (APERTURA | APERTURA_M2 |
// SEGUIMIENTO), part (1 | 2), type, variant, agent. Ver recordAutomationContact.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readDeclaredAgent } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { contactBodySchema, recordAutomationContact } from "@/lib/automation/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const json = await request.json().catch(() => null);
  const parsed = contactBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const agent = readDeclaredAgent({
    bodyAgent: parsed.data.agent,
    headerAgent: request.headers.get("x-agent"),
  });
  if (!agent.ok) return automationError(agent.status, agent.error);

  const result = await recordAutomationContact(createAdminClient(), auth.ownerId, id, parsed.data, agent.agent);
  if (!result.ok) return automationError(result.status, result.message);

  if (!result.duplicate) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/lista");
    revalidatePath("/leads/seguimiento");
    revalidatePath("/operaciones/analisis");
  }
  return NextResponse.json(result);
}
