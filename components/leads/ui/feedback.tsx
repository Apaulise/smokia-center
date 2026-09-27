import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Estados vacíos y toasts (Design System Feedback): siempre dicen qué pasó y
 * qué hacer a continuación. Nunca una card grande vacía.
 */
export function EmptyLine({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 border-y border-dashed border-lm-line-strong py-4",
        className,
      )}
    >
      <p className="m-0 font-lm-sans text-[13px] text-lm-ink-2">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Estado vacío grande, para cuando ocupa toda la pantalla (cuenta nueva, lista vacía). */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 border-y border-dashed border-lm-line-strong px-6 py-16 text-center">
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-lm-line text-lm-ink-3">
          {icon}
        </div>
      ) : null}
      <h3 className="font-lm-sans text-[15px] font-semibold text-lm-ink">{title}</h3>
      {description ? <p className="max-w-sm text-[13px] text-lm-ink-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Toast({ tone = "success", children }: { tone?: "success" | "error"; children: ReactNode }) {
  return (
    <div className="lm-shadow-pop flex w-max items-center gap-3 rounded-lm-md bg-lm-raised px-4 py-3 font-lm-sans text-[13px] text-lm-ink">
      <span className={cn("size-2 shrink-0 rounded-full", tone === "success" ? "bg-lm-success" : "bg-lm-danger")} />
      {children}
    </div>
  );
}
