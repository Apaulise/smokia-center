import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Manual §9: cyan = acción/resultado, violeta = proceso/innovación.
 * Esa convención se respeta al elegir el tono, no se decide por pantalla.
 */
export type BadgeTone =
  | "neutral"
  | "cyan"
  | "violet"
  | "positive"
  | "warning"
  | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface/60 text-muted",
  cyan: "border-cyan/30 bg-cyan/10 text-cyan",
  violet: "border-violet/40 bg-violet/15 text-[#c4a6ff]",
  positive: "border-positive/30 bg-positive/10 text-positive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function Badge({
  tone = "neutral",
  color,
  children,
  className,
}: {
  tone?: BadgeTone;
  /** Color propio del rubro. Pisa el tono. */
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-xs font-medium whitespace-nowrap",
        !color && TONES[tone],
        className,
      )}
      style={
        color
          ? {
              // El color del rubro lo elige el usuario, así que se usa tenue de
              // fondo y saturado en el texto: legible sea cual sea.
              borderColor: `${color}55`,
              backgroundColor: `${color}1a`,
              color,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
