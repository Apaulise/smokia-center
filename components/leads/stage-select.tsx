"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

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
      await updateLeadStatus(leadId, next);
      router.refresh();
    });
  }

  return (
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
  );
}
