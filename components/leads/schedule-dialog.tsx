"use client";

import { CalendarPlus, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { EmptyLine } from "@/components/leads/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { createAppointmentForLead } from "@/lib/leads/actions";
import type { Database } from "@/lib/supabase/database.types";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];

/** Botón "Agendar" de la ficha (Plan §1.3): crea un turno ligado al lead sin salir de la pantalla. */
export function ScheduleDialog({ leadId, leadName, upcoming }: { leadId: string; leadName: string; upcoming: Appointment[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {upcoming.map((appointment) => (
            <li key={appointment.id} className="rounded-lm-sm border border-lm-line bg-lm-raised px-3 py-2 text-[13px]">
              <p className="text-lm-ink">{appointment.title}</p>
              <p className="font-mono text-xs text-lm-ink-3">
                {new Date(appointment.starts_at).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyLine>Todavía no hay reuniones agendadas.</EmptyLine>
      )}

      <Button type="button" variant="secondary" size="sm" className="w-max" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-3.5" strokeWidth={1.5} />
        Agendar
      </Button>

      {open ? <ScheduleForm leadId={leadId} leadName={leadName} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ScheduleForm({ leadId, leadName, onClose }: { leadId: string; leadName: string; onClose: () => void }) {
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
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="leadId" value={leadId} />

        <Field label="Título" htmlFor="title">
          <Input id="title" name="title" defaultValue={`Reunión con ${leadName}`} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha y hora" htmlFor="startsAt">
            <Input id="startsAt" name="startsAt" type="datetime-local" required mono />
          </Field>
          <Field label="Duración" htmlFor="durationMinutes">
            <Select id="durationMinutes" name="durationMinutes" defaultValue="30">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hora</option>
              <option value="90">1 hora 30</option>
            </Select>
          </Field>
        </div>

        <Field label="Link de la reunión (opcional)" htmlFor="meetingUrl">
          <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://meet.google.com/…" />
        </Field>

        <Field label="Notas (opcional)" htmlFor="notes">
          <Textarea id="notes" name="notes" />
        </Field>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" strokeWidth={1.5} />}
            Agendar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
