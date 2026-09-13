// ⚠️ SERVICE ROLE — saltea RLS. Ver CLAUDE.md §4: cualquier cambio acá se revisa a mano.
//
// Apify no firma sus webhooks: el secreto en la URL es lo único que distingue
// un aviso real de uno inventado. Por eso el body del POST se descarta como
// fuente de datos — sólo importa como señal de "el job puede haber
// terminado" — y reconcileScrapeJob vuelve a consultar la corrida con
// nuestro propio token antes de importar nada.

import { NextResponse, type NextRequest } from "next/server";

import { reconcileScrapeJob } from "@/lib/apify/reconcile";
import { safeEqual } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const secret = request.nextUrl.searchParams.get("secret");
  if (!jobId || !secret) {
    return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("scrape_jobs")
    .select("webhook_secret")
    .eq("id", jobId)
    .maybeSingle();

  if (!job || !safeEqual(job.webhook_secret, secret)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const result = await reconcileScrapeJob(jobId);
  return NextResponse.json(result);
}
