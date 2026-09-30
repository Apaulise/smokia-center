import { AlarmClockOff, Clock } from "lucide-react";
import Link from "next/link";

import { EmptyLine } from "@/components/leads/ui/feedback";
import { Chip, StatusBadge } from "@/components/leads/ui/status-badge";
import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import type { FollowUpQueueLead } from "@/lib/leads/queries";
import { STATUS_LABEL, STATUS_TEMPERATURE_GROUP } from "@/lib/leads/status";

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function overdueReason(lead: FollowUpQueueLead): string {
  if (!lead.next_action_at) return "Seguimiento vencido";
  const days = daysSince(lead.next_action_at);
  return days === 0 ? "Vence hoy" : `Vencido hace ${days} ${days === 1 ? "día" : "días"}`;
}

function staleReason(lead: FollowUpQueueLead): string {
  const since = lead.last_contacted_at ?? lead.created_at;
  const days = daysSince(since);
  return lead.last_contacted_at ? `${days} d sin contacto` : `${days} d sin tocar`;
}

function QueueTable({ leads, reason }: { leads: FollowUpQueueLead[]; reason: (lead: FollowUpQueueLead) => string }) {
  return (
    <Table>
      <thead>
        <Tr>
          <Th>Lead</Th>
          <Th>Rubro</Th>
          <Th>Estado</Th>
          <Th>Motivo</Th>
        </Tr>
      </thead>
      <tbody>
        {leads.map((lead) => (
          <Tr key={lead.id}>
            <Td>
              <Link href={`/leads/${lead.id}`} className="font-medium text-lm-ink hover:text-lm-signal-text">
                {lead.name}
              </Link>
            </Td>
            <Td>{lead.industries ? <Chip color={lead.industries.color ?? undefined}>{lead.industries.name}</Chip> : "—"}</Td>
            <Td>
              <StatusBadge group={STATUS_TEMPERATURE_GROUP[lead.status]}>{STATUS_LABEL[lead.status]}</StatusBadge>
            </Td>
            <Td className="text-lm-ink-2">{reason(lead)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

/**
 * Cuerpo de `/leads/seguimiento` (Plan §1.20): separa lo que tiene una fecha
 * de retomar ya cumplida (típicamente un `AHORA_NO`, SPA §18) de lo que
 * nunca se tocó o se dejó enfriar — son dos preguntas distintas ("¿a quién
 * le prometí volver?" vs. "¿a quién me olvidé?") y mezclarlas en una sola
 * lista las vuelve a las dos más difíciles de barrer de un vistazo.
 */
export function FollowUpQueue({ leads }: { leads: FollowUpQueueLead[] }) {
  const overdue = [...leads.filter((lead) => lead.overdue)].sort(
    (a, b) => new Date(a.next_action_at ?? 0).getTime() - new Date(b.next_action_at ?? 0).getTime(),
  );
  const stale = leads.filter((lead) => !lead.overdue);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-lm-sans text-sm font-semibold text-lm-ink">
          <AlarmClockOff className="size-4 text-lm-signal" strokeWidth={1.5} />
          Seguimiento vencido
          <span className="font-mono text-xs font-normal text-lm-ink-3">({overdue.length})</span>
        </h2>
        {overdue.length === 0 ? (
          <EmptyLine>No hay ningún seguimiento con fecha vencida.</EmptyLine>
        ) : (
          <QueueTable leads={overdue} reason={overdueReason} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-lm-sans text-sm font-semibold text-lm-ink">
          <Clock className="size-4 text-lm-ink-3" strokeWidth={1.5} />
          Sin contactar
          <span className="font-mono text-xs font-normal text-lm-ink-3">({stale.length})</span>
        </h2>
        {stale.length === 0 ? (
          <EmptyLine>Todos los leads activos tienen seguimiento al día.</EmptyLine>
        ) : (
          <QueueTable leads={stale} reason={staleReason} />
        )}
      </section>
    </div>
  );
}
