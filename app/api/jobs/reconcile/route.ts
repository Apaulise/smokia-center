// Fallback de importación (Plan §1.2 paso 5 / CLAUDE.md gotchas): Vercel Cron
// en plan Hobby corre una vez por día, así que esto es un extra y no el
// mecanismo principal. Protegido por CRON_SECRET — Vercel lo manda solo como
// `Authorization: Bearer $CRON_SECRET` cuando el cron está definido en
// vercel.json y la env var está cargada.

import { NextResponse, type NextRequest } from "next/server";

import { reconcileScrapeJob } from "@/lib/apify/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("scrape_jobs")
    .select("id")
    .in("status", ["PENDIENTE", "EN_CURSO"]);

  const results = await Promise.all((jobs ?? []).map((job) => reconcileScrapeJob(job.id)));
  return NextResponse.json({ processed: results.length });
}
