// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/:id/status — { status }. Mismo núcleo que el
// selector de estado de la tabla/kanban (applyLeadStatusChange): deja el
// CAMBIO_ESTADO en el timeline y respeta el gate de reuniones (409).

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { statusBodySchema } from "@/lib/automation/leads";
import { applyLeadStatusChange } from "@/lib/leads/contact";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const json = await request.json().catch(() => null);
  const parsed = statusBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const result = await applyLeadStatusChange(createAdminClient(), auth.ownerId, id, parsed.data.status);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "gate" ? 409 : 500;
    return automationError(status, result.message);
  }

  if (result.changed) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/lista");
  }
  return NextResponse.json({ leadId: id, ...result });
}
