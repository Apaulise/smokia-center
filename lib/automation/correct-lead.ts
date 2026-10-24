// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` (CLAUDE.md §4).
//
// Corrección de un lead desde la API de automatización: teléfono, nota y
// próxima acción. No cambia `status`, no toca `last_contacted_at` y no inserta
// `lead_messages`. El rastro es una actividad `NOTA`, el mismo tipo que deja
// la ficha cuando alguien anota algo — no un contacto fingido.

import { CORRECTION_ACTIVITY_TYPE, planLeadCorrection, type LeadCorrectionInput } from "@/lib/automation/lead-planning";
import type { LeadsClient } from "@/lib/leads/contact";
import { normalizePhone } from "@/lib/leads/dedupe";
import type { LeadStatus } from "@/lib/leads/status";

export type CorrectLeadResult =
  | {
      ok: true;
      changed: boolean;
      id: string;
      name: string;
      phone: string | null;
      phoneE164: string | null;
      notes: string | null;
      nextActionAt: string | null;
      status: LeadStatus;
      updatedAt: string;
      agent: string;
      activity: { type: typeof CORRECTION_ACTIVITY_TYPE; content: string } | null;
    }
  | { ok: false; reason: "not_found" | "conflict" | "invalid_phone" | "error"; message: string };

/**
 * Aplica el plan de corrección al lead de este owner. Si el teléfono nuevo
 * cae en el `dedupe_key` de otro lead del mismo owner, no escribe nada.
 */
export async function correctLeadForAutomation(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  agent: string,
  input: LeadCorrectionInput,
): Promise<CorrectLeadResult> {
  const { data, error } = await admin
    .from("leads")
    .select("id, name, phone, notes, next_action_at, status, updated_at, dedupe_key, website, city, source_url")
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: "No se pudo leer el lead." };
  if (!data) return { ok: false, reason: "not_found", message: "Lead no encontrado." };

  const planned = planLeadCorrection(
    {
      phone: data.phone,
      notes: data.notes,
      nextActionAt: data.next_action_at,
      dedupeKey: data.dedupe_key,
      name: data.name,
      website: data.website,
      city: data.city,
      sourceUrl: data.source_url,
    },
    input,
    agent,
  );
  if (!planned.ok) return { ok: false, reason: "invalid_phone", message: planned.message };

  const { plan } = planned;
  if (plan.nextDedupeKey) {
    const clash = await admin
      .from("leads")
      .select("id, name")
      .eq("owner_id", ownerId)
      .eq("dedupe_key", plan.nextDedupeKey)
      .maybeSingle();
    if (clash.error) return { ok: false, reason: "error", message: "No se pudo guardar." };
    if (clash.data && clash.data.id !== leadId) {
      return { ok: false, reason: "conflict", message: `Ese teléfono ya está en "${clash.data.name}".` };
    }
  }

  // La nota va antes del update para que un fallo del insert no deje el lead
  // cambiado sin rastro. Si el update falla después, se borra la nota: el
  // agente puede reintentar el mismo body sin duplicar el historial.
  let activityId: string | null = null;
  if (plan.activity) {
    const inserted = await admin
      .from("lead_activities")
      .insert({
        owner_id: ownerId,
        lead_id: leadId,
        type: CORRECTION_ACTIVITY_TYPE,
        content: plan.activity,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return { ok: false, reason: "error", message: "No se pudo anotar el cambio en el historial." };
    }
    activityId = inserted.data.id;
  }

  const rollbackActivity = async () => {
    if (!activityId) return;
    await admin.from("lead_activities").delete().eq("id", activityId).eq("owner_id", ownerId).eq("lead_id", leadId);
  };

  let phone = data.phone;
  let notes = data.notes;
  let nextActionAt = data.next_action_at;
  let updatedAt = data.updated_at;
  let status = data.status;

  if (plan.columns) {
    const updated = await admin
      .from("leads")
      .update(plan.columns)
      .eq("id", leadId)
      .eq("owner_id", ownerId)
      .select("phone, notes, next_action_at, status, updated_at");
    if (updated.error) {
      await rollbackActivity();
      if (updated.error.code === "23505") {
        return { ok: false, reason: "conflict", message: "Ese teléfono ya está en otro lead." };
      }
      return { ok: false, reason: "error", message: "No se pudo guardar." };
    }
    const row = updated.data?.[0];
    if (!row) {
      await rollbackActivity();
      return { ok: false, reason: "not_found", message: "Lead no encontrado." };
    }
    phone = row.phone;
    notes = row.notes;
    nextActionAt = row.next_action_at;
    status = row.status;
    updatedAt = row.updated_at;
  }

  return {
    ok: true,
    changed: Boolean(plan.activity || plan.columns),
    id: data.id,
    name: data.name,
    phone,
    phoneE164: normalizePhone(phone),
    notes,
    nextActionAt,
    status,
    updatedAt,
    agent,
    activity: plan.activity ? { type: CORRECTION_ACTIVITY_TYPE, content: plan.activity } : null,
  };
}
