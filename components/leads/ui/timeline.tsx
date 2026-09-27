import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Timeline de actividad del lead (Design System Conversation): eventos
 * entrantes (respuestas del prospecto) en punto `signal`, propios y del
 * sistema en `smoke-4`. Fecha/hora en mono, alineada a la derecha.
 */
export function Timeline({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

export function TimelineEvent({
  incoming = false,
  time,
  children,
  muted = false,
}: {
  incoming?: boolean;
  time: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[20px_1fr_auto] gap-3 border-b border-lm-line py-3 last:border-b-0">
      <span
        className={cn(
          "mx-auto mt-1.5 size-2 rounded-full",
          incoming ? "bg-lm-signal" : "bg-lm-smoke-4",
        )}
      />
      <div className={cn("min-w-0 font-lm-sans text-[13px] text-lm-ink", muted && "text-lm-ink-3")}>{children}</div>
      <span className="font-mono text-xs leading-5 whitespace-nowrap text-lm-ink-3">{time}</span>
    </div>
  );
}

/** Burbuja de mensaje dentro de un TimelineEvent. */
export function TimelineMessage({ children }: { children: ReactNode }) {
  return <div className="mt-1 rounded-lm-sm bg-lm-raised px-3 py-2 text-lm-ink">{children}</div>;
}
