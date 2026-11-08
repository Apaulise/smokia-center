import { WEEKLY_STATUS_LABEL } from "@/lib/weekly/labels";
import { formatResultMetricLine, formatResultOrigin, visibleSuggestion } from "@/lib/weekly/results";
import type { WeeklyChange } from "@/lib/weekly/types";

/** Origen, métricas y estado sugerido de un cambio. No muestra el texto del resultado. */
export function ChangeResultDetails({ change, editable = false }: { change: WeeklyChange; editable?: boolean }) {
  const origin = formatResultOrigin(change);
  const metrics = change.resultMetrics ?? [];
  const suggestion = visibleSuggestion(change);
  if (!origin && metrics.length === 0 && !suggestion) return null;

  return (
    <div className="flex flex-col gap-1">
      {origin ? <p className="m-0 text-[12.5px] text-lm-ink-3">{origin}</p> : null}
      {metrics.map((metric, index) => (
        <p key={`${metric.metric}-${index}`} className="m-0 font-mono text-[12.5px] leading-relaxed tabular-nums text-lm-ink-2">
          {formatResultMetricLine(metric)}
        </p>
      ))}
      {suggestion ? (
        <p className="m-0 text-[13px] text-lm-ink-2">
          Sugerido: {WEEKLY_STATUS_LABEL[suggestion]}
          {editable ? ". Guardar estado lo aplica." : "."}
        </p>
      ) : null}
    </div>
  );
}
