import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Fila de métricas del sistema "Señal y humo" (Design System KpiRow):
 * separadas por líneas finas, no cards. Un único KPI por fila va en amarillo
 * — el que importa en esta etapa del negocio.
 */
export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid auto-cols-fr grid-flow-col divide-x divide-lm-line border-y border-lm-line overflow-x-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  delta,
  trend = "neutral",
  signal = false,
  muted = false,
  mark = false,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  trend?: "up" | "down" | "neutral";
  /** El único KPI destacado de la fila. */
  signal?: boolean;
  /** Marca de 24×2 sobre el KPI destacado. */
  mark?: boolean;
  /** Métrica en 0: se atenúa en vez de ocupar el mismo espacio visual. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-2 px-4 py-4 first:pl-0 last:pr-0", muted && "opacity-50", className)}>
      {mark ? <span className="absolute -top-px left-4 h-0.5 w-6 bg-lm-signal" aria-hidden="true" /> : null}
      <span className="truncate font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[32px] leading-9 font-medium tracking-[-0.02em] tabular-nums",
          signal ? "text-lm-signal-text" : "text-lm-ink",
        )}
      >
        {value}
      </span>
      {delta ? (
        <span
          className={cn(
            "font-mono text-xs leading-4",
            trend === "up" && "text-lm-success",
            trend === "down" && "text-lm-danger",
            trend === "neutral" && "text-lm-ink-3",
          )}
        >
          {delta}
        </span>
      ) : null}
    </div>
  );
}
