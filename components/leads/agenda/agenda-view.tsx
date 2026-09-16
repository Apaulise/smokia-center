"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { AppointmentDialog } from "@/components/leads/agenda/appointment-dialog";
import { AppointmentsList } from "@/components/leads/agenda/appointments-list";
import { CalendarGrid } from "@/components/leads/agenda/calendar-grid";
import { IcsExportButton } from "@/components/leads/agenda/ics-export-button";
import { Button } from "@/components/ui/button";
import type { AppointmentWithLead } from "@/lib/leads/queries";

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
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <IcsExportButton />
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-3.5" />
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
          mode={view}
          days={days}
          appointments={appointments}
          currentMonth={currentMonth}
          today={today}
          onCreateAt={(dateIso) => setDialog({ mode: "create", defaultStartsAt: `${dateIso}T09:00` })}
          onEdit={(appointment) => setDialog({ mode: "edit", appointment })}
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
