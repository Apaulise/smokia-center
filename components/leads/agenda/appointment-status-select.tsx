"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Select } from "@/components/leads/ui/field";
import { markAppointmentDone, updateAppointmentStatus } from "@/lib/leads/actions";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from "@/lib/leads/appointments";
import type { AppointmentWithLead } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * Control de estado inline (lista y chips de mes/semana). Marcar "Realizada"
 * con un lead asociado ofrece avanzar su estado en el mismo paso (Plan §1.5),
 * sin abrir el formulario completo de edición.
 */
export function AppointmentStatusSelect({
  appointment,
  className,
}: {
  appointment: AppointmentWithLead;
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(appointment.status);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleChange(next: AppointmentStatus) {
    if (next === "REALIZADA" && appointment.lead_id) {
      setConfirmOpen(true);
      return;
    }
    setStatus(next);
    startTransition(async () => {
      await updateAppointmentStatus(appointment.id, next);
      router.refresh();
    });
  }

  return (
    <>
      <Select
        className={cn("h-8 w-40 text-xs", className)}
        value={status}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value as AppointmentStatus)}
      >
        {APPOINTMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APPOINTMENT_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>

      {confirmOpen ? (
        <MarkDoneDialog
          appointment={appointment}
          onClose={() => setConfirmOpen(false)}
          onDone={() => setStatus("REALIZADA")}
        />
      ) : null}
    </>
  );
}

function MarkDoneDialog({
  appointment,
  onClose,
  onDone,
}: {
  appointment: AppointmentWithLead;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [newLeadStatus, setNewLeadStatus] = useState(appointment.leads?.status ?? "NUEVO");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      await markAppointmentDone(appointment.id, newLeadStatus);
      onDone();
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title="Marcar reunión como realizada" description={appointment.leads?.name}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs text-lm-ink-3" htmlFor="newLeadStatus">
            Avanzar estado de {appointment.leads?.name} (opcional)
          </label>
          <Select
            id="newLeadStatus"
            value={newLeadStatus}
            onChange={(event) => setNewLeadStatus(event.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" disabled={pending} onClick={confirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
