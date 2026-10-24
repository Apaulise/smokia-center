import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppointmentStatus } from "@/lib/leads/appointments";
import { leadPlanningColumns, type LeadPlanningPatch } from "@/lib/leads/planning";
import type { LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Núcleo compartido de "registrar un contacto", "cambiar de estado" y
 * "guardar notas / próxima acción".
 *
 * Lo usan las Server Actions de la ficha (`lib/leads/actions.ts`, con el
 * cliente con RLS del usuario logueado) y la API de automatización
 * (`app/api/automation/*`, con el cliente service role). Recibe el cliente y
 * el `ownerId` explícitos y filtra por `owner_id` en cada query: con RLS es
 * redundante, con service role es lo único que aísla a un usuario del otro
 * (CLAUDE.md §4).
 */

export type { LeadPlanningPatch };
export type LeadsClient = SupabaseClient<Database>;

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];
type ContactActivityType = Extract<Database["public"]["Enums"]["lead_activity_type"], "WHATSAPP" | "EMAIL" | "LLAMADA" | "NOTA" | "REUNION">;

/**
 * REUNION_AGENDADA y REUNION_REALIZADA sólo los pone la agenda
 * (stage-engine.ts, Plan §1.5): un cambio manual a uno de estos dos sin un
 * turno real cargado en `appointments` dejaría el pipeline (y el dashboard)
 * contando reuniones que no existen.
 */
export const MEETING_STATUS_GATE: Partial<Record<LeadStatus, AppointmentStatus[]>> = {
  REUNION_AGENDADA: ["AGENDADA", "CONFIRMADA", "REALIZADA"],
  REUNION_REALIZADA: ["REALIZADA"],
};

export function meetingGateMessage(status: LeadStatus): string {
  return status === "REUNION_REALIZADA"
    ? "No se puede marcar como reunión realizada: este lead no tiene ningún turno marcado como Realizada en la agenda. Andá a Agenda → Lista, marcá el turno como Realizada y el lead avanza solo."
    : "No se puede pasar a reunión agendada: este lead no tiene ningún turno cargado en la agenda. Agendalo primero desde la ficha del lead.";
}

/** IDs de `leadIds` con al menos un turno en `appointments` cuyo estado está en `statuses`. */
export async function leadIdsWithAppointment(
  supabase: LeadsClient,
  leadIds: string[],
  statuses: AppointmentStatus[],
  ownerId?: string,
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  let query = supabase.from("appointments").select("lead_id").in("lead_id", leadIds).in("status", statuses);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data } = await query;
  return new Set((data ?? []).map((row) => row.lead_id).filter((id): id is string => id !== null));
}

/** `true` si el lead puede pasar a `status` (gate de reuniones de arriba). */
export async function passesMeetingGate(
  supabase: LeadsClient,
  leadId: string,
  status: LeadStatus,
  ownerId?: string,
): Promise<boolean> {
  const requiredStatuses = MEETING_STATUS_GATE[status];
  if (!requiredStatuses) return true;
  const withAppointment = await leadIdsWithAppointment(supabase, [leadId], requiredStatuses, ownerId);
  return withAppointment.has(leadId);
}

export type StatusChangeResult =
  | { ok: true; changed: boolean; fromStatus: LeadStatus; toStatus: LeadStatus }
  | { ok: false; reason: "not_found" | "gate" | "error"; message: string };

/**
 * Cambio de estado con su `CAMBIO_ESTADO` en el timeline, y el gate de
 * reuniones. Es el cuerpo de `updateLeadStatus` (tabla y kanban).
 */
