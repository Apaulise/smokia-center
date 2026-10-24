// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/ops/approvals?decision=approved
// Devuelve las decisiones ya tomadas para que el orquestador las lea.
// Esta ruta no envía el mensaje: sólo lo lee.

import { type NextRequest, NextResponse } from "next/server";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { listOpsApprovals } from "@/lib/automation/ops";
import { approvalsQuerySchema } from "@/lib/ops/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const parsed = approvalsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return automationError(400, "Parámetros inválidos.", parsed.error.issues);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return automationError(500, "El servidor no puede leer la base.");
  }

  const result = await listOpsApprovals(admin, auth.ownerId, parsed.data);
  if (!result.ok) return automationError(result.status, result.error);

  return NextResponse.json({ approvals: result.approvals, count: result.approvals.length });
}
