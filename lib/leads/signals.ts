import type { LeadSignalRow } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Ciclo de vida de dolores, objeciones y señales de compra (Plan §1.13, SPA
 * §5): HIPOTESIS → SOSPECHADO → CONFIRMADO. `evidence` es obligatoria para
 * llegar a CONFIRMADO, y esa exigencia se valida acá, en TypeScript — el
 * modelo no tiene forma de saltearla.
 */

export type LeadSignalKind = Database["public"]["Enums"]["lead_signal_kind"];
export type LeadSignalStatus = Database["public"]["Enums"]["lead_signal_status"];

const STATUS_RANK: Record<LeadSignalStatus, number> = { HIPOTESIS: 0, SOSPECHADO: 1, CONFIRMADO: 2 };

/** Sin cita textual, CONFIRMADO no es alcanzable — se cae a SOSPECHADO, nunca se descarta la señal entera. */
export function clampSignalStatus(status: LeadSignalStatus, evidence: string | null | undefined): LeadSignalStatus {
  if (status === "CONFIRMADO" && !evidence?.trim()) return "SOSPECHADO";
  return status;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export interface SignalPatch {
  kind: LeadSignalKind;
  status: LeadSignalStatus;
  title: string;
  description: string | null;
  evidence: string | null;
  businessImpact: string | null;
  triggerEvent: string | null;
  timing: string | null;
  alreadySolved: boolean;
}

export type SignalWrite =
  | ({ action: "insert" } & Omit<SignalPatch, "businessImpact" | "triggerEvent" | "alreadySolved"> & {
        business_impact: string | null;
        trigger_event: string | null;
        already_solved: boolean;
      })
  | ({ action: "update"; id: string } & Omit<SignalPatch, "businessImpact" | "triggerEvent" | "alreadySolved"> & {
        business_impact: string | null;
        trigger_event: string | null;
        already_solved: boolean;
      });

/**
 * Decide, para cada señal que devolvió el analizador (§1.12), si corresponde
 * insertar una fila nueva o actualizar una existente — matcheando por
 * (kind, título normalizado). Sin match, se inserta: es más seguro un
 * duplicado ocasional que pisar la señal equivocada.
 *
 * El estado **nunca retrocede** acá tampoco (mismo criterio que el
 * CRMStateEngine, §1.8): si la señal ya estaba CONFIRMADA y esta vuelta
 * sugiere HIPOTESIS, gana la CONFIRMADA. Los campos de texto sólo se
 * actualizan si el analizador mandó algo nuevo; si no, se conserva lo que ya
 * había.
 */
export function planSignalWrites(existing: LeadSignalRow[], patches: SignalPatch[]): SignalWrite[] {
  return patches.map((patch) => {
    const clampedStatus = clampSignalStatus(patch.status, patch.evidence);
    const match = existing.find((row) => row.kind === patch.kind && normalizeTitle(row.title) === normalizeTitle(patch.title));

    if (!match) {
      return {
        action: "insert",
        kind: patch.kind,
        status: clampedStatus,
        title: patch.title,
        description: patch.description,
        evidence: patch.evidence,
        business_impact: patch.businessImpact,
        trigger_event: patch.triggerEvent,
        timing: patch.timing,
        already_solved: patch.alreadySolved,
      };
    }

    const finalStatus = STATUS_RANK[clampedStatus] > STATUS_RANK[match.status] ? clampedStatus : match.status;
    return {
      action: "update",
      id: match.id,
      kind: patch.kind,
      status: finalStatus,
      title: patch.title,
      description: patch.description ?? match.description,
      evidence: patch.evidence ?? match.evidence,
      business_impact: patch.businessImpact ?? match.business_impact,
      trigger_event: patch.triggerEvent ?? match.trigger_event,
      timing: patch.timing ?? match.timing,
      already_solved: patch.alreadySolved || match.already_solved,
    };
  });
}

export type SignalSnapshot = Pick<LeadSignalRow, "kind" | "status" | "title" | "evidence">;

/** Input directo para el CRMStateEngine (§1.8): ¿hay al menos un dolor CONFIRMADO? */
export function hasConfirmedPain(signals: SignalSnapshot[]): boolean {
  return signals.some((signal) => signal.kind === "DOLOR" && signal.status === "CONFIRMADO");
}