export async function applyLeadStatusChange(
  supabase: LeadsClient,
  ownerId: string,
  leadId: string,
  status: LeadStatus,
): Promise<StatusChangeResult> {
  const { data: current } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!current) return { ok: false, reason: "not_found", message: "No se encontró el lead." };
  if (current.status === status) return { ok: true, changed: false, fromStatus: current.status, toStatus: status };

  if (!(await passesMeetingGate(supabase, leadId, status, ownerId))) {
    return { ok: false, reason: "gate", message: meetingGateMessage(status) };
  }

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId).eq("owner_id", ownerId);
  if (error) return { ok: false, reason: "error", message: "No se pudo cambiar el estado." };

  await supabase.from("lead_activities").insert({
    owner_id: ownerId,
    lead_id: leadId,
    type: "CAMBIO_ESTADO",
    from_status: current.status,
    to_status: status,
  });

  return { ok: true, changed: true, fromStatus: current.status, toStatus: status };
}

export type RecordContactResult =
  | { ok: true; newStatus: LeadStatus | null; lastContactedAt: string }
  | { ok: false; message: string };

/**
 * Registra el resultado de una acción de contacto (Plan §1.3): la actividad
 * en el timeline —con `from_status`/`to_status` si además cambia de estado,
 * igual que siempre lo hizo la ficha— y, en el mismo paso, `last_contacted_at`,
 * el estado nuevo y la próxima acción en el lead.
 *
 * No busca el lead: el llamador ya lo leyó (y así sabe que es del owner) y
 * pasa su estado actual.
 */
export async function recordLeadContact(
  supabase: LeadsClient,
  ownerId: string,
  input: {
    leadId: string;
    currentStatus: LeadStatus;
    type: ContactActivityType;
    content?: string | null;
    newStatus?: LeadStatus | null;
    nextActionAt?: string | null;
  },
): Promise<RecordContactResult> {
  const newStatus = input.newStatus && input.newStatus !== input.currentStatus ? input.newStatus : null;

  const { error: activityError } = await supabase.from("lead_activities").insert({
    owner_id: ownerId,
    lead_id: input.leadId,
    type: input.type,
    content: input.content || null,
    from_status: newStatus ? input.currentStatus : null,
    to_status: newStatus,
  });
  if (activityError) return { ok: false, message: "No se pudo registrar la actividad." };

  const lastContactedAt = new Date().toISOString();
  const update: LeadUpdate = { last_contacted_at: lastContactedAt };
  if (newStatus) update.status = newStatus;
  if (input.nextActionAt) update.next_action_at = new Date(input.nextActionAt).toISOString();

  await supabase.from("leads").update(update).eq("id", input.leadId).eq("owner_id", ownerId);

  return { ok: true, newStatus, lastContactedAt };
}

export type UpdateLeadPlanningResult =
  | {
      ok: true;
      id: string;
      notes: string | null;
      nextActionAt: string | null;
      status: LeadStatus;
      updatedAt: string;
    }
  | { ok: false; reason: "not_found" | "empty" | "error"; message: string };

/**
 * Escribe `notes` y/o `next_action_at`. No cambia `status`, no toca
 * `last_contacted_at` y no inserta filas en `lead_activities` ni en
 * `lead_messages`.
 *
 * La ficha (`updateLeadNotes`) lo usa y, si hubo una nota nueva, deja además
 * una actividad `NOTA`. El PATCH de la API de automatización no pasa por acá:
 * corrige teléfono, nota y próxima acción en `lib/automation/correct-lead.ts`.
 */
export async function updateLeadPlanning(
  supabase: LeadsClient,
  ownerId: string,
  leadId: string,
  patch: LeadPlanningPatch,
): Promise<UpdateLeadPlanningResult> {
  const columns = leadPlanningColumns(patch);
  if (!columns) return { ok: false, reason: "empty", message: "Nada para actualizar." };

  const { data, error } = await supabase
    .from("leads")
    .update(columns)
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .select("id, notes, next_action_at, status, updated_at");

  if (error) return { ok: false, reason: "error", message: "No se pudo guardar." };
  // RLS (o el filtro de owner) no es un error de Postgres: cero filas quiere
  // decir que no se escribió nada. Sin este chequeo se reporta éxito en vacío.
  const row = data?.[0];
  if (!row) return { ok: false, reason: "not_found", message: "Lead no encontrado." };

  return {
    ok: true,
    id: row.id,
    notes: row.notes,
    nextActionAt: row.next_action_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}
