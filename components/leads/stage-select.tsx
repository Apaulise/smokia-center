"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Toast } from "@/components/leads/ui/feedback";
import { updateLeadStatus } from "@/lib/leads/actions";
import { LEAD_STATUSES, STATUS_LABEL, STATUS_TEMPERATURE_GROUP, type LeadStatus } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * Selector de estado del header de la ficha (Design System StatusBadge:
 * "en el header del detalle de lead, el badge funciona como selector para
 * cambiar de etapa"). `<select>` nativo por accesibilidad, con el mismo
 * punto de temperatura que el badge de sólo lectura.
 */
export function StageSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const group = STATUS_TEMPERATURE_GROUP[status];

  const dotClass = {
    frio: "bg-lm-smoke-4",
    curso: "bg-lm-info",
    caliente: "bg-lm-signal",
    ganado: "bg-lm-success",
    pausa: "bg-lm-smoke-3",
    salida: "bg-lm-danger",
  }[group];

  function handleChange(next: LeadStatus) {
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, next);
      if (result && !result.ok) {
        setError(result.message);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setError(null), 5000);
      }
      router.refresh();
    });
  }

  return (
    <div className="relative inline-block">
      <div
        className={cn(
          "relative inline-flex h-7 items-center gap-2 rounded-lm-sm border border-lm-line-strong bg-lm-surface pr-7 pl-2.5 text-[13px] font-medium text-lm-ink",
          pending && "opacity-60",
        )}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />
        <select
          aria-label="Cambiar etapa"
          value={status}
          disabled={pending}
          onChange={(event) => handleChange(event.target.value as LeadStatus)}
          className="absolute inset-0 cursor-pointer appearance-none bg-transparent pl-6 text-[13px] text-lm-ink opacity-0"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="pointer-events-none">{STATUS_LABEL[status]}</span>
        <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-lm-ink-3" strokeWidth={1.5} />
      </div>
      {error ? (
        <div className="absolute top-full left-0 z-20 mt-2 w-72">
          <Toast tone="error">{error}</Toast>
        </div>
      ) : null}
    </div>
  );
}
