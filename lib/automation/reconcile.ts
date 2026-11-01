import { addDaysIso, BUSINESS_TIME_ZONE, isoDateToUtcInstant } from "@/lib/leads/calendar";
import { publicOutboundKind, readOpeningMeta } from "@/lib/leads/opening-meta";
import { interestLevelOf, responseTypeOf } from "@/lib/weekly/compute";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` de calendario, o null si el día no existe. */
export function parseReconcileDate(value: string | null): string | null {
  if (!value || !DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return value;
}

export interface ReconcileSourceMessage {
  id: string;
  leadId: string;
  sender: "VENDEDOR" | "LEAD";
  channel: string;
  kind: string | null;
  content: string;
  analysis: unknown;
  confirmed: boolean;
  occurredAt: string;
}

export interface ReconcileSourceLead {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

export interface ReconcileMessage {
  id: string;
  channel: string;
  /** APERTURA_M2 cuando la fila es el segundo mensaje de la apertura. */
  kind: string | null;
  part: 1 | 2 | null;
  type: string | null;
  variant: string | null;
  content: string;
  occurredAt: string;
  responseType: "HUMANA" | "AUTORESPUESTA" | null;
  interestLevel: number | null;
}

/**
 * Un día de Argentina, partido por lead. Los borradores del vendedor no
 * salen: no se mandaron. Un mensaje del lead entra aunque `confirmed` sea
 * false, igual que el panel.
 */
export function buildReconcile(date: string, leads: readonly ReconcileSourceLead[], messages: readonly ReconcileSourceMessage[]) {
  const visible = messages.filter((message) => message.sender === "LEAD" || message.confirmed);
  const byLead = new Map<string, ReconcileSourceMessage[]>();
  for (const message of visible) {
    const list = byLead.get(message.leadId);
    if (list) list.push(message);
    else byLead.set(message.leadId, [message]);
  }
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const groups = [...byLead.entries()].map(([leadId, rows]) => {
    const sorted = [...rows].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const lead = leadById.get(leadId);
    const outgoing: ReconcileMessage[] = [];
    const incoming: ReconcileMessage[] = [];
    for (const row of sorted) {
      const meta = readOpeningMeta(row.analysis);
      const item: ReconcileMessage = {
        id: row.id,
        channel: row.channel,
        kind: row.sender === "VENDEDOR" ? publicOutboundKind(row.kind, row.analysis) : row.kind,
        part: meta.part,
        type: meta.type,
        variant: meta.variant,
        content: row.content,
        occurredAt: row.occurredAt,
        responseType: row.sender === "LEAD" ? responseTypeOf(row.analysis) : null,
        interestLevel: row.sender === "LEAD" ? interestLevelOf(row.analysis) : null,
      };
      if (row.sender === "LEAD") incoming.push(item);
      else outgoing.push(item);
    }
    return {
      id: leadId,
      name: lead?.name?.trim() || "Sin nombre",
      phone: lead?.phone ?? null,
      status: lead?.status ?? null,
      firstAt: sorted[0]?.occurredAt ?? "",
      outgoing,
      incoming,
    };
  });

  groups.sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt) || a.name.localeCompare(b.name, "es"));

  return {
    date,
    timezone: BUSINESS_TIME_ZONE,
    from: isoDateToUtcInstant(date),
    to: isoDateToUtcInstant(addDaysIso(date, 1)),
    totals: {
      leads: groups.length,
      outgoing: groups.reduce((sum, lead) => sum + lead.outgoing.length, 0),
      incoming: groups.reduce((sum, lead) => sum + lead.incoming.length, 0),
    },
    leads: groups.map((group) => ({
      id: group.id,
      name: group.name,
      phone: group.phone,
      status: group.status,
      outgoing: group.outgoing,
      incoming: group.incoming,
    })),
  };
}
