import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/*
 * Manual §9: "Botón principal: degradado; botón secundario: borde azul
 * translúcido", y §9 web: "Mantener legibilidad AA como mínimo".
 *
 * Las dos cosas chocan si el degradado va hasta el violeta: texto blanco sobre
 * #18D6E8 da 1.7:1 y texto oscuro sobre #7C3AED da 3.3:1 — ninguno pasa AA. Por
 * eso el botón usa el tramo cyan→azul del degradado con texto oscuro, donde el
 * peor punto (#4C7DFF) da 5.3:1. El degradado completo queda para superficies
 * grandes y texto decorativo, donde no hay que leer encima.
 */
const VARIANTS: Record<Variant, string> = {
  primary: cn(
    "bg-[linear-gradient(135deg,#18D6E8_0%,#4C7DFF_100%)] text-base font-semibold",
    "hover:brightness-110 hover:shadow-[0_0_22px_rgb(24_214_232/0.28)]",
  ),
  secondary: cn(
    "border border-line bg-elevated/60 text-ink",
    "hover:border-cyan/40 hover:bg-elevated",
  ),
  ghost: "text-muted hover:bg-surface/60 hover:text-ink",
  danger: cn(
    "border border-danger/30 bg-danger/10 text-danger",
    "hover:border-danger/50 hover:bg-danger/20",
  ),
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

const BASE = cn(
  "inline-flex cursor-pointer items-center justify-center rounded-[12px]",
  "font-medium whitespace-nowrap transition-all duration-200",
  "focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:ring-offset-2",
  "focus-visible:ring-offset-base focus-visible:outline-none",
  "disabled:pointer-events-none disabled:opacity-40",
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}

/**
 * Mismo aspecto que Button, pero navega. Un <button> envolviendo un <a> no es
 * HTML válido, así que cuando la acción es ir a otra pantalla va esto.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
