"use client";

import { useState, type PointerEvent } from "react";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 24, left: 12 };
const INNER_WIDTH = WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

export interface LineChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface LineChartPoint {
  day: string;
  [key: string]: string | number | null;
}

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
 * Línea genérica de 1-N series sobre un mismo eje (skill dataviz: nunca dos
 * escalas en un mismo chart — por eso comparte una sola unidad por instancia,
 * ej. seguidores en un chart aparte de alcance+interacciones). Mismo SVG a
 * mano que components/leads/dashboard/activity-timeline-chart.tsx.
 *
 * Cada serie dibuja sólo sus puntos no nulos: a días de sincronizar, la
 * mayoría de las series todavía tiene huecos, y unir sólo lo conocido es más
 * honesto que inventar un valor.
 */
export function BrandLineChart({
  points,
  series,
  minPointsMessage = "Necesitás más días de sincronización para ver esta curva.",
}: {
  points: LineChartPoint[];
  series: LineChartSeries[];
  minPointsMessage?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const seriesPoints = series.map((s) => ({
    ...s,
    coords: points
      .map((p, i) => [i, p[s.key]] as const)
      .filter((pair): pair is [number, number] => typeof pair[1] === "number"),
  }));

  const usableCount = Math.max(0, ...seriesPoints.map((s) => s.coords.length));
  if (points.length === 0 || usableCount < 2) {
    return <p className="text-sm text-muted">{minPointsMessage}</p>;
  }

  const allValues = seriesPoints.flatMap((s) => s.coords.map(([, v]) => v));
  const yMax = niceCeil(Math.max(1, ...allValues));

  const xAt = (i: number) => PADDING.left + (points.length <= 1 ? INNER_WIDTH / 2 : (i / (points.length - 1)) * INNER_WIDTH);
  const yAt = (v: number) => PADDING.top + INNER_HEIGHT - (v / yMax) * INNER_HEIGHT;

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
      {series.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label={series.map((s) => s.label).join(" y ")}
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
              stroke="var(--color-line)"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          ))}

          {hoverIndex !== null ? (
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
          ) : null}

          {seriesPoints.map((s) => (
            <path
              key={s.key}
              d={buildPath(s.coords.map(([i, v]) => [xAt(i), yAt(v)]))}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {seriesPoints.map((s) => {
            const last = s.coords.at(-1);
            return last ? (
              <circle key={s.key} cx={xAt(last[0])} cy={yAt(last[1])} r={4} fill={s.color} stroke="var(--color-elevated)" strokeWidth={2} />
            ) : null;
          })}

          {hoverIndex !== null
            ? seriesPoints.map((s) => {
                const value = points[hoverIndex][s.key];
                if (typeof value !== "number") return null;
                return (
                  <circle
                    key={s.key}
                    cx={xAt(hoverIndex)}
                    cy={yAt(value)}
                    r={4}
                    fill={s.color}
                    stroke="var(--color-elevated)"
                    strokeWidth={2}
                  />
                );
              })
            : null}

          <text x={PADDING.left} y={HEIGHT - 6} fill="var(--color-muted)" fontSize={10}>
            {formatDay(points[0].day)}
          </text>
          <text x={WIDTH - PADDING.right} y={HEIGHT - 6} textAnchor="end" fill="var(--color-muted)" fontSize={10}>
            {formatDay(points[points.length - 1].day)}
          </text>
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[12px] border border-line bg-elevated px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(Math.max(tooltipLeftPct, 12), 88)}%` }}
          >
            <p className="mb-1 font-medium text-ink">{formatDay(hovered.day, { day: "2-digit", month: "short" })}</p>
            {series.map((s) => {
              const value = hovered[s.key];
              return (
                <p key={s.key} className="flex items-center justify-between gap-4 text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="tabular text-ink">{typeof value === "number" ? value : "—"}</span>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
