import type { ReactNode } from "react";

import type { StatusTemperatureGroup } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * Badge de etapa del pipeline (Design System StatusBadge): punto de color +
 * etiqueta, agrupado por temperatura. El color sólo refuerza; la etiqueta
 * siempre está escrita. En el header del detalle de lead funciona además
 * como selector de etapa (ver `StageSelect`).
 */
const DOT: Record<StatusTemperatureGroup, string> = {
  frio: "bg-lm-smoke-4",
  curso: "bg-lm-info",
  caliente: "bg-lm-signal",
  ganado: "bg-lm-success",
  pausa: "bg-lm-smoke-3",
  salida: "bg-lm-danger",
};

const TEXT: Record<StatusTemperatureGroup, string> = {
  frio: "text-lm-ink-2",
  curso: "text-lm-ink-2",
  caliente: "text-lm-ink",
  ganado: "text-lm-ink",
  pausa: "text-lm-ink-3",
  salida: "text-lm-ink-3",
};

const FILL: Record<StatusTemperatureGroup, string> = {
  frio: "border-lm-line",
  curso: "border-lm-line",
  caliente: "border-transparent bg-lm-signal-soft",
  ganado: "border-transparent bg-lm-success-soft",
  pausa: "border-lm-line",
  salida: "border-lm-line",
};

export function StatusBadge({
  group,
  children,
  className,
}: {
  group: StatusTemperatureGroup;
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-lm-sm border px-2 font-lm-sans text-xs font-medium whitespace-nowrap",
        FILL[group],
        TEXT[group],
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[group])} />
      {children}
    </span>
  );
}

/** Chip genérico (rubro, canal) sin semántica de temperatura. */
export function Chip({
  children,
  color,
  className,
}: {
  children: ReactNode;
  /** Color propio del rubro; pisa el estilo por defecto. */
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-lm-sm border border-lm-line px-2 font-lm-sans text-xs font-medium whitespace-nowrap text-lm-ink-2",
        className,
      )}
      style={color ? { borderColor: `${color}55`, backgroundColor: `${color}1a`, color } : undefined}
    >
      {children}
    </span>
  );
}
