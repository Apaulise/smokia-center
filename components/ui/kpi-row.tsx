import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Fila de métricas: un solo panel de vidrio con las métricas separadas por
 * líneas finas adentro (no una card por número). Un único KPI por fila va en
 * amarillo — el que importa en esta etapa del negocio.
 */
export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "lm-glass-soft grid overflow-hidden rounded-lm-lg border",
        // Mobile: dos por fila (en una sola fila los números se cortaban). Desde sm, todas en una fila.
        "grid-cols-2 max-xl:[&>*]:border-lm-line max-xl:[&>*:nth-child(even)]:border-l max-xl:[&>*:nth-child(n+3)]:border-t",
        "xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none xl:divide-x xl:divide-lm-line",
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
    <div className={cn("relative flex min-w-0 flex-col gap-2 px-3 py-4 sm:px-5", muted && "opacity-50", className)}>
      {mark ? <span className="absolute top-0 left-5 h-0.5 w-6 rounded-b-full bg-lm-signal" aria-hidden="true" /> : null}
      <span className="font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] wrap-anywhere text-lm-ink-3 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-2xl leading-tight font-medium tracking-[-0.04em] wrap-anywhere tabular-nums sm:text-[32px]",
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
