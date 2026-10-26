// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads — la cola de leads para contactar, del owner de
// AUTOMATION_OWNER_ID. Filtros: status (lista separada por comas, default
// NUEVO,LISTO), industry (UUID o nombre del rubro), list, city,
// uncontacted, has_phone (default true), limit (default 25, máx. 100).
// Cada lead incluye `email` (string o null). Este GET no escribe nada.

import { type NextRequest, NextResponse } from "next/server";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { listLeadsForAutomation, listLeadsQuerySchema } from "@/lib/automation/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const parsed = listLeadsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return automationError(400, "Parámetros inválidos.", parsed.error.issues);

  const result = await listLeadsForAutomation(createAdminClient(), auth.ownerId, parsed.data);
  return NextResponse.json({ ...result, count: result.leads.length });
}
