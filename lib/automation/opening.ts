// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito.
//
// Mismo generador que el botón "Generar apertura" de la ficha
// (`generateLeadOpening` en lib/leads/ai/actions.ts → `generateOpening`), con
// las mismas entradas. La diferencia es sólo de dónde salen: allá las leen
// los helpers de lib/leads/queries.ts con el cliente con RLS (cookies del
// usuario logueado), que una ruta sin sesión no tiene; acá se leen con el
// cliente service role, filtrando por el owner de AUTOMATION_OWNER_ID.

import { decrypt } from "@/lib/crypto";
import type { SalesAngle } from "@/lib/leads/ai/angles";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { generateOpening, type GeneratedOpening } from "@/lib/leads/ai/opening";
import { toLeadContext, type LeadMemory } from "@/lib/leads/ai/prompts";
import { STYLE_CANDIDATE_WINDOW, STYLE_EXAMPLE_COLUMNS, selectStyleExamples } from "@/lib/leads/ai/style/examples";
import type { LeadsClient } from "@/lib/leads/contact";
import { GROQ_KEY_SETTING, SALES_PROFILE_SETTING } from "@/lib/settings/constants";

export type OpeningResult =
  | { ok: true; opening: GeneratedOpening; lead: { id: string; name: string; phone: string | null; status: string } }
  | { ok: false; status: 404 | 409 | 422 | 502; message: string };

async function readSetting(admin: LeadsClient, ownerId: string, key: string): Promise<string | null> {
  const { data } = await admin
    .from("settings")
    .select("value_encrypted")
    .eq("owner_id", ownerId)
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.value_encrypted);
  } catch {
    // Cifrado con otra APP_ENCRYPTION_KEY: igual que en la app, se trata como no cargado.
    return null;
  }
}

/** Calco de `lead_angle_counts_30d()` (SQL, SECURITY INVOKER): con service role la función contaría los mensajes de todos los owners. */
async function angleCounts30d(admin: LeadsClient, ownerId: string): Promise<Partial<Record<SalesAngle, number>>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("lead_messages")
    .select("angle")
    .eq("owner_id", ownerId)
    .eq("sender", "VENDEDOR")
    .eq("generated_by", "IA")
    .not("angle", "is", null)
    .gte("occurred_at", since);
  if (error) throw error;
  const counts: Partial<Record<SalesAngle, number>> = {};
  for (const row of data ?? []) {
    if (row.angle) counts[row.angle] = (counts[row.angle] ?? 0) + 1;
  }
  return counts;
}

/**
 * Genera la apertura de un lead. No persiste nada (igual que en la ficha):
 * el mensaje recién queda registrado cuando se avisa que se mandó, con
 * `POST .../contact` y el bloque `opening`.
 */
export async function generateOpeningForAutomation(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
): Promise<OpeningResult> {
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, name, phone, status, city, interest_level, industries(name)")
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return { ok: false, status: 404, message: "Lead no encontrado." };

  const apiKey = await readSetting(admin, ownerId, GROQ_KEY_SETTING);
  if (!apiKey) {
    return { ok: false, status: 422, message: "Falta cargar la API key de Groq en Configuración (o no se pudo leer)." };
  }

  const [salesProfile, intel, signals, notes, angleCounts, styleRows] = await Promise.all([
    readSetting(admin, ownerId, SALES_PROFILE_SETTING),
    admin.from("lead_intel").select("enrichment, memory").eq("owner_id", ownerId).eq("lead_id", leadId).maybeSingle(),
    admin
      .from("lead_signals")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    admin
      .from("lead_activities")
      .select("content, occurred_at")
      .eq("owner_id", ownerId)
      .eq("lead_id", leadId)
      .eq("type", "NOTA")
      .order("occurred_at", { ascending: true }),
    angleCounts30d(admin, ownerId),
    admin
      .from("lead_messages")
      .select(STYLE_EXAMPLE_COLUMNS)
      .eq("owner_id", ownerId)
      .eq("sender", "VENDEDOR")
      .not("generated_content", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(STYLE_CANDIDATE_WINDOW),
  ]);
  for (const result of [intel, signals, notes, styleRows]) {
    if (result.error) throw result.error;
  }

  try {
    const opening = await generateOpening({
      leadId,
      apiKey,
      salesProfile: salesProfile ?? "",
      lead: toLeadContext(lead),
      enrichment: (intel.data?.enrichment as EnrichmentResult | null | undefined) ?? null,
      memory: (intel.data?.memory as LeadMemory | null | undefined) ?? null,
      signals: signals.data ?? [],
      notes: notes.data ?? [],
      angleCounts,
      styleExamples: selectStyleExamples(styleRows.data ?? [], { leadId, kind: "APERTURA" }),
    });
    return { ok: true, opening, lead: { id: lead.id, name: lead.name, phone: lead.phone, status: lead.status } };
  } catch (error) {
    return { ok: false, status: 502, message: error instanceof Error ? error.message : "No se pudo generar la apertura." };
  }
}
