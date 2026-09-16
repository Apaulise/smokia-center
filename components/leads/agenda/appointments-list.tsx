"use client";

import { CalendarClock, Link as LinkIcon, Pencil } from "lucide-react";
import Link from "next/link";

import { AppointmentStatusSelect } from "@/components/leads/agenda/appointment-status-select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AppointmentWithLead } from "@/lib/leads/queries";

/** "Lista de próximos turnos" (Plan §1.5). */
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
        icon={<CalendarClock className="size-5" />}
        title="No hay turnos próximos"
        description="Agendá una reunión desde acá o desde la ficha de un lead."
      />
    );
  }

  return (
    <ul className="divide-y divide-line/40 rounded-[20px] border border-line bg-elevated/70">
      {appointments.map((appt) => (
        <li key={appt.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          {/* suppressHydrationWarning: "es-AR" con timeStyle "short" formatea el
              a. m./p. m. con un espacio distinto entre el ICU de Node (SSR) y el
              del navegador — inofensivo, el texto final es idéntico. */}
          <time className="tabular w-36 shrink-0 text-sm text-muted" suppressHydrationWarning>
            {new Date(appt.starts_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
          </time>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{appt.title}</p>
            {appt.leads ? (
              <Link href={`/leads/${appt.leads.id}`} className="truncate text-xs text-cyan hover:underline">
                {appt.leads.name}
              </Link>
            ) : null}
          </div>

          {appt.meeting_url ? (
            <a
              href={appt.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-cyan"
              aria-label="Link de la reunión"
            >
              <LinkIcon className="size-3.5" />
            </a>
          ) : null}

          <AppointmentStatusSelect appointment={appt} />

          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(appt)} aria-label="Editar turno">
            <Pencil className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
