"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState, useTransition, type DragEvent } from "react";

import { Badge } from "@/components/ui/badge";
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
    setItems((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
    startTransition(async () => {
      await updateLeadStatus(leadId, status);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Desplazar a la izquierda"
        onClick={() => scrollBy(-SCROLL_STEP)}
        className="absolute top-1/2 -left-3 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-elevated shadow-lg hover:border-cyan/40 hover:text-cyan"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Desplazar a la derecha"
        onClick={() => scrollBy(SCROLL_STEP)}
        className="absolute top-1/2 -right-3 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-elevated shadow-lg hover:border-cyan/40 hover:text-cyan"
      >
        <ChevronRight className="size-4" />
      </button>

      <div ref={scrollRef} className="scroll-smooth flex gap-4 overflow-x-auto pb-2">
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
                "flex w-72 shrink-0 flex-col gap-2 rounded-[16px] border border-line bg-elevated/50 p-3",
                dragOverGroup === group && "border-cyan/50 bg-cyan/5",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <h4 className="text-sm font-medium text-ink">{group}</h4>
                <span className="tabular text-xs text-muted">{column.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2">
                {column.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.id)}
                    className="block cursor-grab rounded-[12px] border border-line bg-surface/60 p-3 text-sm hover:border-cyan/40 active:cursor-grabbing"
                  >
                    <p className="truncate font-medium text-ink">{lead.name}</p>
                    <p className="mt-1 text-xs text-muted">{STATUS_LABEL[lead.status]}</p>
                    <p className="mt-1 truncate text-xs text-muted">{lead.city ?? lead.phone ?? lead.email ?? ""}</p>
                    {lead.industries ? (
                      <Badge color={lead.industries.color} className="mt-2">
                        {lead.industries.name}
                      </Badge>
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
