"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import { dayLabelShort, dayNumber } from "@/lib/leads/calendar";
import { cn } from "@/lib/utils";

const MONTH_CHIPS_VISIBLE = 3;

/**
 * Lo que informa una tarjeta al soltarse en un día. `time` es la hora que la
 * tarjeta declaró al empezar el arrastre (`getDragTime`), o null si viene de
 * afuera de la grilla — por ejemplo la bandeja "Sin fecha" del planificador.
 */
export interface CalendarMove {
  id: string;
  dateIso: string;
  time: string | null;
}

type Variant = "brand" | "signal";

/** Clases por variante: "brand" (Marca, default, sin tocar) y "signal" (Leads, "Señal y humo"). */
const V: Record<Variant, Record<string, string>> = {
  brand: {
    container: "overflow-hidden rounded-[20px] border border-line bg-elevated/70",
    head: "border-b border-line/60 text-xs font-medium text-muted uppercase",
    cell: "border-r border-b border-line/40 p-1.5 last:border-r-0",
    outsideMonth: "bg-base/40",
    dragOver: "bg-cyan/5",
    todayCircle: "bg-cyan text-base font-semibold",
    dayNumber: "text-muted hover:text-ink",
    chip: "border-line/60 bg-surface/60 hover:border-cyan/40",
    more: "text-cyan hover:underline",
    less: "text-muted hover:underline",
  },
  signal: {
    container: "overflow-hidden rounded-lm-lg border border-lm-line-strong bg-lm-surface",
    head: "border-b border-lm-line font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase",
    cell: "border-r border-b border-lm-line p-1.5 last:border-r-0",
    outsideMonth: "bg-black/[0.18]",
    dragOver: "bg-lm-signal-soft",
    todayCircle: "bg-lm-signal text-lm-on-signal font-semibold",
    dayNumber: "text-lm-ink-3 hover:text-lm-ink",
    chip: "border-lm-line bg-lm-raised hover:border-lm-line-strong",
    more: "text-lm-signal-text hover:underline",
    less: "text-lm-ink-3 hover:underline",
  },
};

/**
 * Grilla de mes o semana con drag & drop nativo (mismo patrón que LeadsKanban).
 * No sabe qué es lo que muestra: la agenda de Leads le pasa turnos y el
 * planificador de Marca le pasa piezas de contenido (Plans/03 §3.7). Quien la
 * usa decide qué dibuja dentro de cada tarjeta y qué pasa al soltarla;
 * `variant` sólo cambia el tema (CLAUDE.md §2: Marca sigue con el suyo).
 */
export function CalendarGrid<T extends { id: string }>({
  mode,
  days,
  items,
  getDay,
  renderChip,
  getDragTime,
  canDrag,
  canEdit,
  chipClassName,
  currentMonth,
  today,
  onCreateAt,
  onEdit,
  onMove,
  variant = "brand",
}: {
  mode: "mes" | "semana";
  days: string[];
  items: T[];
  /** A qué día calendario ("YYYY-MM-DD") pertenece la tarjeta, o null si no se dibuja. */
  getDay: (item: T) => string | null;
  /** El interior de la tarjeta; el contenedor (arrastrable, clicable) lo pone la grilla. */
  renderChip: (item: T) => ReactNode;
  /** La hora ("HH:mm") que viaja con la tarjeta al arrastrarla. */
  getDragTime?: (item: T) => string | null;
  /** Por default toda tarjeta se arrastra. */
  canDrag?: (item: T) => boolean;
  /** Por default toda tarjeta se puede abrir/editar. */
  canEdit?: (item: T) => boolean;
  /** Clases extra por tarjeta (p. ej. borde punteado para lo planificado). Sin esto, la tarjeta trunca a una línea. */
  chipClassName?: (item: T) => string;
  /** "YYYY-MM" del mes que se está mostrando — para atenuar los días de otro mes (sólo modo mes). */
  currentMonth?: string;
  today: string;
  onCreateAt: (dateIso: string) => void;
  onEdit: (item: T) => void;
  onMove: (move: CalendarMove) => void;
  variant?: Variant;
}) {
  const v = V[variant];
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const key = getDay(item);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items, getDay]);

  function handleDrop(dateIso: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverDay(null);
    const id = event.dataTransfer.getData("text/plain");
    if (!id) return;
    onMove({ id, dateIso, time: event.dataTransfer.getData("text/x-time") || null });
  }

  function toggleExpanded(dateIso: string) {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(dateIso)) next.delete(dateIso);
      else next.add(dateIso);
      return next;
    });
  }

  return (
    <div className={v.container}>
      <div className={cn("grid grid-cols-7", v.head)}>
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2 py-2 text-center">
            {dayLabelShort(day)}
          </div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", mode === "mes" ? "auto-rows-fr" : "")}>
        {days.map((dateIso) => {
          const dayItems = byDay.get(dateIso) ?? [];
          const isToday = dateIso === today;
          const outsideMonth = mode === "mes" && currentMonth ? !dateIso.startsWith(currentMonth) : false;
          const expanded = expandedDays.has(dateIso) || mode === "semana";
          const visible = expanded ? dayItems : dayItems.slice(0, MONTH_CHIPS_VISIBLE);
          const hiddenCount = dayItems.length - visible.length;

          return (
            <div
              key={dateIso}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverDay(dateIso);
              }}
              onDragLeave={() => setDragOverDay((current) => (current === dateIso ? null : current))}
              onDrop={(event) => handleDrop(dateIso, event)}
              className={cn(
                "min-h-24",
                v.cell,
                mode === "semana" && "min-h-[420px]",
                outsideMonth && v.outsideMonth,
                dragOverDay === dateIso && v.dragOver,
              )}
            >
              <button
                type="button"
                onClick={() => onCreateAt(dateIso)}
                className={cn(
                  "mb-1.5 flex size-6 items-center justify-center rounded-full text-xs",
                  isToday ? v.todayCircle : v.dayNumber,
                  outsideMonth && "opacity-40",
                )}
              >
                {dayNumber(dateIso)}
              </button>

              <div className="space-y-1">
                {visible.map((item) => {
                  const draggable = canDrag ? canDrag(item) : true;
                  const editable = canEdit ? canEdit(item) : true;
                  return (
                    <div
                      key={item.id}
                      draggable={draggable}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", item.id);
                        const time = getDragTime?.(item);
                        if (time) event.dataTransfer.setData("text/x-time", time);
                      }}
                      onClick={() => editable && onEdit(item)}
                      className={cn(
                        "flex items-start gap-1.5 rounded-[8px] border px-1.5 py-1 text-left text-xs",
                        v.chip,
                        chipClassName?.(item) ?? "truncate",
                        draggable ? "cursor-grab active:cursor-grabbing" : editable ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      {renderChip(item)}
                    </div>
                  );
                })}
                {hiddenCount > 0 ? (
                  <button type="button" onClick={() => toggleExpanded(dateIso)} className={cn("px-1.5 text-xs", v.more)}>
                    +{hiddenCount} más
                  </button>
                ) : null}
                {expanded && dayItems.length > MONTH_CHIPS_VISIBLE && mode === "mes" ? (
                  <button type="button" onClick={() => toggleExpanded(dateIso)} className={cn("px-1.5 text-xs", v.less)}>
                    Ver menos
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
