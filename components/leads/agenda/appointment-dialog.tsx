"use client";

import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

/** Crear o editar un turno (Plan §1.5) — un solo formulario para ambos casos. */
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
    <Dialog
      open
      onClose={onClose}
      title={mode === "edit" ? "Editar turno" : "Nuevo turno"}
      description={appointment?.leads?.name}
    >
      <form action={formAction} className="space-y-4">
        {appointment ? <input type="hidden" name="id" value={appointment.id} /> : null}

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="title">
            Título
          </label>
          <Input id="title" name="title" defaultValue={appointment?.title} required />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="leadId">
            Lead (opcional)
          </label>
          <Select id="leadId" name="leadId" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
            <option value="">Sin lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="startsAt">
              Fecha y hora
            </label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={startsAtDefault}
              required
              className="h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="durationMinutes">
              Duración
            </label>
            <Select id="durationMinutes" name="durationMinutes" defaultValue={durationDefault}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {mode === "edit" ? (
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="status">
              Estado
            </label>
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
          </div>
        ) : null}

        {showAdvanceLead ? (
          <div className="rounded-[12px] border border-cyan/30 bg-cyan/5 p-3">
            <label className="mb-1.5 block text-xs text-muted" htmlFor="newLeadStatus">
              Avanzar estado de {appointment?.leads?.name ?? "el lead"} (opcional)
            </label>
            <Select id="newLeadStatus" name="newLeadStatus" defaultValue={advanceDefault}>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="meetingUrl">
            Link de la reunión (opcional)
          </label>
          <Input id="meetingUrl" name="meetingUrl" type="url" defaultValue={appointment?.meeting_url ?? undefined} placeholder="https://meet.google.com/…" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="notes">
            Notas (opcional)
          </label>
          <Textarea id="notes" name="notes" defaultValue={appointment?.notes ?? undefined} />
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-4">
          {appointment ? (
            <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
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
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {mode === "edit" ? "Guardar" : "Agendar"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
