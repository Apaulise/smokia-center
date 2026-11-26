// ⚠️ SERVICE ROLE — webhook de Cal.com. Ver CLAUDE.md §4.
//
// POST /api/automation/webhooks/cal
// Firma: X-Cal-Signature-256 (HMAC-SHA256 hex del body crudo) con
// CAL_WEBHOOK_SECRET. Sin secreto, o con el literal no-secret-provided, 401.
// El owner sale de AUTOMATION_OWNER_ID, nunca del body.
//
// BOOKING_CREATED y BOOKING_RESCHEDULED crean o actualizan el turno y suben
// el lead a REUNION_AGENDADA. BOOKING_CANCELLED marca el turno CANCELADA.
// MEETING_ENDED lo marca REALIZADA y sube el lead a REUNION_REALIZADA.
// El lead se busca por Instagram, email, teléfono o nombre; si no está, se crea.
// utm_source y utm_campaign se guardan cuando vienen en la reserva.
// Un reintento con el mismo uid + evento no duplica el turno.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { applyCalBooking, parseCalWebhook } from "@/lib/automation/cal-booking";
import { bodyEventId } from "@/lib/automation/zernio-crm";
import { authorizeWebhook } from "@/lib/automation/webhook-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body demasiado grande." }, { status: 413 });
  }

  const auth = authorizeWebhook(request, rawBody, {
    secretEnv: "CAL_WEBHOOK_SECRET",
    signatureHeaders: ["x-cal-signature-256"],
  });
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = parseCalWebhook(json, bodyEventId(rawBody));
  if (parsed.kind === "ignore") return NextResponse.json({ ok: true, ignored: parsed.event });
  if (parsed.kind === "invalid") return NextResponse.json({ error: parsed.reason }, { status: 422 });

  const result = await applyCalBooking(createAdminClient(), auth.ownerId, parsed.booking);
  if (!result.ok) {
    const status = result.reason === "migration" ? 503 : 500;
    return NextResponse.json({ error: result.message }, { status });
  }

  if (!result.duplicate) {
    revalidatePath("/leads");
    revalidatePath("/leads/lista");
    revalidatePath("/leads/agenda");
    revalidatePath("/leads/seguimiento");
    revalidatePath(`/leads/${result.leadId}`);
  }

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    leadId: result.duplicate ? null : result.leadId,
    createdLead: result.duplicate ? false : result.createdLead,
    appointmentId: result.duplicate ? null : result.appointmentId,
    status: result.duplicate ? null : result.status,
  });
}
