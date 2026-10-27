// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/admin.ts.
//
// POST /api/automation/admin/lead-message — mensaje con el texto exacto.
// No pasa por el registro de contacto: no cambia status ni last_contacted_at.
// confirmed arranca en true (el hilo de la ficha sólo muestra los confirmados).

import { type NextRequest } from "next/server";

import { createAdminRow } from "@/lib/automation/admin";
import { adminResponse, beginAdmin, revalidateCrm } from "@/lib/automation/admin-http";
import { adminLeadMessageSchema } from "@/lib/automation/admin-schema";
import { automationError } from "@/lib/automation/auth";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, true);
  if (!auth.ok) return auth.response;

  const parsed = adminLeadMessageSchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const fields: Record<string, unknown> = { ...parsed.data };
  delete fields.agent;
  if (fields.confirmed === true && fields.confirmed_at == null) {
    fields.confirmed_at = new Date().toISOString();
  }

  const result = await createAdminRow(auth.admin, auth.ownerId, auth.agent, "lead_messages", fields, {
    auditSummary: "mensaje registrado",
  });
  if (result.ok) revalidateCrm(result.body);
  return adminResponse(result);
}
