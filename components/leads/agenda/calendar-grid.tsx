"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import { moveAppointment } from "@/lib/leads/actions";
import type { AppointmentStatus } from "@/lib/leads/appointments";
import { dayLabelShort, dayNumber, isoDateOf, timeOfDay } from "@/lib/leads/calendar";
import type { AppointmentWithLead } from "@/lib/leads/queries";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<AppointmentStatus, string> = {
  AGENDADA: "bg-cyan",
  CONFIRMADA: "bg-violet",
  REALIZADA: "bg-positive",
  NO_ASISTIO: "bg-warning",
  CANCELADA: "bg-danger",
};

const MONTH_CHIPS_VISIBLE = 3;

/** Grilla de mes o semana con drag & drop nativo (mismo patrón que LeadsKanban) para reprogramar turnos. */
export function CalendarGrid({
  mode,
  days,
  appointments,
  currentMonth,
  today,
  onCreateAt,
  onEdit,
}: {
  mode: "mes" | "semana";
  days: string[];
  appointments: AppointmentWithLead[];
  /** "YYYY-MM" del mes que se está mostrando — para atenuar los días de otro mes (sólo modo mes). */
  currentMonth?: string;
  today: string;
  onCreateAt: (dateIso: string) => void;
  onEdit: (appointment: AppointmentWithLead) => void;
}) {
  const router = useRouter();
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentWithLead[]>();
    for (const appt of appointments) {
      const key = isoDateOf(appt.starts_at);
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  function handleDrop(dateIso: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverDay(null);
    const id = event.dataTransfer.getData("text/plain");
    const time = event.dataTransfer.getData("text/x-time");
    if (!id || !time) return;

    const newStartsAtIso = new Date(`${dateIso}T${time}:00-03:00`).toISOString();
    startTransition(async () => {
      await moveAppointment(id, newStartsAtIso);
      router.refresh();
    });
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
          const dayAppointments = byDay.get(dateIso) ?? [];
          const isToday = dateIso === today;
          const outsideMonth = mode === "mes" && currentMonth ? !dateIso.startsWith(currentMonth) : false;
          const expanded = expandedDays.has(dateIso) || mode === "semana";
          const visible = expanded ? dayAppointments : dayAppointments.slice(0, MONTH_CHIPS_VISIBLE);
          const hiddenCount = dayAppointments.length - visible.length;

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
                {visible.map((appt) => (
                  <div
                    key={appt.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", appt.id);
                      event.dataTransfer.setData("text/x-time", timeOfDay(appt.starts_at));
                    }}
                    onClick={() => onEdit(appt)}
                    className="flex cursor-grab items-start gap-1.5 truncate rounded-[8px] border border-line/60 bg-surface/60 px-1.5 py-1 text-left text-xs hover:border-cyan/40 active:cursor-grabbing"
                  >
                    <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[appt.status])} />
                    <span className="truncate text-ink">
                      <span className="tabular text-muted">{timeOfDay(appt.starts_at)}</span> {appt.title}
                    </span>
                  </div>
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(dateIso)}
                    className="px-1.5 text-xs text-cyan hover:underline"
                  >
                    +{hiddenCount} más
                  </button>
                ) : null}
                {expanded && dayAppointments.length > MONTH_CHIPS_VISIBLE && mode === "mes" ? (
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
