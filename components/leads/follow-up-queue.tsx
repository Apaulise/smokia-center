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

function reasonLabel(lead: FollowUpQueueLead): string {
  if (lead.overdue && lead.next_action_at) {
    const days = daysSince(lead.next_action_at);
    return days === 0 ? "Fecha de retomar: hoy" : `Retomar vencido hace ${days} ${days === 1 ? "día" : "días"}`;
  }
  if (lead.last_contacted_at && daysSince(lead.last_contacted_at) >= COLD_AFTER_DAYS) return "Sin novedades";
  return "En curso";
}

/**
 * Cuerpo de `/leads/seguimiento` (Plan §1.20): todas las prospecciones
 * abiertas — leads ya contactados y sin cerrar — con las más estancadas
 * primero. Cada fila lleva a la ficha, donde el modo "Seguimiento" del composer
 * arma el mensaje desde toda la información del lead.
 */
export function FollowUpQueue({ leads }: { leads: FollowUpQueueLead[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-lm-sans text-sm font-semibold text-lm-ink">
        <MessageSquareReply className="size-4 text-lm-signal" strokeWidth={1.5} />
        Prospecciones abiertas
        <span className="font-mono text-xs font-normal text-lm-ink-3">({leads.length})</span>
      </h2>
      {leads.length === 0 ? (
        <EmptyLine>No hay prospecciones abiertas: ningún lead contactado sigue sin cerrar.</EmptyLine>
      ) : (
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
              const cold = lead.overdue || (lead.last_contacted_at ? daysSince(lead.last_contacted_at) >= COLD_AFTER_DAYS : false);
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
      )}
    </section>
  );
}
