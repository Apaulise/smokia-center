// Reconciliación de corridas de Apify — la parte idempotente del flujo
// (Plan §1.2, paso 5). Se dispara desde tres lados: el webhook, el chequeo al
// abrir la pantalla de jobs, y el cron. Las tres pueden pisarse sin duplicar
// nada porque el import final es un upsert por owner_id+dedupe_key.
//
// Usa el cliente admin: no hay sesión de usuario en un webhook, así que el
// owner_id se resuelve acá desde la fila de scrape_jobs y se escribe
// explícitamente en cada lead (CLAUDE.md §4).

import { decrypt } from "@/lib/crypto";
import { computeDedupeKey } from "@/lib/leads/dedupe";
import { getProvider } from "@/lib/providers/registry";
import { APIFY_KEY_SETTING } from "@/lib/settings/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

import { APIFY_TERMINAL_STATUSES, getAllApifyDatasetItems, getApifyRun } from "./client";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type ReconcileResult = {
  status: Database["public"]["Enums"]["job_status"] | "NOT_FOUND";
  imported: number;
};

export async function reconcileScrapeJob(jobId: string): Promise<ReconcileResult> {
  const admin = createAdminClient();

  const { data: job } = await admin.from("scrape_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { status: "NOT_FOUND", imported: 0 };

  // Ya cerrado: nada para hacer. Esto es lo que hace segura la triple llamada.
  if (job.status === "COMPLETADO" || job.status === "FALLIDO") {
    return { status: job.status, imported: job.items_imported };
  }

  if (!job.apify_run_id) {
    return { status: job.status, imported: 0 };
  }

  const { data: settingsRow } = await admin
    .from("settings")
    .select("value_encrypted")
    .eq("owner_id", job.owner_id)
    .eq("key", APIFY_KEY_SETTING)
    .maybeSingle();

  if (!settingsRow) {
    await failJob(admin, job.id, job.lead_list_id, "Falta la API key de Apify.");
    return { status: "FALLIDO", imported: 0 };
  }

  let token: string;
  try {
    token = decrypt(settingsRow.value_encrypted);
  } catch {
    await failJob(admin, job.id, job.lead_list_id, "La API key guardada no se pudo leer.");
    return { status: "FALLIDO", imported: 0 };
  }

  const run = await getApifyRun({ token, runId: job.apify_run_id });

  if (!APIFY_TERMINAL_STATUSES.has(run.status)) {
    if (job.status !== "EN_CURSO") {
      await admin.from("scrape_jobs").update({ status: "EN_CURSO" }).eq("id", job.id);
    }
    return { status: "EN_CURSO", imported: 0 };
  }

  if (run.status !== "SUCCEEDED") {
    await failJob(admin, job.id, job.lead_list_id, `Apify terminó con estado ${run.status}.`, run.usageTotalUsd);
    return { status: "FALLIDO", imported: 0 };
  }

  const provider = getProvider(job.provider);
  if (!provider) {
    await failJob(admin, job.id, job.lead_list_id, `Proveedor desconocido: ${job.provider}.`);
    return { status: "FALLIDO", imported: 0 };
  }

  const { data: leadList } = await admin
    .from("lead_lists")
    .select("industry_id")
    .eq("id", job.lead_list_id)
    .maybeSingle();
  const industryId = leadList?.industry_id ?? null;

  const items = await getAllApifyDatasetItems({ token, datasetId: run.defaultDatasetId });

  // Un Map por dedupe_key: si el dataset trae el mismo lugar dos veces, un
  // upsert con filas repetidas en el mismo statement rompe con
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const rows = new Map<string, LeadInsert>();
  for (const item of items) {
    const normalized = provider.mapItem(item);
    if (!normalized) continue;

    const dedupeKey = computeDedupeKey(normalized);
    rows.set(dedupeKey, {
      owner_id: job.owner_id,
      lead_list_id: job.lead_list_id,
      industry_id: industryId,
      name: normalized.name,
      phone: normalized.phone ?? null,
      email: normalized.email ?? null,
      website: normalized.website ?? null,
      address: normalized.address ?? null,
      city: normalized.city ?? null,
      region: normalized.region ?? null,
      country: normalized.country ?? null,
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      rating: normalized.rating ?? null,
      reviews_count: normalized.reviewsCount ?? null,
      instagram_url: normalized.instagramUrl ?? null,
      linkedin_url: normalized.linkedinUrl ?? null,
      source_url: normalized.sourceUrl ?? null,
      external_id: normalized.externalId ?? null,
      raw: normalized.raw as Json,
      dedupe_key: dedupeKey,
    });
  }

  // Cuántos de estos dedupe_key ya existían ANTES del upsert: reimportar la
  // misma zona enriquece leads existentes, y eso no es "importar" de nuevo —
  // items_imported tiene que reflejar los realmente nuevos, no los reprocesados.
  const dedupeKeys = [...rows.keys()];
  let newCount = dedupeKeys.length;
  if (dedupeKeys.length > 0) {
    const { data: existingLeads } = await admin
      .from("leads")
      .select("dedupe_key")
      .eq("owner_id", job.owner_id)
      .in("dedupe_key", dedupeKeys);
    const existingKeys = new Set((existingLeads ?? []).map((row) => row.dedupe_key));
    newCount = dedupeKeys.filter((key) => !existingKeys.has(key)).length;
  }

  if (rows.size > 0) {
    const { error } = await admin
      .from("leads")
      .upsert([...rows.values()], { onConflict: "owner_id,dedupe_key" });
    if (error) {
      await failJob(admin, job.id, job.lead_list_id, `No se pudo importar: ${error.message}`, run.usageTotalUsd);
      return { status: "FALLIDO", imported: 0 };
    }
  }

  const imported = newCount;
  const nowIso = new Date().toISOString();

  await admin
    .from("scrape_jobs")
    .update({
      status: "COMPLETADO",
      items_imported: imported,
      cost_usd: run.usageTotalUsd,
      apify_dataset_id: run.defaultDatasetId,
      finished_at: nowIso,
    })
    .eq("id", job.id);

  // lead_count es el tamaño de la lista (todo lo que el upsert asoció acá),
  // no los nuevos — un reimport enriquece leads existentes y los reasocia.
  await admin
    .from("lead_lists")
    .update({ status: "COMPLETADO", lead_count: rows.size })
    .eq("id", job.lead_list_id);

  return { status: "COMPLETADO", imported };
}

async function failJob(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  leadListId: string,
  error: string,
  costUsd: number | null = null,
) {
  await admin
    .from("scrape_jobs")
    .update({ status: "FALLIDO", error, cost_usd: costUsd, finished_at: new Date().toISOString() })
    .eq("id", jobId);
  await admin.from("lead_lists").update({ status: "FALLIDO" }).eq("id", leadListId);
}
