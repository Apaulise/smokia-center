import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";

const INDEX = new Map<LeadStatus, number>(LEAD_STATUSES.map((status, index) => [status, index]));

/**
 * El próximo estado si `target` está más adelante en el pipeline, o `null` si
 * quedarse donde está. Un lead en propuesta o cerrado no vuelve a "respondió"
 * porque llegó un webhook viejo.
 */
export function forwardStatus(current: LeadStatus, target: LeadStatus): LeadStatus | null {
  const from = INDEX.get(current);
  const to = INDEX.get(target);
  if (from === undefined || to === undefined) return null;
  return to > from ? target : null;
}
