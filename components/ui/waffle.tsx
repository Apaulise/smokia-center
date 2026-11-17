import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export interface WaffleSegment {
  key: string;
  label: string;
  value: number;
  /** Color CSS: un token del sistema (`var(--color-lm-smoke-5)`). */
  color: string;
  /** Relleno rayado en vez de sólido: para la serie secundaria. */
  hatch?: boolean;
}

/** Reparte `total` celdas entre los segmentos por mayor resto: la suma da siempre `total`. */
function allocateCells(values: number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / sum) * total);
  const cells = exact.map(Math.floor);
  let remaining = total - cells.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    cells[i] += 1;
    remaining -= 1;
  }
  return cells;
}

/**
 * Gráfico de unidades: una grilla de cuadraditos donde cada uno vale lo mismo.
 * Lee una proporción de un vistazo y es más honesto que un donut (el ojo
 * compara áreas iguales). Sin color nuevo: grises del humo, y rayado para la
 * serie secundaria, así que se entiende también sin distinguir tonos.
 */
export function Waffle({
  segments,
  columns = 20,
  rows = 5,
  className,
}: {
  segments: WaffleSegment[];
  columns?: number;
  rows?: number;
  className?: string;
}) {
  const total = columns * rows;
  const cells = allocateCells(
    segments.map((s) => s.value),
    total,
  );
  const sum = segments.reduce((a, s) => a + s.value, 0);

  const squares = segments.flatMap((segment, index) =>
    Array.from({ length: cells[index] }, (_, n) => ({ segment, id: `${segment.key}-${n}` })),
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${sum > 0 ? Math.round((s.value / sum) * 100) : 0} %`).join(", ")}
      >
        {squares.map(({ segment, id }) => (
          <span
            key={id}
            className={cn("aspect-square rounded-[1px]", segment.hatch && "lm-hatch")}
            style={segment.hatch ? ({ "--hatch": segment.color } as CSSProperties) : { backgroundColor: segment.color }}
          />
        ))}
        {/* Sin datos: celdas vacías, para que el lugar no colapse. */}
        {squares.length === 0
          ? Array.from({ length: total }, (_, n) => <span key={n} className="aspect-square rounded-[1px] bg-lm-raised" />)
          : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-[12.5px]">
            <span
              className={cn("size-2 shrink-0 rounded-[1px]", segment.hatch && "lm-hatch")}
              style={segment.hatch ? ({ "--hatch": segment.color } as CSSProperties) : { backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-lm-ink">{segment.label}</span>
            <span className="font-mono text-lm-ink-2 tabular-nums">
              {sum > 0 ? `${Math.round((segment.value / sum) * 100)} %` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
