// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/chats?unread=1&limit=30 — las conversaciones del inbox
// (Instagram vía Zernio) del owner de la automatización, la más reciente primero:
// quién es, a qué lead está enlazada, cuántos mensajes sin leer tiene y si todavía
// se puede responder (`replyWindow`). Sólo lee: no envía nada. Para responder, el
// agente deja un borrador en la cola de aprobaciones (POST /api/automation/ops,
// type "approval", channel "instagram") y una persona lo manda desde Chats.

import { type NextRequest, NextResponse } from "next/server";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { listChatsForAutomation, listChatsQuerySchema } from "@/lib/automation/chats";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const parsed = listChatsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return automationError(400, "Parámetros inválidos.", parsed.error.issues);

  const result = await listChatsForAutomation(createAdminClient(), auth.ownerId, parsed.data);
  if (!result.ok) return automationError(500, "No se pudieron leer las conversaciones.");
  return NextResponse.json({ chats: result.chats });
}
