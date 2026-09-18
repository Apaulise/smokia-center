// Sincronización diaria de marca (Plans/03 §3.2). Windsor es pull, así que —
// a diferencia de /api/jobs/reconcile — esto no reconcilia jobs existentes:
// dispara una corrida nueva por cada owner con key de Windsor configurada.
// Protegido por CRON_SECRET, mismo esquema que el reconcile de Leads.

import { NextResponse, type NextRequest } from "next/server";

import { BRAND_SOURCES } from "@/lib/brand/sources/registry";
import { runBrandSync } from "@/lib/brand/sync";
import { WINDSOR_KEY_SETTING } from "@/lib/settings/constants";
import { createAdminClient } from "@/lib/supabase/admin";

// Varias llamadas secuenciales a Windsor (cuenta, diarias, contenido,
// audiencia x4, comentarios) más el resto de owners si hay más de uno — 60s
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
  const { data: rows } = await admin.from("settings").select("owner_id").eq("key", WINDSOR_KEY_SETTING);

  const ownerIds = [...new Set((rows ?? []).map((row) => row.owner_id))];

  const results = await Promise.all(
    ownerIds.flatMap((ownerId) => BRAND_SOURCES.map((provider) => runBrandSync(ownerId, provider.id))),
  );

  return NextResponse.json({ processed: results.length });
}
