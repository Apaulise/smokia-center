// ⚠️ SERVICE ROLE — webhook de calificación de Zernio. Ver CLAUDE.md §4.
//
// POST /api/automation/webhooks/zernio
// Firma: X-Zernio-Signature (HMAC-SHA256 hex del body crudo) con
// ZERNIO_WEBHOOK_SECRET. El legado X-Late-Signature vale lo mismo.
// El owner sale de AUTOMATION_OWNER_ID, nunca del body.
//
// Eventos que crean o actualizan un lead (source instagram_organico):
//   contact.tag_added con tag negocio | intervenir | no_agenda | agenda
//   contact.field_changed del campo tarea / tareas / tarea_libre
// workflow.run.* anota automation_runs y, si el workflow es de una pieza,
// conversations.source_automation_id. El resto se responde 200 y se ignora.
// Un reintento con el mismo id de evento no duplica el lead.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { authorizeWebhook } from "@/lib/automation/webhook-signature";
import { applyZernioCrmEvent, bodyEventId, contactHintFromZernio, parseZernioCrmBody } from "@/lib/automation/zernio-crm";
import { asChats } from "@/lib/chats/db";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const MAX_BODY_BYTES = 1_000_000;

async function ownerApiKey(ownerId: string): Promise<string | null> {
  const db = asChats(createAdminClient());
  const { data } = await db.from("channel_secrets").select("api_key_encrypted").eq("owner_id", ownerId).limit(1);
  const encrypted = data?.[0]?.api_key_encrypted;
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body demasiado grande." }, { status: 413 });
  }

  const auth = authorizeWebhook(request, rawBody, {
    secretEnv: "ZERNIO_WEBHOOK_SECRET",
    signatureHeaders: ["x-zernio-signature", "x-late-signature"],
  });
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = parseZernioCrmBody(json, bodyEventId(rawBody));
  if (parsed.kind === "test") return NextResponse.json({ ok: true, test: true });
  if (parsed.kind === "ignore") return NextResponse.json({ ok: true, ignored: parsed.event });
  if (parsed.kind === "invalid") return NextResponse.json({ error: parsed.reason }, { status: 422 });

  const apiKey = await ownerApiKey(auth.ownerId);
  const result = await applyZernioCrmEvent(createAdminClient(), auth.ownerId, parsed.action, {
    lookup: apiKey ? (contactId) => contactHintFromZernio(apiKey, contactId) : undefined,
  });
  if (!result.ok) {
    const status = result.reason === "migration" ? 503 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  if (!result.duplicate && result.leadId) {
    revalidatePath("/leads");
    revalidatePath("/leads/lista");
    revalidatePath("/leads/seguimiento");
    revalidatePath("/chats");
    revalidatePath(`/leads/${result.leadId}`);
  }

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    leadId: result.duplicate ? null : result.leadId,
    created: result.duplicate ? false : result.created,
    status: result.duplicate ? null : result.status,
    linkedConversations: result.duplicate ? 0 : result.linkedConversations,
    runRecorded: result.duplicate ? false : result.runRecorded,
  });
}
