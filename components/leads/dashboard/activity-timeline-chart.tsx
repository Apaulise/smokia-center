"use client";

import { useState, type PointerEvent } from "react";

import type { ActivityTimelinePoint } from "@/lib/leads/queries";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 24, left: 12 };
const INNER_WIDTH = WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// Sistema "Señal y humo": serie principal (resultado) en `signal`, comparación
// en `smoke-5` — nunca dos hues saturados compitiendo (README del sistema).
// La combinación queda desaturada a propósito; se valida con la skill dataviz
// (chroma floor) y se compensa con leyenda + etiqueta directa en cada línea.
const CONTACTED_COLOR = "#b9bbbe";
const WON_COLOR = "#f2c14e";

/** Redondea hacia arriba al siguiente 1/2/5 × 10ⁿ, para que el gridline superior sea un número limpio. */
function niceCeil(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10];
  const step = steps.find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}

function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("es-AR", { ...opts, timeZone: "UTC" });
}

function buildPath(coords: [number, number][]) {
  return coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
}

/**
 * Evolución de contactos y cierres (Plan §1.4). SVG a mano, sin librería de
 * charts: dos líneas, crosshair + tooltip al pasar el mouse (skill dataviz —
 * el hover es parte del entregable, no un extra).
 */
export function ActivityTimelineChart({ points }: { points: ActivityTimelinePoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-[13px] text-lm-ink-2">Sin datos en este período.</p>;
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.contacted, p.won)));
  const yMax = niceCeil(max);

  const xAt = (i: number) => PADDING.left + (points.length <= 1 ? INNER_WIDTH / 2 : (i / (points.length - 1)) * INNER_WIDTH);
  const yAt = (v: number) => PADDING.top + INNER_HEIGHT - (v / yMax) * INNER_HEIGHT;

  const contactedPath = buildPath(points.map((p, i) => [xAt(i), yAt(p.contacted)]));
  const wonPath = buildPath(points.map((p, i) => [xAt(i), yAt(p.won)]));

  const gridValues = [0, yMax / 2, yMax];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipLeftPct = hoverIndex !== null ? (xAt(hoverIndex) / WIDTH) * 100 : 0;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const svgX = ratioX * WIDTH;
    const positionRatio = points.length <= 1 ? 0 : (svgX - PADDING.left) / INNER_WIDTH;
    const index = Math.round(positionRatio * (points.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-lm-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: WON_COLOR }} />
          Cierres
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: CONTACTED_COLOR }} />
          Contactos
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label="Evolución de contactos y cierres en el tiempo"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {gridValues.map((value) => (
            <line
              key={value}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yAt(value)}
              y2={yAt(value)}
              stroke="var(--color-lm-line)"
              strokeWidth={1}
            />
          ))}

          {hoverIndex !== null ? (
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--color-lm-line-strong)"
              strokeWidth={1}
            />
          ) : null}

          <path d={contactedPath} fill="none" stroke={CONTACTED_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d={wonPath} fill="none" stroke={WON_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          <circle cx={xAt(points.length - 1)} cy={yAt(points[points.length - 1].contacted)} r={4} fill={CONTACTED_COLOR} stroke="var(--color-lm-surface)" strokeWidth={2} />
          <circle cx={xAt(points.length - 1)} cy={yAt(points[points.length - 1].won)} r={4} fill={WON_COLOR} stroke="var(--color-lm-surface)" strokeWidth={2} />

          {hoverIndex !== null ? (
            <>
              <circle cx={xAt(hoverIndex)} cy={yAt(points[hoverIndex].contacted)} r={4} fill={CONTACTED_COLOR} stroke="var(--color-lm-surface)" strokeWidth={2} />
              <circle cx={xAt(hoverIndex)} cy={yAt(points[hoverIndex].won)} r={4} fill={WON_COLOR} stroke="var(--color-lm-surface)" strokeWidth={2} />
            </>
          ) : null}

          <text x={PADDING.left} y={HEIGHT - 6} fill="var(--color-lm-ink-3)" fontSize={10}>
            {formatDay(points[0].day)}
          </text>
          <text x={WIDTH - PADDING.right} y={HEIGHT - 6} textAnchor="end" fill="var(--color-lm-ink-3)" fontSize={10}>
            {formatDay(points[points.length - 1].day)}
          </text>
        </svg>

        {hovered ? (
          <div
            className="lm-shadow-pop pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lm-md border border-lm-line bg-lm-raised px-3 py-2 text-xs"
            style={{ left: `${Math.min(Math.max(tooltipLeftPct, 12), 88)}%` }}
          >
            <p className="mb-1 font-medium text-lm-ink">{formatDay(hovered.day, { day: "2-digit", month: "short" })}</p>
            <p className="flex items-center justify-between gap-4 text-lm-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: WON_COLOR }} />
                Cierres
              </span>
              <span className="font-mono tabular-nums text-lm-ink">{hovered.won}</span>
            </p>
            <p className="flex items-center justify-between gap-4 text-lm-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: CONTACTED_COLOR }} />
                Contactos
              </span>
              <span className="font-mono tabular-nums text-lm-ink">{hovered.contacted}</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
