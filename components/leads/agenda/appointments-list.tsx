"use client";

import { CalendarClock, Link as LinkIcon, Pencil } from "lucide-react";
import Link from "next/link";

import { AppointmentStatusSelect } from "@/components/leads/agenda/appointment-status-select";
import { IconButton } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import type { AppointmentWithLead } from "@/lib/leads/queries";

/** "Lista de próximos turnos" (Plan §1.5, Design System §05 vista Lista). */
export function AppointmentsList({
  appointments,
  onEdit,
}: {
  appointments: AppointmentWithLead[];
  onEdit: (appointment: AppointmentWithLead) => void;
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-5" strokeWidth={1.5} />}
        title="No hay turnos próximos"
        description="Agendá una reunión desde acá o desde la ficha de un lead."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-lm-line rounded-lm-lg border border-lm-line-strong bg-lm-surface">
      {appointments.map((appt) => (
        <li key={appt.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          {/* suppressHydrationWarning: "es-AR" con timeStyle "short" formatea el
              a. m./p. m. con un espacio distinto entre el ICU de Node (SSR) y el
              del navegador — inofensivo, el texto final es idéntico. */}
          <time className="w-36 shrink-0 font-mono text-[13px] tabular-nums text-lm-ink-3" suppressHydrationWarning>
            {new Date(appt.starts_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
          </time>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-lm-ink">{appt.title}</p>
            {appt.leads ? (
              <Link href={`/leads/${appt.leads.id}`} className="truncate text-xs text-lm-signal-text hover:underline">
                {appt.leads.name}
              </Link>
            ) : null}
          </div>

          {appt.meeting_url ? (
            <a
              href={appt.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="text-lm-ink-3 hover:text-lm-ink"
              aria-label="Link de la reunión"
            >
              <LinkIcon className="size-3.5" strokeWidth={1.5} />
            </a>
          ) : null}

          <AppointmentStatusSelect appointment={appt} />

          <IconButton onClick={() => onEdit(appt)} aria-label="Editar turno" size="sm">
            <Pencil className="size-3.5" strokeWidth={1.5} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
