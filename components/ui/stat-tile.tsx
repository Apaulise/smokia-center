import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Métrica del dashboard. El número usa fuente mono con cifras tabulares
 * (manual §4: JetBrains Mono para datos) para que no baile al actualizarse.
 */
export function StatTile({
  label,
  value,
  hint,
  accent = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "neutral" | "cyan" | "violet";
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-line bg-elevated/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              accent === "cyan" && "text-cyan",
              accent === "violet" && "text-violet",
              accent === "neutral" && "text-muted",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "tabular mt-3 text-3xl leading-none font-medium",
          accent === "cyan" && "text-cyan",
          accent === "violet" && "text-[#c4a6ff]",
          accent === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>

      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
