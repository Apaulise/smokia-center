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

/**
 * Grilla de mes o semana con drag & drop nativo (mismo patrón que LeadsKanban).
 * No sabe qué es lo que muestra: la agenda de Leads le pasa turnos y el
 * planificador de Marca le pasa piezas de contenido (Plans/03 §3.7). Quien la
 * usa decide qué dibuja dentro de cada tarjeta y qué pasa al soltarla.
 */
export function CalendarGrid<T extends { id: string }>({
  mode,
  days,
  items,
  getDay,
  renderChip,
  getDragTime,
  canDrag,
  currentMonth,
  today,
  onCreateAt,
  onEdit,
  onMove,
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
  /** "YYYY-MM" del mes que se está mostrando — para atenuar los días de otro mes (sólo modo mes). */
  currentMonth?: string;
  today: string;
  onCreateAt: (dateIso: string) => void;
  onEdit: (item: T) => void;
  onMove: (move: CalendarMove) => void;
}) {
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
    <div className="overflow-hidden rounded-[20px] border border-line bg-elevated/70">
      <div className="grid grid-cols-7 border-b border-line/60 text-xs font-medium text-muted uppercase">
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
                "min-h-24 border-r border-b border-line/40 p-1.5 last:border-r-0",
                mode === "semana" && "min-h-[420px]",
                outsideMonth && "bg-base/40",
                dragOverDay === dateIso && "bg-cyan/5",
              )}
            >
              <button
                type="button"
                onClick={() => onCreateAt(dateIso)}
                className={cn(
                  "mb-1.5 flex size-6 items-center justify-center rounded-full text-xs",
                  isToday ? "bg-cyan text-base font-semibold" : "text-muted hover:text-ink",
                  outsideMonth && "opacity-40",
                )}
              >
                {dayNumber(dateIso)}
              </button>

              <div className="space-y-1">
                {visible.map((item) => {
                  const draggable = canDrag ? canDrag(item) : true;
                  return (
                    <div
                      key={item.id}
                      draggable={draggable}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", item.id);
                        const time = getDragTime?.(item);
                        if (time) event.dataTransfer.setData("text/x-time", time);
                      }}
                      onClick={() => onEdit(item)}
                      className={cn(
                        "flex items-start gap-1.5 truncate rounded-[8px] border border-line/60 bg-surface/60 px-1.5 py-1 text-left text-xs hover:border-cyan/40",
                        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      )}
                    >
                      {renderChip(item)}
                    </div>
                  );
                })}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(dateIso)}
                    className="px-1.5 text-xs text-cyan hover:underline"
                  >
                    +{hiddenCount} más
                  </button>
                ) : null}
                {expanded && dayItems.length > MONTH_CHIPS_VISIBLE && mode === "mes" ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(dateIso)}
                    className="px-1.5 text-xs text-muted hover:underline"
                  >
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
