"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AppointmentDialog } from "@/components/leads/agenda/appointment-dialog";
import { AppointmentsList } from "@/components/leads/agenda/appointments-list";
import { CalendarGrid, type CalendarMove } from "@/components/leads/agenda/calendar-grid";
import { IcsExportButton } from "@/components/leads/agenda/ics-export-button";
import { Button } from "@/components/leads/ui/button";
import { moveAppointment } from "@/lib/leads/actions";
import type { AppointmentStatus } from "@/lib/leads/appointments";
import { isoDateOf, timeOfDay } from "@/lib/leads/calendar";
import type { AppointmentWithLead } from "@/lib/leads/queries";
import { cn } from "@/lib/utils";

/** Punto de color del chip (Design System, tabla "Estados del pipeline"): agrupa por temperatura, nunca decorativo. */
const STATUS_DOT: Record<AppointmentStatus, string> = {
  AGENDADA: "bg-lm-info",
  CONFIRMADA: "bg-lm-signal",
  REALIZADA: "bg-lm-success",
  NO_ASISTIO: "bg-lm-smoke-4",
  CANCELADA: "bg-lm-danger",
};

// Funciones de módulo (no inline) para que la grilla pueda memoizar sobre ellas.
const appointmentDay = (appointment: AppointmentWithLead) => isoDateOf(appointment.starts_at);
const appointmentTime = (appointment: AppointmentWithLead) => timeOfDay(appointment.starts_at);

function AppointmentChip(appointment: AppointmentWithLead) {
  return (
    <>
      <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[appointment.status])} />
      <span className="truncate text-lm-ink">
        <span className="font-mono tabular-nums text-lm-ink-3">{timeOfDay(appointment.starts_at)}</span> {appointment.title}
      </span>
    </>
  );
}

type DialogState =
  | { mode: "create"; defaultStartsAt?: string }
  | { mode: "edit"; appointment: AppointmentWithLead }
  | null;

/** Contenedor con estado de /leads/agenda: coordina el diálogo de turno entre la grilla, la lista y "Nuevo turno". */
export function AgendaView({
  view,
  days,
  currentMonth,
  today,
  appointments,
  leads,
}: {
  view: "mes" | "semana" | "lista";
  days: string[];
  currentMonth?: string;
  today: string;
  appointments: AppointmentWithLead[];
  leads: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [, startTransition] = useTransition();

  /** Soltar un turno en otro día: conserva la hora. Un arrastre sin hora (de afuera de la grilla) no aplica acá. */
  function handleMove({ id, dateIso, time }: CalendarMove) {
    if (!time) return;
    const newStartsAtIso = new Date(`${dateIso}T${time}:00-03:00`).toISOString();
    startTransition(async () => {
      await moveAppointment(id, newStartsAtIso);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <IcsExportButton />
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          Nuevo turno
        </Button>
      </div>

      {view === "lista" ? (
        <AppointmentsList
          appointments={appointments}
          onEdit={(appointment) => setDialog({ mode: "edit", appointment })}
        />
      ) : (
        <CalendarGrid
          variant="signal"
          mode={view}
          days={days}
          items={appointments}
          getDay={appointmentDay}
          getDragTime={appointmentTime}
          renderChip={AppointmentChip}
          currentMonth={currentMonth}
          today={today}
          onCreateAt={(dateIso) => setDialog({ mode: "create", defaultStartsAt: `${dateIso}T09:00` })}
          onEdit={(appointment) => setDialog({ mode: "edit", appointment })}
          onMove={handleMove}
        />
      )}

      {dialog ? (
        <AppointmentDialog
          mode={dialog.mode}
          appointment={dialog.mode === "edit" ? dialog.appointment : undefined}
          leads={leads}
          defaultStartsAt={dialog.mode === "create" ? dialog.defaultStartsAt : undefined}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
