// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/admin.ts.
//
// POST /api/automation/admin/lead-activity — actividad con el texto exacto.
// El content no se reescribe. Además queda una nota [agente] de auditoría.

import { type NextRequest } from "next/server";

import { createAdminRow } from "@/lib/automation/admin";
import { adminResponse, beginAdmin, revalidateCrm } from "@/lib/automation/admin-http";
import { adminLeadActivitySchema } from "@/lib/automation/admin-schema";
import { automationError } from "@/lib/automation/auth";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, true);
  if (!auth.ok) return auth.response;

  const parsed = adminLeadActivitySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const result = await createAdminRow(auth.admin, auth.ownerId, auth.agent, "lead_activities", parsed.data, {
    auditSummary: `actividad ${parsed.data.type} registrada`,
  });
  if (result.ok) revalidateCrm(result.body);
  return adminResponse(result);
}
