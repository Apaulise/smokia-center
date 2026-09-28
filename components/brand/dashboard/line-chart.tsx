"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

const HEIGHT = 160;
const PADDING = { top: 2, right: 4, bottom: 2, left: 4 };
const INNER_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const DEFAULT_WIDTH = 540;

export interface LineChartSeries {
  key: string;
  label: string;
  /** Color CSS: un token del sistema (`var(--color-lm-ink)`), no un hex suelto. */
  color: string;
  /** Punteada 2/3, para la serie secundaria. */
  dashed?: boolean;
  /** Área tenue (8 %) bajo la línea. */
  area?: boolean;
}

export interface LineChartPoint {
  day: string;
  [key: string]: string | number | null;
}

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

function niceCeil(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10];
  const step = steps.find((s) => value <= s * magnitude) ?? 10;
  return step * magnitude;
}

/** "27/9" — el eje X del sistema va en Mono, sin ceros a la izquierda. */
function formatDay(day: string) {
  const [, month, date] = day.split("-").map(Number);
  return `${date}/${month}`;
}

function formatDayLong(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function buildPath(coords: [number, number][]) {
  return coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
}

/** Leyenda para la cabecera de la card (el mock la pone arriba a la derecha, no dentro del gráfico). */
export function ChartLegend({ series }: { series: LineChartSeries[] }) {
  return (
    <div className="flex gap-3.5 pt-[3px] text-[11.5px] text-lm-ink-2">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span
            className="w-3"
            style={{ borderTop: `2px ${s.dashed ? "dotted" : "solid"} ${s.color}`, height: 0 }}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Línea genérica de 1-N series sobre un mismo eje (skill dataviz: nunca dos
 * escalas en un mismo chart — por eso comparte una sola unidad por instancia,
 * ej. seguidores en un chart aparte de alcance+interacciones). SVG a mano en
 * píxeles reales (se mide el ancho), así el punto final no se deforma.
 *
 * Cada serie dibuja sólo sus puntos no nulos: a días de sincronizar, la
 * mayoría de las series todavía tiene huecos, y unir sólo lo conocido es más
 * honesto que inventar un valor.
 */
export function BrandLineChart({
  points,
  series,
  showPeak = false,
  minPointsMessage = "Necesitás más días de sincronización para ver esta curva.",
}: {
  points: LineChartPoint[];
  series: LineChartSeries[];
  /** Marca el pico de la primera serie en el eje X ("pico 9,5 k · 21/9"). */
  showPeak?: boolean;
  minPointsMessage?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const seriesPoints = series.map((s) => ({
    ...s,
    coords: points
      .map((p, i) => [i, p[s.key]] as const)
      .filter((pair): pair is [number, number] => typeof pair[1] === "number"),
  }));

  const usableCount = Math.max(0, ...seriesPoints.map((s) => s.coords.length));
  if (points.length === 0 || usableCount < 2) {
    return <p className="text-[12.5px] leading-[1.5] text-lm-ink-2">{minPointsMessage}</p>;
  }

  const innerWidth = width - PADDING.left - PADDING.right;
  const allValues = seriesPoints.flatMap((s) => s.coords.map(([, v]) => v));
  const yMax = niceCeil(Math.max(1, ...allValues));

  const xAt = (i: number) => PADDING.left + (points.length <= 1 ? innerWidth / 2 : (i / (points.length - 1)) * innerWidth);
  const yAt = (v: number) => PADDING.top + INNER_HEIGHT - (v / yMax) * INNER_HEIGHT;
  const baseY = yAt(0);

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipLeftPct = hoverIndex !== null ? (xAt(hoverIndex) / width) * 100 : 0;

  let peak: { value: number; day: string } | null = null;
  if (showPeak && seriesPoints[0]) {
    for (const [i, v] of seriesPoints[0].coords) {
      if (!peak || v > peak.value) peak = { value: v, day: points[i].day };
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const positionRatio = points.length <= 1 ? 0 : (svgX - PADDING.left) / innerWidth;
    const index = Math.round(positionRatio * (points.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block touch-none"
          role="img"
          aria-label={series.map((s) => s.label).join(" y ")}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {[0, 1, 2].map((n) => (
            <line
              key={n}
              x1={0}
              x2={width}
              y1={PADDING.top + (INNER_HEIGHT / 3) * n + 0.5}
              y2={PADDING.top + (INNER_HEIGHT / 3) * n + 0.5}
              stroke="var(--color-lm-line)"
            />
          ))}
          <line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--color-lm-line-strong)" strokeOpacity={0.7} />

          {hoverIndex !== null ? (
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT}
              stroke="var(--color-lm-line-strong)"
            />
          ) : null}

          {seriesPoints.map((s) => {
            const xy = s.coords.map(([i, v]) => [xAt(i), yAt(v)] as [number, number]);
            return (
              <g key={s.key}>
                {s.area ? (
                  <path
                    d={`${buildPath(xy)} L${xy.at(-1)![0].toFixed(1)},${baseY} L${xy[0][0].toFixed(1)},${baseY} Z`}
                    fill={s.color}
                    fillOpacity={0.08}
                  />
                ) : null}
                <path
                  d={buildPath(xy)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray={s.dashed ? "2 3" : undefined}
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {seriesPoints.map((s) => {
            const last = s.coords.at(-1);
            return last && !s.dashed ? <circle key={s.key} cx={xAt(last[0])} cy={yAt(last[1])} r={3} fill={s.color} /> : null;
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
                    r={3.5}
                    fill={s.color}
                    stroke="var(--color-lm-bg)"
                    strokeWidth={1.5}
                  />
                );
              })
            : null}
        </svg>

        {hovered ? (
          <div
            className="lm-shadow-pop pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lm-md bg-lm-raised px-3 py-2 text-xs"
            style={{ left: `${Math.min(Math.max(tooltipLeftPct, 12), 88)}%` }}
          >
            <p className="mb-1 font-medium text-lm-ink">{formatDayLong(hovered.day)}</p>
            {series.map((s) => {
              const value = hovered[s.key];
              return (
                <p key={s.key} className="flex items-center justify-between gap-4 text-lm-ink-2">
                  <span>{s.label}</span>
                  <span className="font-mono text-lm-ink tabular-nums">{typeof value === "number" ? value : "—"}</span>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex justify-between font-mono text-[10.5px] text-lm-smoke-3">
        <span>{formatDay(points[0].day)}</span>
        {peak ? (
          <span>
            pico {compact.format(peak.value)} · {formatDay(peak.day)}
          </span>
        ) : (
          <span>{formatDay(points[Math.floor((points.length - 1) / 2)].day)}</span>
        )}
        <span>{formatDay(points[points.length - 1].day)}</span>
      </div>
    </div>
  );
}
