import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Bloque de página sin card: eyebrow opcional + título + acción, separado
 * por espacio y un divisor — "líneas antes que cajas" (README del sistema).
 * Usar `Panel` en vez de esto sólo cuando el bloque es de verdad independiente
 * y movible (composer, copilot, modal).
 */
export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h3 className={cn("font-lm-sans text-[15px] font-semibold text-lm-ink", eyebrow && "mt-1")}>{title}</h3> : null}
            {description ? <p className="mt-1 text-[13px] text-lm-ink-2">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Contenedor con borde para lo que sí es independiente y movible. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lm-lg border border-lm-line-strong bg-lm-surface", className)}>{children}</div>
  );
}
