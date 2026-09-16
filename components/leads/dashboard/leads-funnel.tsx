import type { BadgeTone } from "@/components/ui/badge";
import type { FunnelStage } from "@/lib/leads/queries";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/** Mismo tono que las badges de estado (STATUS_TONE): un lead en AGENDADO es violeta en toda la app, embudo incluido. */
const TONE_FILL_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-line",
  cyan: "bg-cyan",
  violet: "bg-violet",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Embudo por estado (Plan §1.4). Cada barra ya muestra etapa + valor: el color nunca es la única fuente del dato. */
export function LeadsFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.lead_count));

  return (
    <ol className="space-y-3">
      {stages.map((stage) => {
        const pct = (stage.lead_count / max) * 100;
        return (
          <li key={stage.status} className="group space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{STATUS_LABEL[stage.status]}</span>
              <span className="tabular text-muted">{stage.lead_count}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface/60">
              <div
                className={cn(
                  "h-full rounded-full transition-[filter] duration-150 group-hover:brightness-125",
                  TONE_FILL_CLASS[STATUS_TONE[stage.status]],
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
