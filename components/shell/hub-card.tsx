import { ArrowUpRight, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Tarjeta de un gestor en la pantalla global. Habilitada es un link al gestor
 * con la pantalla real como preview; el hover agranda sólo el preview; deshabilitada se ve completa pero
 * apagada, para que la estructura del negocio se lea entera (CLAUDE.md §2).
 */
export function HubCard({
  eyebrow,
  title,
  href,
  icon,
  children,
  disabledNote,
}: {
  eyebrow: string;
  title: string;
  href: string;
  icon: ReactNode;
  children?: ReactNode;
  /** Si viene, la tarjeta no es navegable y muestra esta nota. */
  disabledNote?: string;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lm-md border border-lm-line-strong text-lm-ink-2">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">{eyebrow}</p>
          <h2 className="mt-0.5 font-lm-sans text-lg font-medium text-lm-ink">{title}</h2>
        </div>
        {disabledNote ? (
          <Lock className="size-4 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
        ) : (
          <ArrowUpRight
            className="size-4 shrink-0 text-lm-ink-3 transition-colors group-hover:text-lm-signal-text"
            strokeWidth={1.5}
          />
        )}
      </div>

      <div className="mt-4 flex-1">
        {disabledNote ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-lm-md border border-dashed border-lm-line-strong p-4">
            <p className="max-w-xs text-center text-[13px] leading-[1.5] text-lm-ink-3">{disabledNote}</p>
          </div>
        ) : (
          // El hover vive en el preview, no en la tarjeta (estilos en .hub-preview, globals.css).
          <div className="hub-preview">
            {children}
          </div>
        )}
      </div>
    </>
  );

  const base = "flex flex-col rounded-lm-lg border border-lm-line bg-lm-surface p-5";

  if (disabledNote) {
    return (
      <div className={cn(base, "cursor-not-allowed opacity-60")} aria-disabled="true">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(base, "group transition-colors duration-500 hover:border-lm-line-strong")}
    >
      {body}
    </Link>
  );
}

