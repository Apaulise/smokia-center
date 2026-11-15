// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads/:id/chat — la(s) conversación(es) de Instagram
// enlazadas a este lead, con sus últimos 50 mensajes (los adjuntos van como tipo
// y etiqueta, sin URL). Sólo lee: no envía nada.

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { getLeadChatForAutomation } from "@/lib/automation/chats";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const result = await getLeadChatForAutomation(createAdminClient(), auth.ownerId, id);
  if (!result.ok) {
    return result.reason === "not_found" ? automationError(404, "Lead no encontrado.") : automationError(500, "No se pudo leer el chat.");
  }
  return NextResponse.json({ conversations: result.conversations });
}
