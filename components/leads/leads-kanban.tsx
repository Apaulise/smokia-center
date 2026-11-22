"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState, useTransition, type DragEvent } from "react";

import { Toast } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { Chip } from "@/components/ui/status-badge";
import { leadHref, navQueryString } from "@/lib/leads/nav-params";
import { updateLeadStatus } from "@/lib/leads/actions";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { STAGE_GROUP, STAGE_GROUPS, STATUS_LABEL, stageGroupOf, type StageGroup } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * Kanban con drag & drop nativo del navegador — sin librería aparte (Plan
 * §1.3, "opcional"). Desde §1.8 agrupa los 17 estados en las 6 columnas de
 * STAGE_GROUP: 17 columnas son inusables para arrastrar. Soltar una tarjeta en
 * una columna la mueve al primer estado del grupo (el punto de entrada); el
 * control fino de los 17 sigue en el `<select>` de la tabla y de la ficha.
 */
export function LeadsKanban({ leads }: { leads: LeadWithRelations[] }) {
  const router = useRouter();
  const navQuery = navQueryString(useSearchParams());
  const [items, setItems] = useState(leads);
  const [dragOverGroup, setDragOverGroup] = useState<StageGroup | null>(null);
  const [pending, startTransition] = useTransition();
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
    const track = scrollRef.current;
    const column = track?.firstElementChild;
    if (!track || !column) return;
    track.scrollBy({ left: amount * (column.clientWidth + 12), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function handleDrop(group: StageGroup, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverGroup(null);
    const leadId = event.dataTransfer.getData("text/plain");
    if (leadId) moveLead(leadId, group);
  }

  function moveLead(leadId: string, group: StageGroup) {
    if (pending) return;
    const previous = items.find((lead) => lead.id === leadId)?.status;
    if (!previous || stageGroupOf(previous) === group) return;
    const status = STAGE_GROUP[group][0];
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
    <div className="relative min-w-0">
      {error ? (
        <div className="mb-2" role="alert">
          <Toast tone="error">{error}</Toast>
        </div>
      ) : null}
      <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-lm-ink-2">Etapas del tablero</span>
      <div className="ml-auto flex gap-1.5"><button
        type="button"
        aria-label="Desplazar a la izquierda"
        onClick={() => scrollBy(-1)}
        className="grid size-11 place-items-center rounded-lm-md border border-lm-line-strong bg-lm-raised text-lm-ink-2 active:bg-lm-overlay sm:size-8"
      >
        <ChevronLeft className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Desplazar a la derecha"
        onClick={() => scrollBy(1)}
        className="grid size-11 place-items-center rounded-lm-md border border-lm-line-strong bg-lm-raised text-lm-ink-2 active:bg-lm-overlay sm:size-8"
      >
        <ChevronRight className="size-4" strokeWidth={1.5} />
      </button></div></div>

      <div ref={scrollRef} className="flex min-w-0 snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-2 md:snap-none md:items-stretch">
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
                "flex w-[min(19rem,90%)] shrink-0 snap-start flex-col gap-2 rounded-lm-lg border border-lm-line p-3 transition-colors md:w-72",
                dragOverGroup === group ? "border-lm-signal bg-lm-signal-soft" : "lm-tint",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <h4 className="font-lm-sans text-[13px] font-semibold text-lm-ink">{group}</h4>
                <span className="font-mono text-xs tabular-nums text-lm-ink-3">{column.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2">
                {column.map((lead) => (
                  <article key={lead.id} className="min-w-0 rounded-lm-md border border-lm-line-strong bg-lm-raised">
                  <Link
                    href={leadHref(lead.id, navQuery)}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.id)}
                    className="block cursor-grab rounded-lm-md p-3 text-sm transition-colors hover:bg-lm-overlay active:bg-lm-overlay active:cursor-grabbing"
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
                  <div className="px-3 pb-3 md:hidden">
                    <Select aria-label={`Mover de etapa: ${lead.name}`} value={group} disabled={pending}
                      onChange={(event) => moveLead(lead.id, event.target.value as StageGroup)} className="w-full min-w-0">
                      {STAGE_GROUPS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    </Select>
                  </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
