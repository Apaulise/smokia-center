"use client";

import { useState } from "react";

import type { DailyContacts } from "@/lib/leads/execution/queries";

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = { top: 20, right: 12, bottom: 24, left: 12 };
const INNER_WIDTH = WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const GAP = 2;

// Sistema "Señal y humo": una sola serie. Los días en humo; en `signal` sólo
// los que llegaron al objetivo — el único acento de la vista. No es una
// paleta categórica (la skill dataviz no la valida como tal): el estado se
// lee también en la leyenda y en el tooltip, nunca sólo por color.
const DAY_COLOR = "var(--color-lm-smoke-4)";
const HIT_COLOR = "var(--color-lm-signal)";

function niceCeil(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}

function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("es-AR", { ...opts, timeZone: "UTC" });
}

/** Contactos (nuevos + seguimientos) por día del mes contra la línea de objetivo diario (Plan §1.22). Barras con tooltip por barra. */
export function DailyContactsChart({ days, target }: { days: DailyContacts[]; target: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) {
    return <p className="text-[13px] text-lm-ink-2">Sin datos en este período.</p>;
  }

  const yMax = niceCeil(Math.max(target, ...days.map((d) => d.contacts)));
  const slot = INNER_WIDTH / days.length;
  const barWidth = Math.max(2, slot - GAP);
  const yAt = (v: number) => PADDING.top + INNER_HEIGHT - (v / yMax) * INNER_HEIGHT;
  const hovered = hoverIndex !== null ? days[hoverIndex] : null;
  const tooltipLeftPct = hoverIndex !== null ? ((PADDING.left + slot * (hoverIndex + 0.5)) / WIDTH) * 100 : 0;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-lm-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: HIT_COLOR }} />
          Llegaste al objetivo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: DAY_COLOR }} />
          Por debajo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-lm-ink-2" />
          Objetivo diario
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label={`Contactos por día del mes contra el objetivo de ${target} por día`}
          onPointerLeave={() => setHoverIndex(null)}
        >
          <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yAt(0)} y2={yAt(0)} stroke="var(--color-lm-line)" strokeWidth={1} />

          {days.map((day, index) => {
            const x = PADDING.left + slot * index + GAP / 2;
            const y = yAt(day.contacts);
            const height = yAt(0) - y;
            return (
              <g key={day.day} onPointerEnter={() => setHoverIndex(index)}>
                {/* Zona de hover de toda la columna: más grande que la barra. */}
                <rect x={PADDING.left + slot * index} y={PADDING.top} width={slot} height={INNER_HEIGHT} fill="transparent" />
                {day.contacts > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx={Math.min(4, barWidth / 2)}
                    fill={day.contacts >= target ? HIT_COLOR : DAY_COLOR}
                    opacity={hoverIndex === null || hoverIndex === index ? 1 : 0.6}
                  />
                ) : null}
              </g>
            );
          })}

          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={yAt(target)}
            y2={yAt(target)}
            stroke="var(--color-lm-ink-2)"
            strokeWidth={1}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
          <text x={WIDTH - PADDING.right} y={yAt(target) - 6} textAnchor="end" fill="var(--color-lm-ink-2)" fontSize={10} pointerEvents="none">
            Objetivo {target}/día
          </text>

          <text x={PADDING.left} y={HEIGHT - 6} fill="var(--color-lm-ink-3)" fontSize={10}>
            {formatDay(days[0].day)}
          </text>
          <text x={WIDTH - PADDING.right} y={HEIGHT - 6} textAnchor="end" fill="var(--color-lm-ink-3)" fontSize={10}>
            {formatDay(days[days.length - 1].day)}
          </text>
        </svg>

        {hovered ? (
          <div
            className="lm-shadow-pop pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lm-md border border-lm-line bg-lm-raised px-3 py-2 text-xs"
            style={{ left: `${Math.min(Math.max(tooltipLeftPct, 12), 88)}%` }}
          >
            <p className="mb-1 font-medium text-lm-ink">{formatDay(hovered.day, { weekday: "short", day: "2-digit", month: "short" })}</p>
            <p className="flex items-center justify-between gap-4 text-lm-ink-2">
              Contactos
              <span className="font-mono tabular-nums text-lm-ink">
                {hovered.contacts} / {target}
              </span>
            </p>
            {hovered.followups > 0 ? (
              <p className="flex items-center justify-between gap-4 text-lm-ink-3">
                Incluye seguimientos
                <span className="font-mono tabular-nums">{hovered.followups}</span>
              </p>
            ) : null}
            <p className="mt-0.5 text-lm-ink-3">{hovered.contacts >= target ? "Llegaste al objetivo" : `Faltaron ${target - hovered.contacts}`}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
