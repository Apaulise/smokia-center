import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Dos formas de alternar vistas, las dos de la referencia de "Vidrio":
 * segmentado (pista translúcida, opción activa más clara y con sombra) para
 * modos de visualización, y dock de pastillas (`Tabs`) para secciones de
 * contenido, con la activa como pastilla clara.
 */
const SEGMENT =
  "flex h-7 items-center rounded-[6px] px-3 font-lm-sans text-[13px] font-medium text-lm-ink-2 transition-colors duration-150 ease-out focus-visible:lm-focus";
const SEGMENT_ACTIVE = "bg-lm-overlay text-lm-ink shadow-[0_2px_4px_rgb(0_0_0/0.12)]";

export function Segmented({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("inline-flex gap-0.5 rounded-lm-sm bg-lm-ink/6 p-[3px]", className)}>{children}</div>;
}

export function SegmentedLink({
  active,
  className,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return <Link className={cn(SEGMENT, active ? SEGMENT_ACTIVE : "hover:text-lm-ink", className)} {...props} />;
}

export function SegmentedButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" aria-pressed={active} className={cn(SEGMENT, active ? SEGMENT_ACTIVE : "hover:text-lm-ink", className)} {...props} />;
}

const TAB =
  "flex h-8 shrink-0 items-center gap-2 rounded-full px-4 font-lm-sans text-[13px] font-medium whitespace-nowrap text-lm-ink-2 transition-colors duration-200 ease-out focus-visible:lm-focus";

export function Tabs({ children, className, "aria-label": ariaLabel }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <nav aria-label={ariaLabel} className={cn("lm-glass-soft flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full border p-1", className)}>
      {children}
    </nav>
  );
}

export function TabLink({
  active,
  className,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(TAB, active ? "lm-pill-active" : "hover:bg-lm-ink/6 hover:text-lm-ink", className)}
      {...props}
    />
  );
}

export function TabButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(TAB, active ? "lm-pill-active" : "hover:bg-lm-ink/6 hover:text-lm-ink", className)}
      {...props}
    />
  );
}
