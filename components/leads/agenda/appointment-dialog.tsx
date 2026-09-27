"use client";

import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { createAppointment, deleteAppointment, updateAppointment } from "@/lib/leads/actions";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from "@/lib/leads/appointments";
import type { AppointmentWithLead } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/leads/status";

type LeadLite = { id: string; name: string };

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DURATIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1 hora 30" },
];

/**
 * Crear o editar un turno (Plan §1.5, Design System §05.B "Nuevo turno") — un
 * solo formulario para ambos casos.
 */
export function AppointmentDialog({
  mode,
  appointment,
  leads,
  defaultStartsAt,
  defaultLeadId,
  onClose,
}: {
  mode: "create" | "edit";
  appointment?: AppointmentWithLead;
  leads: LeadLite[];
  defaultStartsAt?: string;
  defaultLeadId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(mode === "edit" ? updateAppointment : createAppointment, null);
  const [deleting, setDeleting] = useState(false);

  const [leadId, setLeadId] = useState(appointment?.lead_id ?? defaultLeadId ?? "");
  const [status, setStatus] = useState(appointment?.status ?? "AGENDADA");

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const startsAtDefault = appointment
    ? toDatetimeLocalValue(appointment.starts_at)
    : (defaultStartsAt ?? "");
  const durationDefault = appointment
    ? String(Math.round((new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60_000))
    : "30";

  const showAdvanceLead = mode === "edit" && leadId && status === "REALIZADA";
  const advanceDefault = leadId === appointment?.lead_id ? (appointment?.leads?.status ?? "NUEVO") : "NUEVO";

  async function handleDelete() {
    if (!appointment) return;
    if (!window.confirm("¿Eliminar este turno? No se puede deshacer.")) return;
    setDeleting(true);
    await deleteAppointment(appointment.id);
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={mode === "edit" ? "Editar turno" : "Nuevo turno"} description={appointment?.leads?.name}>
      <form action={formAction} className="flex flex-col gap-4">
        {appointment ? <input type="hidden" name="id" value={appointment.id} /> : null}

        <Field label="Título" htmlFor="title">
          <Input id="title" name="title" defaultValue={appointment?.title} required />
        </Field>

        <Field label="Lead (opcional)" htmlFor="leadId">
          <Select id="leadId" name="leadId" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
            <option value="">Sin lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha y hora" htmlFor="startsAt">
            <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={startsAtDefault} required mono />
          </Field>
          <Field label="Duración" htmlFor="durationMinutes">
            <Select id="durationMinutes" name="durationMinutes" defaultValue={durationDefault}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {mode === "edit" ? (
          <Field label="Estado" htmlFor="status">
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as AppointmentStatus)}
            >
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {APPOINTMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {showAdvanceLead ? (
          <div className="rounded-lm-sm border border-lm-line-strong bg-lm-raised p-3">
            <Field label={`Avanzar estado de ${appointment?.leads?.name ?? "el lead"} (opcional)`} htmlFor="newLeadStatus">
              <Select id="newLeadStatus" name="newLeadStatus" defaultValue={advanceDefault}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <Field label="Link de la reunión (opcional)" htmlFor="meetingUrl">
          <Input id="meetingUrl" name="meetingUrl" type="url" defaultValue={appointment?.meeting_url ?? undefined} placeholder="https://meet.google.com/…" />
        </Field>

        <Field label="Notas (opcional)" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={appointment?.notes ?? undefined} />
        </Field>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-lm-line pt-4">
          {appointment ? (
            <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" strokeWidth={1.5} />}
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" strokeWidth={1.5} />}
              {mode === "edit" ? "Guardar" : "Agendar"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
