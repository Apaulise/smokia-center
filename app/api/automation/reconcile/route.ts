// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/reconcile?date=YYYY-MM-DD
// Salientes confirmados y entrantes de ese día, en America/Argentina/Buenos_Aires.

import { type NextRequest, NextResponse } from "next/server";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { buildReconcile, parseReconcileDate } from "@/lib/automation/reconcile";
import { addDaysIso, isoDateToUtcInstant } from "@/lib/leads/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

const ROW_LIMIT = 2000;

export async function GET(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const date = parseReconcileDate(request.nextUrl.searchParams.get("date"));
  if (!date) return automationError(400, "date tiene que ser un día YYYY-MM-DD.");

  const from = isoDateToUtcInstant(date);
  const to = isoDateToUtcInstant(addDaysIso(date, 1));
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_messages")
    .select("id, lead_id, sender, channel, kind, content, analysis, confirmed, occurred_at")
    .eq("owner_id", auth.ownerId)
    .gte("occurred_at", from)
    .lt("occurred_at", to)
    .order("occurred_at", { ascending: true })
    .limit(ROW_LIMIT);
  if (error) return automationError(500, "No se pudieron leer los mensajes.");

  const rows = data ?? [];
  const leadIds = [...new Set(rows.map((row) => row.lead_id))];
  let leads: { id: string; name: string; phone: string | null; status: string }[] = [];
  if (leadIds.length > 0) {
    const loaded = await admin.from("leads").select("id, name, phone, status").eq("owner_id", auth.ownerId).in("id", leadIds);
    if (loaded.error) return automationError(500, "No se pudieron leer los leads.");
    leads = loaded.data ?? [];
  }

  const body = buildReconcile(
    date,
    leads,
    rows.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      sender: row.sender,
      channel: row.channel,
      kind: row.kind,
      content: row.content,
      analysis: row.analysis,
      confirmed: row.confirmed,
      occurredAt: row.occurred_at,
    })),
  );

  return NextResponse.json({ ...body, truncated: rows.length >= ROW_LIMIT });
}
