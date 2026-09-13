import type { ReactNode } from "react";

/** Encabezado de pantalla: un título, un subtítulo opcional y una acción. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line/60 px-6 py-6 lg:px-10 lg:py-8">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-[0.18em] text-cyan uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl lg:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
