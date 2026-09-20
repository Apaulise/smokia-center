"use client";

import { CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type DragEvent } from "react";

import type { LinkablePost } from "@/lib/brand/goals/queries";
import { PlannerItemDialog } from "@/components/brand/planner/item-dialog";
import { CalendarGrid, type CalendarMove } from "@/components/leads/agenda/calendar-grid";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { movePlannerItem } from "@/lib/brand/planner/actions";
import type { PlannerItemChoice, PlannerNoteChoice } from "@/lib/brand/planner/queries";
import { KIND_LABEL, STATUS_LABEL, type ContentStatus, type PlannerItem } from "@/lib/brand/planner/schema";
import { plannerDayOf } from "@/lib/brand/planner/week";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { timeOfDay } from "@/lib/leads/calendar";
import { cn } from "@/lib/utils";

// Violeta = proceso (manual §9): una pieza en camino no es un resultado. Cyan cuando está lista para salir.
const STATUS_DOT: Record<ContentStatus, string> = {
  IDEA: "bg-violet",
  GUION: "bg-violet",
  GRABADO: "bg-violet",
  EDITADO: "bg-violet",
  LISTO: "bg-cyan",
  PUBLICADO: "bg-positive",
};

const STATUS_TONE: Record<ContentStatus, BadgeTone> = {
  IDEA: "violet",
  GUION: "violet",
  GRABADO: "violet",
  EDITADO: "violet",
  LISTO: "cyan",
  PUBLICADO: "positive",
};

// Funciones de módulo (no inline) para que la grilla pueda memoizar sobre ellas.
const itemDay = (item: PlannerItem) => plannerDayOf(item);
const itemTime = (item: PlannerItem) => (item.scheduled_for ? timeOfDay(item.scheduled_for) : null);
const itemCanDrag = (item: PlannerItem) => item.status !== "PUBLICADO";

function ItemChip(item: PlannerItem) {
  return (
    <>
      {item.status === "PUBLICADO" ? (
        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-positive" aria-label="Publicado" />
      ) : (
        <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[item.status])} />
      )}
      <span className="truncate text-ink">
        <span className="text-muted">{KIND_LABEL[item.kind]}</span> {item.title}
      </span>
    </>
  );
}

type DialogState = { mode: "create"; defaultDate?: string } | { mode: "edit"; item: PlannerItem } | null;

/**
 * El calendario del planificador (Plans/03 §3.7), sobre la misma grilla que la
 * agenda de Leads. A la izquierda de la grilla, la bandeja "Sin fecha": las
 * ideas guardadas desde el chat se arrastran de ahí a un día, y una pieza se
 * puede devolver a la bandeja soltándola encima.
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-3.5" />
          Nueva pieza
        </Button>
      </div>

      {moveError ? <p className="text-sm text-danger">{moveError}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <aside
          onDragOver={(event) => {
            event.preventDefault();
            setTrayHover(true);
          }}
          onDragLeave={() => setTrayHover(false)}
          onDrop={handleTrayDrop}
          className={cn(
            "h-fit rounded-[20px] border border-line bg-elevated/70 p-3 transition-colors",
            trayHover && "border-cyan/40 bg-cyan/5",
          )}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-sm text-ink">Sin fecha</h3>
            <span className="tabular text-xs text-muted">{unscheduled.length}</span>
          </div>

          {unscheduled.length === 0 ? (
            <p className="px-1 pb-1 text-xs text-muted">
              Las ideas que guardes desde el chat aparecen acá. Arrastralas a un día para planificarlas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {unscheduled.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                  onClick={() => setDialog({ mode: "edit", item })}
                  className="cursor-grab rounded-[12px] border border-line/60 bg-surface/60 p-2.5 hover:border-cyan/40 active:cursor-grabbing"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="cyan">{KIND_LABEL[item.kind]}</Badge>
                    <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-ink">{item.title}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <CalendarGrid
          mode={mode}
          days={days}
          items={items}
          getDay={itemDay}
          getDragTime={itemTime}
          canDrag={itemCanDrag}
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
