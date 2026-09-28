import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Card del Gestor de Marca Personal en "Señal y humo": borde fino, radio 8,
 * sin sombra ni glow. La cabecera lleva título 15px + subtítulo 12.5px y se
 * separa del cuerpo con una línea (handoff MARCA_PERSONAL.md, "Card").
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lm-lg border border-lm-line bg-lm-surface/50", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-lm-line px-5 py-4">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h3 className="font-lm-sans text-[15px] leading-5 font-medium text-lm-ink">{title}</h3>
        {description ? <p className="text-[12.5px] leading-[1.45] text-lm-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-[18px]", className)} {...props} />;
}

/** Label de métrica / sección: 10.5px, 0.12em, mayúsculas. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-lm-sans text-[10.5px] leading-[14px] font-medium tracking-[0.12em] text-lm-ink-3 uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Barra de 3px del sistema: pista `smoke-1`, relleno neutro (rojo sólo en "Para revisar", amarillo en la meta). */
export function Meter({
  percent,
  tone = "neutral",
  className,
  minPx,
}: {
  percent: number;
  tone?: "neutral" | "danger" | "signal";
  className?: string;
  /** Ancho mínimo en px cuando hay algo de avance: sin él, 1,2 % es invisible y parece roto. */
  minPx?: number;
}) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("h-[3px] overflow-hidden rounded-lm-xs bg-lm-raised", className)}>
      <div
        className={cn(
          "h-full rounded-lm-xs",
          tone === "neutral" && "bg-lm-smoke-4",
          tone === "danger" && "bg-lm-danger",
          tone === "signal" && "bg-lm-signal",
        )}
        style={{ width: `${width}%`, minWidth: width > 0 && minPx ? minPx : undefined }}
      />
    </div>
  );
}

/** Una métrica vacía se muestra como "—" atenuado, nunca como un 0 que parezca dato. */
export function EmptyValue() {
  return <span className="text-lm-smoke-3">—</span>;
}

/** Breadcrumb del header bar: "Marca personal / Biblioteca / Reel · 26/9". El último tramo va en primer plano. */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-lm-ink-3">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
            {index > 0 ? <span className="text-lm-smoke-3">/</span> : null}
            {item.href && !last ? (
              <Link href={item.href} className="truncate transition-colors hover:text-lm-ink">
                {item.label}
              </Link>
            ) : (
              <span className={cn("truncate", last && "text-lm-ink")}>{item.label}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Franja de métricas sin cards, con divisores verticales (igual que el
 * Dashboard de Leads). Una sola métrica puede ir en amarillo, con la marca de
 * 24×2px arriba: la que se mueve en el período.
 */
export function KpiStrip({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; sub?: ReactNode; subTone?: "up" | "muted"; accent?: boolean }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-lm-line border-y border-lm-line sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:divide-x",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="relative flex min-w-0 flex-col gap-2 px-5 py-[18px] first:pl-0 lg:first:pl-0">
          {item.accent ? <span className="absolute -top-px left-0 h-0.5 w-6 bg-lm-signal" /> : null}
          <Eyebrow className="truncate">{item.label}</Eyebrow>
          <span
            className={cn(
              "font-mono text-[26px] leading-none tracking-[-0.02em] tabular-nums",
              item.accent ? "text-lm-signal-text" : "text-lm-ink",
            )}
          >
            {item.value}
          </span>
          {item.sub ? (
            <span className={cn("text-[11.5px]", item.subTone === "up" ? "text-lm-success" : "text-lm-ink-3")}>{item.sub}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Chip del sistema: `solid` = relleno `raised` (categoría, origen), `outline` =
 * borde 1px (estado, atributo). Siempre 4px de radio; nada de píldoras.
 */
export function Tag({
  children,
  tone = "outline",
  size = "sm",
  className,
}: {
  children: ReactNode;
  tone?: "outline" | "solid";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-lm-sm whitespace-nowrap",
        size === "sm" ? "h-5 px-[7px] text-[11px]" : "h-[22px] px-2 text-[11.5px]",
        tone === "solid" ? "bg-lm-raised text-lm-smoke-5" : "border border-lm-line-strong text-lm-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
