"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Input, Textarea } from "@/components/leads/ui/field";

import { updateLeadNotes } from "@/lib/leads/actions";

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadNotesForm({ leadId, notes, nextActionAt }: { leadId: string; notes: string | null; nextActionAt: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateLeadNotes, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />

      <Field label="Notas" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={notes ?? ""} className="min-h-28" />
      </Field>

      <Field label="Próxima acción" htmlFor="nextActionAt">
        <Input id="nextActionAt" name="nextActionAt" type="datetime-local" defaultValue={toDatetimeLocal(nextActionAt)} mono />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar
        </Button>
        {state ? (
          <p className={`flex items-center gap-1.5 text-xs ${state.ok ? "text-lm-success" : "text-lm-danger"}`}>
            {state.ok ? <CheckCircle2 className="size-3.5" strokeWidth={1.5} /> : <XCircle className="size-3.5" strokeWidth={1.5} />}
            {state.ok ? `Guardado · ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
