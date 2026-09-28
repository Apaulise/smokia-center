"use client";

import { CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type DragEvent, type ReactNode } from "react";

import type { LinkablePost } from "@/lib/brand/goals/queries";
import { PlannerItemDialog } from "@/components/brand/planner/item-dialog";
import { Eyebrow, Tag } from "@/components/brand/ui/card";
import { CalendarGrid, type CalendarMove } from "@/components/leads/agenda/calendar-grid";
import { Button } from "@/components/leads/ui/button";
import { movePlannerItem } from "@/lib/brand/planner/actions";
import type { PlannerItemChoice, PlannerNoteChoice } from "@/lib/brand/planner/queries";
import { KIND_LABEL, STATUS_LABEL, type PlannerItem } from "@/lib/brand/planner/schema";
import { plannerDayOf } from "@/lib/brand/planner/week";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { timeOfDay } from "@/lib/leads/calendar";
import { cn } from "@/lib/utils";

// Funciones de módulo (no inline) para que la grilla pueda memoizar sobre ellas.
const itemDay = (item: PlannerItem) => plannerDayOf(item);
const itemTime = (item: PlannerItem) => (item.scheduled_for ? timeOfDay(item.scheduled_for) : null);
const itemCanDrag = (item: PlannerItem) => item.status !== "PUBLICADO";
const itemChipClass = (item: PlannerItem) =>
  item.status === "PUBLICADO" ? "" : "border-dashed border-lm-line-strong bg-transparent";

/**
 * Una pieza publicada es un chip lleno con el check verde; una en camino
 * (idea, guion, grabada…) es un chip punteado con su estado en Mono arriba,
 * para que se lea de un vistazo qué ya salió y qué es plan.
 */
function ItemChip(item: PlannerItem) {
  if (item.status === "PUBLICADO") {
    return (
      <>
        <CheckCircle2 className="mt-px size-[11px] shrink-0 text-lm-success" aria-label="Publicado" />
        <span className="min-w-0 flex-1 truncate text-lm-ink">{item.title}</span>
      </>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[10px] leading-none text-lm-ink-3 uppercase">
        {STATUS_LABEL[item.status]} · {KIND_LABEL[item.kind]}
      </span>
      <span className="line-clamp-2 leading-[1.35] whitespace-normal text-lm-smoke-5">{item.title}</span>
    </span>
  );
}

type DialogState = { mode: "create"; defaultDate?: string } | { mode: "edit"; item: PlannerItem } | null;

/**
 * El calendario del planificador (Plans/03 §3.7), sobre la misma grilla que la
 * agenda de Leads. A la izquierda de la grilla, la bandeja "Sin fecha": las
 * ideas guardadas desde el chat se arrastran de ahí a un día, y una pieza se
 * puede devolver a la bandeja soltándola encima.
 *
 * El encabezado (título, navegación, "Nueva pieza") también vive acá: el CTA
 * abre el diálogo de este componente. La navegación de período llega como
 * `nav`, ya resuelta por el Server Component (son links).
 */
export function PlannerView({
  platform,
  ownerId,
  accountUsername,
  mode,
  days,
  currentMonth,
  today,
  items,
  unscheduled,
  choices,
  linkablePosts,
  title,
  eyebrow,
  nav,
  toggle,
  strip,
}: {
  platform: BrandPlatform;
  ownerId: string;
  accountUsername: string | null;
  mode: "mes" | "semana";
  days: string[];
  currentMonth?: string;
  today: string;
  items: PlannerItem[];
  unscheduled: PlannerItem[];
  choices: { items: PlannerItemChoice[]; notes: PlannerNoteChoice[] };
  linkablePosts: LinkablePost[];
  title: string;
  eyebrow: string;
  /** Flechas anterior/siguiente + "Hoy". */
  nav: ReactNode;
  /** Segmented Mes/Semana. */
  toggle: ReactNode;
  /** La franja de cadencia y exploración, entre el encabezado y el calendario. */
  strip: ReactNode;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [trayHover, setTrayHover] = useState(false);
  const [, startTransition] = useTransition();

  const move = useCallback(
    (id: string, dateIso: string | null, time: string | null) => {
      setMoveError(null);
      startTransition(async () => {
        const result = await movePlannerItem(id, dateIso, time);
        if (!result.ok) setMoveError(result.message);
        router.refresh();
      });
    },
    [router],
  );

  const handleGridMove = useCallback(({ id, dateIso, time }: CalendarMove) => move(id, dateIso, time), [move]);

  function handleTrayDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setTrayHover(false);
    const id = event.dataTransfer.getData("text/plain");
    if (id) move(id, null, null);
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-7 lg:px-8 lg:pb-10">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="font-lm-sans text-[28px] leading-8 font-medium tracking-[-0.02em] first-letter:uppercase">{title}</h1>
            {nav}
          </div>
        </div>
        {toggle}
        <Button type="button" variant="primary" className="h-[34px] px-3.5 text-[13px]" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-3.5" />
          Nueva pieza
        </Button>
      </div>

      {strip}

      {moveError ? <p className="text-sm text-lm-danger">{moveError}</p> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          onDragOver={(event) => {
            event.preventDefault();
            setTrayHover(true);
          }}
          onDragLeave={() => setTrayHover(false)}
          onDrop={handleTrayDrop}
          className={cn(
            "flex h-fit flex-col gap-2.5 rounded-lm-lg border border-dashed border-lm-line-strong p-4 transition-colors",
            trayHover && "border-lm-signal/60 bg-lm-signal-soft",
          )}
        >
          <div className="flex items-baseline">
            <h3 className="flex-1 font-lm-sans text-[13.5px] font-medium">Sin fecha</h3>
            <span className="font-mono text-[11px] text-lm-ink-3">{unscheduled.length}</span>
          </div>

          {unscheduled.length === 0 ? (
            <p className="text-[12.5px] leading-[1.55] text-lm-ink-3">
              Las ideas que guardes desde el chat aparecen acá. Arrastralas a un día para planificarlas.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {unscheduled.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                  onClick={() => setDialog({ mode: "edit", item })}
                  className="cursor-grab rounded-lm-md border border-lm-line bg-lm-raised p-2.5 transition-colors hover:border-lm-line-strong active:cursor-grabbing"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag tone="solid">{KIND_LABEL[item.kind]}</Tag>
                    <Tag>{STATUS_LABEL[item.status]}</Tag>
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-[1.4] text-lm-ink">{item.title}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <CalendarGrid
          variant="signal"
          mode={mode}
          days={days}
          items={items}
          getDay={itemDay}
          getDragTime={itemTime}
          canDrag={itemCanDrag}
          chipClassName={itemChipClass}
          renderChip={ItemChip}
          currentMonth={currentMonth}
          today={today}
          onCreateAt={(dateIso) => setDialog({ mode: "create", defaultDate: dateIso })}
          onEdit={(item) => setDialog({ mode: "edit", item })}
          onMove={handleGridMove}
        />
      </div>

      {dialog ? (
        <PlannerItemDialog
          // Sin key, pasar de una pieza a otra reusaría el estado de la anterior.
          key={dialog.mode === "edit" ? dialog.item.id : "new"}
          mode={dialog.mode}
          item={dialog.mode === "edit" ? dialog.item : undefined}
          defaultDate={dialog.mode === "create" ? dialog.defaultDate : undefined}
          platform={platform}
          ownerId={ownerId}
          accountUsername={accountUsername}
          choices={choices}
          linkablePosts={linkablePosts}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
