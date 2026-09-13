"use client";

import { CalendarPlus, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAppointmentForLead } from "@/lib/leads/actions";
import type { Database } from "@/lib/supabase/database.types";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];

/** Botón "Agendar" de la ficha (Plan §1.3): crea un turno ligado al lead sin salir de la pantalla. */
export function ScheduleDialog({
  leadId,
  leadName,
  upcoming,
}: {
  leadId: string;
  leadName: string;
  upcoming: Appointment[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {upcoming.length > 0 ? (
        <ul className="space-y-2">
          {upcoming.map((appointment) => (
            <li key={appointment.id} className="rounded-[12px] border border-line bg-surface/40 px-3 py-2 text-sm">
              <p className="text-ink">{appointment.title}</p>
              <p className="text-xs text-muted">
                {new Date(appointment.starts_at).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Todavía no hay reuniones agendadas.</p>
      )}

      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-3.5" />
        Agendar
      </Button>

      {open ? (
        <ScheduleForm leadId={leadId} leadName={leadName} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function ScheduleForm({
  leadId,
  leadName,
  onClose,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createAppointmentForLead, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title="Agendar reunión" description={leadName}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="leadId" value={leadId} />

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="title">
            Título
          </label>
          <Input id="title" name="title" defaultValue={`Reunión con ${leadName}`} required />
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
              required
              className="h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="durationMinutes">
              Duración
            </label>
            <Select id="durationMinutes" name="durationMinutes" defaultValue="30">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hora</option>
              <option value="90">1 hora 30</option>
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="meetingUrl">
            Link de la reunión (opcional)
          </label>
          <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://meet.google.com/…" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="notes">
            Notas (opcional)
          </label>
          <Textarea id="notes" name="notes" />
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Agendar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
