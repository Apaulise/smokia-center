"use client";

import { Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input } from "@/components/leads/ui/field";
import { defineSalesGoal } from "@/lib/leads/execution/actions";
import type { ChainInputs } from "@/lib/leads/execution/chain";

/** 0.15 → 15, sin el 15.000000000000002 de la coma flotante. */
function toPercent(fraction: number) {
  return Number((fraction * 100).toFixed(2));
}

/**
 * Botón + diálogo para definir o editar el objetivo de la cadena (Plan §1.22).
 * Guardar crea un objetivo nuevo y archiva el anterior: el historial queda.
 */
export function EditGoalButton({
  initial,
  label,
  variant = "secondary",
}: {
  initial: ChainInputs;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <GoalFormDialog initial={initial} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GoalFormDialog({ initial, onClose }: { initial: ChainInputs; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(defineSalesGoal, null);

  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Objetivo del mes"
      description="Las tasas son tu punto de partida: la app las va corrigiendo sola con lo que pase de verdad."
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facturación mensual (USD)" htmlFor="monthlyRevenueTarget">
            <Input
              id="monthlyRevenueTarget"
              name="monthlyRevenueTarget"
              type="number"
              min={1}
              step="any"
              mono
              required
              autoFocus
              defaultValue={initial.monthlyRevenueTarget}
            />
          </Field>
          <Field label="Ticket promedio (USD)" htmlFor="avgTicket" hint="A ojo, hasta que exista Facturación.">
            <Input id="avgTicket" name="avgTicket" type="number" min={1} step="any" mono required defaultValue={initial.avgTicket} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="% contactos que agendan" htmlFor="bookingRate">
            <Input
              id="bookingRate"
              name="bookingRate"
              type="number"
              min={0.1}
              max={100}
              step="any"
              mono
              required
              defaultValue={toPercent(initial.bookingRate)}
            />
          </Field>
          <Field label="% asistencia a la llamada" htmlFor="showRate">
            <Input
              id="showRate"
              name="showRate"
              type="number"
              min={0.1}
              max={100}
              step="any"
              mono
              required
              defaultValue={toPercent(initial.showRate)}
            />
          </Field>
          <Field label="% de cierre" htmlFor="closeRate">
            <Input
              id="closeRate"
              name="closeRate"
              type="number"
              min={0.1}
              max={100}
              step="any"
              mono
              required
              defaultValue={toPercent(initial.closeRate)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Días hábiles del mes" htmlFor="workingDaysPerMonth">
            <Input
              id="workingDaysPerMonth"
              name="workingDaysPerMonth"
              type="number"
              min={1}
              max={31}
              step={1}
              mono
              required
              defaultValue={initial.workingDaysPerMonth}
            />
          </Field>
          <Field label="Días de trabajo por semana" htmlFor="workingDaysPerWeek">
            <Input
              id="workingDaysPerWeek"
              name="workingDaysPerWeek"
              type="number"
              min={1}
              max={7}
              step={1}
              mono
              required
              defaultValue={initial.workingDaysPerWeek}
            />
          </Field>
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar objetivo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
