import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Composer contextual del detalle de lead (Design System Conversation): un
 * solo bloque que cambia de contenido según la etapa (apertura, analizar,
 * seguimiento). El texto generado siempre es editable antes de enviar.
 */
export function Composer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lm-lg border border-lm-line-strong bg-lm-surface", className)}>{children}</div>
  );
}

export function ComposerHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-lm-line px-3 py-2">{children}</div>
  );
}

export function ComposerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-16 p-3 text-[13px] text-lm-ink", className)}>{children}</div>;
}

export function ComposerFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-lm-line px-3 py-2">{children}</div>
  );
}
