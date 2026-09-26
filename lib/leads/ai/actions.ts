"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { enrichLead, type EnrichmentInput, type EnrichmentResult } from "@/lib/leads/ai/enrich";
import { getGeminiApiKey } from "@/lib/leads/ai/key";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ActionState = { ok: boolean; message: string } | null;

/** Los límites del free tier de Gemini son reales (§1.10): ~15 RPM, y el grounding tiene su propia cuota, más chica. */
const ENRICH_BATCH_MAX = 25;
const ENRICH_THROTTLE_MS = 4500;
/** Margen sobre ENRICH_BATCH_MAX para descartar los que ya estén enriquecidos sin traer la lista entera. */
const ENRICH_CANDIDATE_POOL = 500;

interface EnrichCandidate {
  id: string;
  name: string;
  status: string;
  city: string | null;
  address: string | null;
  website: string | null;
  instagram_url: string | null;
  source_url: string | null;
  industries: { name: string } | null;
}

function toLeadInput(lead: EnrichCandidate): EnrichmentInput {
  return {
    name: lead.name,
    industryName: lead.industries?.name ?? null,
    city: lead.city,
    address: lead.address,
    website: lead.website,
    instagramUrl: lead.instagram_url,
    sourceUrl: lead.source_url,
  };
}

/** Escribe lead_intel, el ángulo sugerido, el avance NUEVO→LISTO y las hipótesis de dolor de un enriquecimiento. */
async function persistEnrichment(ownerId: string, leadId: string, currentStatus: string, result: EnrichmentResult) {
  const supabase = await createClient();

  await supabase.from("lead_intel").upsert(
    {
      owner_id: ownerId,
      lead_id: leadId,
      enrichment: result as unknown as Json,
      enriched_at: new Date().toISOString(),
    },
    { onConflict: "lead_id" },
  );

  const update: { sales_angle?: EnrichmentResult["recommendedSalesAngle"]; status?: "LISTO" } = {};
  if (result.recommendedSalesAngle) update.sales_angle = result.recommendedSalesAngle;
  // Sólo avanza si sigue en NUEVO: si ya lo contactaron o avanzó por otro
  // lado, el enriquecimiento no le pisa el estado real (Plan §1.10).
  if (currentStatus === "NUEVO") update.status = "LISTO";
  if (Object.keys(update).length > 0) {
    await supabase.from("leads").update(update).eq("id", leadId);
  }

  // Cada possible_pain nace como hipótesis (SPA §5): el enriquecimiento nunca confirma un dolor.
  if (result.possiblePains.length > 0) {
    await supabase.from("lead_signals").insert(
      result.possiblePains.map((pain) => ({
        owner_id: ownerId,
        lead_id: leadId,
        kind: "DOLOR" as const,
        status: "HIPOTESIS" as const,
        title: pain.description.slice(0, 200),
        description: pain.description,
        business_impact: pain.businessImpact,
      })),
    );
  }
}

async function fetchEnrichCandidates(supabase: Awaited<ReturnType<typeof createClient>>, leadIds: string[]) {
  const { data } = await supabase
    .from("leads")
    .select("id, name, status, city, address, website, instagram_url, source_url, industries(name)")
    .in("id", leadIds);
  return (data ?? []) as EnrichCandidate[];
}

const idSchema = z.string().uuid();

/** Botón "Enriquecer" de la ficha (§1.10): un lead, en el mismo request. */
export async function enrichOneLead(leadId: string): Promise<ActionState> {
  const user = await requireUser();
  if (!idSchema.safeParse(leadId).success) return { ok: false, message: "Lead inválido." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const supabase = await createClient();
  const [lead] = await fetchEnrichCandidates(supabase, [leadId]);
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  try {
    const result = await enrichLead({ apiKey: keyResult.apiKey, lead: toLeadInput(lead) });
    await persistEnrichment(user.id, lead.id, lead.status, result);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo enriquecer el lead." };
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Lead enriquecido." };
}

/**
 * Botón "Enriquecer lista" (§1.10): hasta ENRICH_BATCH_MAX leads sin
 * enriquecer, en segundo plano con after() — un lote entero, con el throttle
 * que exige el free tier, no entra en el tiempo de un request. Nunca
 * automático al importar: una lista de 500 leads quemaría la cuota del día en
 * el primer minuto.
 */
export async function enrichLeadListBatch(leadListId: string): Promise<ActionState> {
  const user = await requireUser();
  if (!idSchema.safeParse(leadListId).success) return { ok: false, message: "Lista inválida." };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("leads")
    .select("id")
    .eq("lead_list_id", leadListId)
    .order("created_at", { ascending: true })
    .limit(ENRICH_CANDIDATE_POOL);
  const poolIds = (pool ?? []).map((row) => row.id);
  if (poolIds.length === 0) return { ok: false, message: "La lista no tiene leads." };

  const { data: enrichedRows } = await supabase
    .from("lead_intel")
    .select("lead_id")
    .in("lead_id", poolIds)
    .not("enrichment", "is", null);
  const enrichedSet = new Set((enrichedRows ?? []).map((row) => row.lead_id));
  const pendingIds = poolIds.filter((id) => !enrichedSet.has(id)).slice(0, ENRICH_BATCH_MAX);

  if (pendingIds.length === 0) {
    return { ok: true, message: "No hay leads sin enriquecer en esta lista." };
  }

  const pending = await fetchEnrichCandidates(supabase, pendingIds);
  const apiKey = keyResult.apiKey;
  const ownerId = user.id;

  after(async () => {
    for (const lead of pending) {
      try {
        const result = await enrichLead({ apiKey, lead: toLeadInput(lead) });
        await persistEnrichment(ownerId, lead.id, lead.status, result);
      } catch (error) {
        // Un fallo puntual no frena el lote: el lead queda sin enriquecer y se puede reintentar.
        console.error(`No se pudo enriquecer el lead ${lead.id}:`, error instanceof Error ? error.message : error);
      }
      await new Promise((resolve) => setTimeout(resolve, ENRICH_THROTTLE_MS));
    }
  });

  return {
    ok: true,
    message: `Enriqueciendo ${pending.length} lead${pending.length === 1 ? "" : "s"} en segundo plano. Refrescá la pantalla en un rato para ver el avance.`,
  };
}
