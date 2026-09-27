import type { ReactNode } from "react";

/**
 * Encabezado de pantalla del Gestor de Leads: header bar delgado (56px, con
 * breadcrumb) + un bloque de contenido opcional (eyebrow, H2, descripción,
 * acción). Paralelo a `@/components/shell/page-header`, que sigue usando el
 * Gestor de Marca Personal — no se toca ese mientras Marca esté fuera de
 * alcance (CLAUDE.md §2).
 */
export function HeaderBar({ breadcrumb, meta }: { breadcrumb: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-lm-line px-6 font-lm-sans text-[13px] text-lm-ink-2 lg:px-8">
      <span className="truncate">{breadcrumb}</span>
      {meta ? <span className="shrink-0 font-mono text-[11px] text-lm-ink-3">{meta}</span> : null}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 font-lm-sans text-[28px] leading-8 font-semibold tracking-[-0.02em] text-lm-ink">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-[13.5px] text-lm-ink-2">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
