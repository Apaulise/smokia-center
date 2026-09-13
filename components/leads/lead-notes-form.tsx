"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateLeadNotes } from "@/lib/leads/actions";

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadNotesForm({
  leadId,
  notes,
  nextActionAt,
}: {
  leadId: string;
  notes: string | null;
  nextActionAt: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateLeadNotes, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="leadId" value={leadId} />

      <div>
        <label className="mb-1.5 block text-xs text-muted" htmlFor="notes">
          Notas
        </label>
        <Textarea id="notes" name="notes" defaultValue={notes ?? ""} className="min-h-32" />
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-muted" htmlFor="nextActionAt">
          Próxima acción
        </label>
        <input
          id="nextActionAt"
          name="nextActionAt"
          type="datetime-local"
          defaultValue={toDatetimeLocal(nextActionAt)}
          className="h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar
        </Button>
        {state ? (
          <p className={`flex items-center gap-1.5 text-sm ${state.ok ? "text-positive" : "text-danger"}`}>
            {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
