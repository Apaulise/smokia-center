import type { LeadMessageRow } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";

type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

/**
 * `lead_messages` y `lead_activities` mezclados por tiempo en un solo hilo
 * (Plan §1.15): el timeline existente sigue siendo la fuente de verdad de los
 * cambios de estado (Plan §1.12) — esto sólo los intercala para lectura, no
 * reemplaza ninguna de las dos tablas.
 */
export type ThreadItem =
  | { kind: "message"; occurredAt: string; message: LeadMessageRow }
  | { kind: "activity"; occurredAt: string; activity: LeadActivityRow };

export function mergeConversation(messages: LeadMessageRow[], activities: LeadActivityRow[]): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((message): ThreadItem => ({ kind: "message", occurredAt: message.occurred_at, message })),
    ...activities.map((activity): ThreadItem => ({ kind: "activity", occurredAt: activity.occurred_at, activity })),
  ];
  return items.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}
