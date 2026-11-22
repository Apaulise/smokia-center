import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Tabla densa por defecto (Design System DataTable): filas de 40px,
 * divisores finos, sin cebrado. Encabezados en eyebrow, números en mono a la
 * derecha. Fila seleccionada en `signal-soft`, hover en `raised`.
 */
export function Table({ className, children, label = "Tabla de resultados" }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain focus-visible:lm-focus">
      <table className={cn("w-full min-w-full border-collapse font-lm-sans text-[13px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, align, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return (
    <th
      className={cn(
        "border-b border-lm-line px-3 py-2 text-left font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase",
        align === "right" && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "h-10 border-b border-lm-line px-3 py-2.5 text-lm-ink",
        numeric && "text-right font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  selected,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn("group transition-colors duration-150", selected ? "bg-lm-signal-soft" : "hover:bg-lm-ink/5", className)}
      {...props}
    />
  );
}

/** Línea secundaria dentro de una celda (rubro · zona). */
export function TdSub({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block text-xs text-lm-ink-3">{children}</span>;
}

/** Mini barra de progreso inline, para tasas dentro de una celda. */
export function MiniBar({ percent }: { percent: number }) {
  return (
    <span className="mr-2 inline-block h-1 w-14 overflow-hidden rounded-lm-xs bg-lm-smoke-1 align-middle">
      <span className="block h-full bg-lm-signal" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </span>
  );
}

/** Menú de fila "⋯": visible siempre en touch, en hover en desktop vía opacity. */
export function RowMenuTrigger({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-7 items-center justify-center rounded-lm-sm text-lm-ink-3 transition-opacity hover:bg-lm-overlay hover:text-lm-ink pointer-coarse:min-w-11 pointer-fine:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
