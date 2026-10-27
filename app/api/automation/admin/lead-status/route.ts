// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/admin.ts.
//
// POST /api/automation/admin/lead-status — { lead_id, status, agent? }.
// Mismo gate de reuniones que la UI. Deja CAMBIO_ESTADO y una nota [agente].

import { type NextRequest } from "next/server";

import { setAdminLeadStatus } from "@/lib/automation/admin";
import { adminResponse, beginAdmin, revalidateCrm } from "@/lib/automation/admin-http";
import { adminLeadStatusSchema } from "@/lib/automation/admin-schema";
import { automationError } from "@/lib/automation/auth";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, true);
  if (!auth.ok) return auth.response;

  const parsed = adminLeadStatusSchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const result = await setAdminLeadStatus(
    auth.admin,
    auth.ownerId,
    auth.agent,
    parsed.data.lead_id,
    parsed.data.status,
  );
  if (result.ok) revalidateCrm({ ...result.body, leadId: parsed.data.lead_id });
  return adminResponse(result);
}
