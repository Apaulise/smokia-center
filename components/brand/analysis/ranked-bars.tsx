import type { PatternRow } from "@/lib/brand/insights";

// Mismo criterio que audience-bars.tsx: una sola serie de "resultado" (manual
// §9), rankeada por magnitud — el número siempre al lado de la barra, nunca
// sólo el color como codificación (dataviz).
const BAR_COLOR = "#18D6E8";

export function RankedBars({ rows, emptyMessage }: { rows: PatternRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  // A diferencia de audience-bars.tsx, acá value suele ser una tasa (<1) —
  // un piso fijo de 1 aplastaría todas las barras. Sólo hace falta piso
  // cuando el máximo real es 0, para no dividir por cero.
  const max = Math.max(...rows.map((r) => r.value)) || 1;

  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="group space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{row.label}</span>
            <span className="tabular shrink-0 text-muted">{row.displayValue}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface/60">
            <div
              className="h-full rounded-full transition-[filter] duration-150 group-hover:brightness-125"
              style={{ width: `${(row.value / max) * 100}%`, backgroundColor: BAR_COLOR }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
