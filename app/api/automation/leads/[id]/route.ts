// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads/:id — el lead con sus últimas 20 actividades y
// sus últimos 20 mensajes.

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
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
