import { Meter } from "@/components/brand/ui/card";
import type { PatternRow } from "@/lib/brand/insights";

/** Filas rankeadas por magnitud: una sola serie neutra, con el número siempre al lado de la barra (dataviz). */
export function RankedBars({ rows, emptyMessage }: { rows: PatternRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="text-[12.5px] leading-normal text-lm-ink-3">{emptyMessage}</p>;
  }

  // A diferencia de audience-bars.tsx, acá value suele ser una tasa (<1) —
  // un piso fijo de 1 aplastaría todas las barras. Sólo hace falta piso
  // cuando el máximo real es 0, para no dividir por cero.
  const max = Math.max(...rows.map((r) => r.value)) || 1;

  return (
    <ol className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-[7px]">
          <div className="flex gap-3 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-lm-ink">{row.label}</span>
            <span className="shrink-0 font-mono text-xs text-lm-ink tabular-nums">{row.displayValue}</span>
          </div>
          <Meter percent={(row.value / max) * 100} />
        </li>
      ))}
    </ol>
  );
}
