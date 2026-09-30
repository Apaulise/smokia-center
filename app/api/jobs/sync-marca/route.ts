// Sincronización diaria de marca (Plans/03 §3.2). La API de Instagram es pull,
// así que — a diferencia de /api/jobs/reconcile — esto no reconcilia jobs
// existentes: dispara una corrida nueva por cada owner que ya tiene una cuenta
// sincronizada. La primera sincronización de un owner la dispara él mismo al
// abrir /marca. Protegido por CRON_SECRET, mismo esquema que el reconcile de Leads.

import { NextResponse, type NextRequest } from "next/server";

import { BRAND_SOURCES } from "@/lib/brand/sources/registry";
import { runBrandSync } from "@/lib/brand/sync";
import { createAdminClient } from "@/lib/supabase/admin";

// Varias llamadas a la Graph API (cuenta, diarias, contenido con insights por
// pieza, audiencia x4, comentarios) más el resto de owners si hay más de uno — 60s
// es el máximo de plan Hobby. Si la biblioteca de contenido crece mucho más,
// esto va a necesitar partirse en corridas más chicas.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows } = await admin.from("brand_accounts").select("owner_id");

  const ownerIds = [...new Set((rows ?? []).map((row) => row.owner_id))];

  const results = await Promise.all(
    ownerIds.flatMap((ownerId) => BRAND_SOURCES.map((provider) => runBrandSync(ownerId, provider.id))),
  );

  return NextResponse.json({ processed: results.length });
}
