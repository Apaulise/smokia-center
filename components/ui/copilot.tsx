import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Panel derecho del detalle de lead (Design System Copilot): score en mono +
 * `signal-text`, dolores/objeciones/señales como chips, shimmer de humo
 * mientras la IA procesa (nunca spinners).
 */
export function CopilotScore({ value, reason }: { value: number; reason?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <b className="font-mono text-[28px] leading-8 font-medium text-lm-signal-text">{value}</b>
      <span className="text-[13px] text-lm-ink-2">/10 interés{reason ? <> · {reason}</> : null}</span>
    </div>
  );
}

type ChipVariant = "pain" | "objection" | "signal";

const CHIP_VARIANT: Record<ChipVariant, string> = {
  pain: "border-lm-line-strong",
  objection: "border-dashed border-lm-line-strong text-lm-ink-2",
  signal: "border-transparent bg-lm-signal-soft text-lm-ink",
};

export function CopilotChip({
  variant = "pain",
  children,
  title,
}: {
  variant?: ChipVariant;
  children: ReactNode;
  /** Evidencia citada: se ve como tooltip nativo por ahora. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center rounded-lm-sm border border-lm-line bg-lm-raised px-2 text-xs text-lm-ink",
        CHIP_VARIANT[variant],
        title && "cursor-help decoration-dotted underline-offset-4 hover:underline",
      )}
    >
      {children}
    </span>
  );
}

export function CopilotLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
      {children}
    </span>
  );
}

/** Shimmer de humo: 1-2 barras mientras la IA enriquece o analiza. */
export function SmokeLines({ count = 2 }: { count?: number }) {
  const widths = ["92%", "68%", "80%"];
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="lm-smoke" style={{ width: widths[index % widths.length] }} />
      ))}
    </div>
  );
}
