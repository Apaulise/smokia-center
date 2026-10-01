"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, useTransition, type DragEvent } from "react";

import { Toast } from "@/components/leads/ui/feedback";
import { Chip } from "@/components/leads/ui/status-badge";
import { updateLeadStatus } from "@/lib/leads/actions";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { STAGE_GROUP, STAGE_GROUPS, STATUS_LABEL, stageGroupOf, type StageGroup } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

const SCROLL_STEP = 320;

/**
 * Kanban con drag & drop nativo del navegador — sin librería aparte (Plan
 * §1.3, "opcional"). Desde §1.8 agrupa los 17 estados en las 6 columnas de
 * STAGE_GROUP: 17 columnas son inusables para arrastrar. Soltar una tarjeta en
 * una columna la mueve al primer estado del grupo (el punto de entrada); el
 * control fino de los 17 sigue en el `<select>` de la tabla y de la ficha.
 */
export function LeadsKanban({ leads }: { leads: LeadWithRelations[] }) {
  const router = useRouter();
  const [items, setItems] = useState(leads);
  const [dragOverGroup, setDragOverGroup] = useState<StageGroup | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ajuste de estado derivado durante el render, no en un efecto (ver leads-table.tsx).
  const [syncedLeads, setSyncedLeads] = useState(leads);
  if (leads !== syncedLeads) {
    setSyncedLeads(leads);
    setItems(leads);
  }

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  function handleDrop(group: StageGroup, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverGroup(null);
    const leadId = event.dataTransfer.getData("text/plain");
    if (!leadId) return;

    const status = STAGE_GROUP[group][0];
    const previous = items.find((lead) => lead.id === leadId)?.status;
    setItems((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, status);
      if (result && !result.ok) {
        if (previous) setItems((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status: previous } : lead)));
        setError(result.message);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setError(null), 5000);
      }
      router.refresh();
    });
  }

  return (
    <div className="relative">
      {error ? (
        <div className="absolute -top-2 left-1/2 z-20 w-max -translate-x-1/2 -translate-y-full">
          <Toast tone="error">{error}</Toast>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Desplazar a la izquierda"
        onClick={() => scrollBy(-SCROLL_STEP)}
        className="lm-shadow-pop absolute top-1/2 -left-3 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-lm-line-strong bg-lm-raised text-lm-ink-2 hover:text-lm-ink"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Desplazar a la derecha"
        onClick={() => scrollBy(SCROLL_STEP)}
        className="lm-shadow-pop absolute top-1/2 -right-3 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-lm-line-strong bg-lm-raised text-lm-ink-2 hover:text-lm-ink"
      >
        <ChevronRight className="size-4" strokeWidth={1.5} />
      </button>

      <div ref={scrollRef} className="scroll-smooth flex gap-3 overflow-x-auto pb-2">
        {STAGE_GROUPS.map((group) => {
          const column = items.filter((lead) => stageGroupOf(lead.status) === group);
          return (
            <div
              key={group}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverGroup(group);
              }}
              onDragLeave={() => setDragOverGroup((current) => (current === group ? null : current))}
              onDrop={(event) => handleDrop(group, event)}
              className={cn(
                "flex w-72 shrink-0 flex-col gap-2 rounded-lm-lg border border-lm-line bg-lm-surface p-3 transition-colors",
                dragOverGroup === group && "border-lm-signal bg-lm-signal-soft",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <h4 className="font-lm-sans text-[13px] font-semibold text-lm-ink">{group}</h4>
                <span className="font-mono text-xs tabular-nums text-lm-ink-3">{column.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2">
                {column.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.id)}
                    className="block cursor-grab rounded-lm-md border border-lm-line-strong bg-lm-raised p-3 text-[13px] transition-colors hover:bg-lm-overlay active:cursor-grabbing"
                  >
                    <p className="truncate font-medium text-lm-ink">{lead.name}</p>
                    <p className="mt-1 text-xs text-lm-ink-3">{STATUS_LABEL[lead.status]}</p>
                    <p className="mt-1 truncate text-xs text-lm-ink-3">{lead.city ?? lead.phone ?? lead.email ?? ""}</p>
                    {lead.industries ? (
                      <Chip color={lead.industries.color} className="mt-2">
                        {lead.industries.name}
                      </Chip>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
