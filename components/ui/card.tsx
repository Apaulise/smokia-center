import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Manual §6: fondo #0C1730 al 75–92%, borde 1px #2B416D, radio 16–24px.
 * `glow` sólo para el foco principal de la pantalla — uno por vista (§5).
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: "cyan" | "violet";
}

export function Card({ glow, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line bg-elevated/80 backdrop-blur-sm",
        glow === "cyan" && "glow-cyan border-cyan/30",
        glow === "violet" && "glow-violet border-violet/30",
        className,
      )}
      {...props}
    />
  );
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
    <div className="flex items-start justify-between gap-4 border-b border-line/60 px-6 py-4">
      <div className="min-w-0">
        <h3 className="truncate text-base text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}
