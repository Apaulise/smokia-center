import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Dos formas de alternar vistas (Design System Tabs): segmented control para
 * modos de visualización, tabs subrayados para secciones de contenido.
 */
export function Segmented({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lm-sm border border-lm-line bg-lm-surface p-0.5">{children}</div>
  );
}

export function SegmentedLink({
  active,
  className,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      className={cn(
        "flex h-7 items-center rounded-[3px] px-3 font-lm-sans text-[13px] font-medium text-lm-ink-2 transition-colors",
        active ? "bg-lm-raised text-lm-ink" : "hover:text-lm-ink",
        className,
      )}
      {...props}
    />
  );
}

export function SegmentedButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-7 items-center rounded-[3px] px-3 font-lm-sans text-[13px] font-medium text-lm-ink-2 transition-colors",
        active ? "bg-lm-raised text-lm-ink" : "hover:text-lm-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Tabs({ children }: { children: ReactNode }) {
  return <nav className="flex gap-6 border-b border-lm-line">{children}</nav>;
}

export function TabLink({
  active,
  className,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      className={cn(
        "-mb-px border-b-2 border-transparent py-2 font-lm-sans text-sm text-lm-ink-2 transition-colors",
        active ? "border-lm-signal text-lm-ink" : "hover:text-lm-ink",
        className,
      )}
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
      className={cn(
        "-mb-px border-b-2 border-transparent py-2 font-lm-sans text-sm text-lm-ink-2 transition-colors",
        active ? "border-lm-signal text-lm-ink" : "hover:text-lm-ink",
        className,
      )}
      {...props}
    />
  );
}
