import { MessageSquareReply } from "lucide-react";
import Link from "next/link";

import { EmptyLine } from "@/components/leads/ui/feedback";
import { Chip, StatusBadge } from "@/components/leads/ui/status-badge";
import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import type { FollowUpQueueLead } from "@/lib/leads/queries";
import { STATUS_LABEL, STATUS_TEMPERATURE_GROUP } from "@/lib/leads/status";

/** A partir de acá un lead contactado se marca como "frío" en la lista. */
const COLD_AFTER_DAYS = 7;

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function lastContactLabel(lead: FollowUpQueueLead): string {
  if (!lead.last_contacted_at) return "—";
  const days = daysSince(lead.last_contacted_at);
  if (days === 0) return "Hoy";
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

function waitingLabel(lead: FollowUpQueueLead): string {
  if (!lead.next_action_at) return "En espera";
  const days = Math.max(1, Math.ceil((new Date(lead.next_action_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const date = new Date(lead.next_action_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
  return `Próximo seguimiento en ${days} ${days === 1 ? "día" : "días"} (${date})`;
}

function reasonLabel(lead: FollowUpQueueLead): string {
  if (lead.waiting) return waitingLabel(lead);
  if (lead.overdue && lead.next_action_at) {
    const days = daysSince(lead.next_action_at);
    return days === 0 ? "Fecha de retomar: hoy" : `Retomar vencido hace ${days} ${days === 1 ? "día" : "días"}`;
  }
  if (lead.last_contacted_at && daysSince(lead.last_contacted_at) >= COLD_AFTER_DAYS) return "Sin novedades";
  return "En curso";
}

function QueueTable({ leads }: { leads: FollowUpQueueLead[] }) {
  return (
    <Table>
      <thead>
        <Tr>
          <Th>Lead</Th>
          <Th>Rubro</Th>
          <Th>Estado</Th>
          <Th>Último contacto</Th>
          <Th>Motivo</Th>
          <Th>
            <span className="sr-only">Acción</span>
          </Th>
        </Tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const cold = !lead.waiting && (lead.overdue || (lead.last_contacted_at ? daysSince(lead.last_contacted_at) >= COLD_AFTER_DAYS : false));
          return (
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
              <Td className="text-lm-ink-2">{lastContactLabel(lead)}</Td>
              <Td className={cold ? "text-lm-signal-text" : "text-lm-ink-2"}>{reasonLabel(lead)}</Td>
              <Td>
                <Link href={`/leads/${lead.id}?modo=seguimiento`} className="text-xs text-lm-signal-text hover:underline">
                  Hacer seguimiento
                </Link>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * Cuerpo de `/leads/seguimiento` (Plan §1.20): prospecciones abiertas — leads
 * ya contactados y sin cerrar. Arriba, los que toca atender (más estancados
 * primero); abajo, "En espera": los que ya recibieron su seguimiento y tienen
 * una fecha de próxima acción a futuro. Cada fila lleva a la ficha, donde el
 * modo "Seguimiento" del composer arma el mensaje desde toda la información.
 */
export function FollowUpQueue({ leads }: { leads: FollowUpQueueLead[] }) {
  const due = leads.filter((lead) => !lead.waiting);
  const waiting = leads
    .filter((lead) => lead.waiting)
    .sort((a, b) => new Date(a.next_action_at ?? 0).getTime() - new Date(b.next_action_at ?? 0).getTime());

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-lm-sans text-sm font-semibold text-lm-ink">
          <MessageSquareReply className="size-4 text-lm-signal" strokeWidth={1.5} />
          Para atender
          <span className="font-mono text-xs font-normal text-lm-ink-3">({due.length})</span>
        </h2>
        {due.length === 0 ? (
          <EmptyLine>
            {leads.length === 0
              ? "No hay prospecciones abiertas: ningún lead contactado sigue sin cerrar."
              : "Nada para atender ahora: todos tus leads tienen un próximo seguimiento programado."}
          </EmptyLine>
        ) : (
          <QueueTable leads={due} />
        )}
      </section>

      {waiting.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-lm-sans text-sm font-semibold text-lm-ink">
            En espera
            <span className="font-mono text-xs font-normal text-lm-ink-3">({waiting.length})</span>
          </h2>
          <p className="text-[13px] text-lm-ink-2">Ya les hiciste el seguimiento; vuelven a «Para atender» cuando llegue la fecha, o antes si responden.</p>
          <QueueTable leads={waiting} />
        </section>
      ) : null}
    </div>
  );
}
