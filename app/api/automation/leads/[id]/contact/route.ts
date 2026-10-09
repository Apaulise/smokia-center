// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/:id/contact — "le mandé este mensaje". Body:
// { channel?: "WHATSAPP" | "EMAIL", content, status?, next_action_at?, note?,
//   opening?: { angle, variant, generated_content } }. Ver recordAutomationContact.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

  const result = await recordAutomationContact(createAdminClient(), auth.ownerId, id, parsed.data);
  if (!result.ok) return automationError(result.status, result.message);

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads/lista");
  return NextResponse.json(result);
}
