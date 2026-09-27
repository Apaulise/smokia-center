import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Botón del sistema "Señal y humo" (Design System Button). Primario amarillo
 * = la acción principal de la vista, uno solo por pantalla. No confundir con
 * `@/components/ui/button`, que sigue siendo el del Gestor de Marca Personal.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: cn(
    "border-lm-signal bg-lm-signal text-lm-on-signal font-semibold",
    "hover:border-lm-signal-hover hover:bg-lm-signal-hover",
  ),
  secondary: cn(
    "border-lm-line-strong bg-lm-surface text-lm-ink",
    "hover:bg-lm-raised",
  ),
  ghost: cn("border-transparent bg-transparent text-lm-ink-2", "hover:bg-lm-raised hover:text-lm-ink"),
  danger: cn("border-transparent bg-transparent text-lm-danger", "hover:bg-lm-danger-soft"),
};

const SIZES: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-[13px]",
};

const BASE = cn(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lm-sm border",
  "font-medium whitespace-nowrap transition-colors duration-150 ease-out font-lm-sans",
  "focus-visible:lm-focus",
  "disabled:pointer-events-none disabled:opacity-45",
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

/** Mismo aspecto que Button, pero navega (ver @/components/ui/button para el porqué del portal). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

/** Botón cuadrado sólo-ícono, 32×32. Siempre con aria-label. */
export function IconButton({
  className,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size; "aria-label": string }) {
  return (
    <button
      className={cn(
        BASE,
        "border-lm-line-strong bg-lm-surface text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink",
        size === "sm" ? "size-7" : "size-8",
        className,
      )}
      {...props}
    />
  );
}

/** Atajo de teclado en un chip mono, como el "⌘K" del buscador. */
export function Kbd({ className, children }: { className?: string; children: string }) {
  return (
    <span
      className={cn(
        "rounded-lm-xs border border-lm-line px-1 py-px font-mono text-[10.5px] font-medium text-lm-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}
