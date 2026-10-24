import type { OpsImprovementItem } from "@/lib/ops/types";

export function AuditorList({ items }: { items: OpsImprovementItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div key={item.id} className="flex gap-4 border-b border-lm-line py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-lm-sans text-[10.5px] font-medium tracking-[0.12em] text-lm-ink-3 uppercase">{item.areaLabel}</p>
            <p className="mt-1 text-[13.5px] font-medium text-lm-ink">{item.title}</p>
            <p className="mt-1 text-[13px] leading-normal text-lm-ink-2">{item.body}</p>
          </div>
          <div className="flex w-[110px] shrink-0 flex-col items-end gap-1.5">
            <span className="font-mono text-[11px] text-lm-ink-3">{item.impactLabel}</span>
            <span className="h-[3px] w-24 overflow-hidden rounded-lm-xs bg-lm-raised">
              <span className="block h-full bg-lm-smoke-4" style={{ width: `${item.percent}%` }} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
