"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Input, Textarea } from "@/components/leads/ui/field";

import { updateLeadNotes } from "@/lib/leads/actions";

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Nota nueva + próxima acción (Design System, §1.3) — corregido para que el
 * cuadro de notas sea un registro, no un campo "nota actual": cada guardado
 * no vacío queda en el timeline (`MessageThread`, actividad `NOTA`) y la caja
 * se vacía para la siguiente, en vez de seguir mostrando lo que ya se anotó.
 */
export function LeadNotesForm({ leadId, nextActionAt }: { leadId: string; nextActionAt: string | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateLeadNotes, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      const textarea = formRef.current?.elements.namedItem("notes");
      if (textarea instanceof HTMLTextAreaElement) textarea.value = "";
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="leadId" value={leadId} />

      <Field label="Nueva nota" htmlFor="notes">
        <Textarea id="notes" name="notes" className="min-h-28" placeholder="Escribí una nota y guardala — queda en la actividad." />
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
