import { cn } from "@/lib/utils";

/**
 * Embudo horizontal único (Design System Pipeline): reemplaza los dos
 * embudos anteriores del dashboard ("por estado" y "de prospección"). Los
 * números salen de una sola fuente (`getProspectingFunnel`, Plan §1.17) para
 * que el KPI de arriba y la etapa acá siempre coincidan.
 */
export interface PipelineStageData {
  label: string;
  value: number;
  /** % respecto de la etapa anterior. `null` en la primera etapa (siempre 100%). */
  conversion: number | null;
  hot?: boolean;
}

export function Pipeline({ stages }: { stages: PipelineStageData[] }) {
  return (
    <div
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
    >
      {stages.map((stage, index) => {
        const zero = stage.value === 0;
        const prevValue = index === 0 ? stage.value : stages[index - 1].value;
        const width = prevValue > 0 ? Math.max(4, (stage.value / prevValue) * 100) : 0;

        return (
          <div key={stage.label} className={cn("flex flex-col gap-2", zero && "opacity-45")}>
            <span className="truncate font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
              {stage.label}
            </span>
            <span className="font-mono text-xl leading-6 font-medium tabular-nums text-lm-ink">
              {stage.value}
            </span>
            <div className="h-1.5 overflow-hidden rounded-lm-xs bg-lm-smoke-1">
              {zero ? null : (
                <div
                  className={cn("h-full", stage.hot ? "bg-lm-signal" : "bg-lm-smoke-3")}
                  style={{ width: `${width}%` }}
                />
              )}
            </div>
            <span className="font-mono text-xs leading-4 text-lm-ink-3">
              {stage.conversion === null ? "100 %" : `${stage.conversion} %`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineExits({ exits }: { exits: { label: string; value: number }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-6 border-t border-lm-line pt-3 font-lm-sans text-[13px] text-lm-ink-3">
      {exits.map((exit) => (
        <span key={exit.label}>
          {exit.label}
          <b className="ml-1.5 font-mono text-[13px] font-medium text-lm-ink-2">{exit.value}</b>
        </span>
      ))}
    </div>
  );
}
