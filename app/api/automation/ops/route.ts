// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/ops — Mr. Pou reporta estado, un borrador o un hallazgo.
// Upsert por externalId. Una aprobación ya decidida no se pisa.
// Esta ruta no envía WhatsApp, mails ni ningún otro mensaje.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { ingestOps } from "@/lib/automation/ops";
import { normalizeOpsKeys, opsIngestPayload } from "@/lib/ops/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = opsIngestPayload.safeParse(normalizeOpsKeys(json));
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return automationError(500, "El servidor no puede escribir en la base.");
  }

  const result = await ingestOps(admin, auth.ownerId, parsed.data);
  if (!result.ok) return automationError(result.status, result.error);

  revalidatePath("/operaciones");
  revalidatePath("/operaciones/aprobaciones");
  revalidatePath("/operaciones/areas");
  revalidatePath("/operaciones/auditor");

  return NextResponse.json({
    id: result.id,
    externalId: result.externalId,
    type: result.type,
    unchanged: result.unchanged,
  });
}
