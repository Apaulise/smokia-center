import type { ReactNode } from "react";

/** Estado vacío. Siempre con una salida: qué hacer para que deje de estar vacío. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-line bg-surface/60 text-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
