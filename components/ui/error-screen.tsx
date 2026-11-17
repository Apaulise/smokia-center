import { AlertTriangle, Compass } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pantalla de error y de "no existe", con el estilo de la app. La usan los
 * `error.tsx`, `not-found.tsx` y `global-error.tsx`. Dos marcos:
 *  - `stage`: dentro del shell (la barra lateral sigue ahí); ocupa el escenario.
 *  - `page`: sin shell (pantalla de inicio, login, URL que no existe); dibuja
 *    su propio fondo y su panel de vidrio.
 */
export function ErrorScreen({
  kind,
  title,
  description,
  code,
  detail,
  actions,
  frame = "stage",
}: {
  kind: "error" | "not-found";
  title: string;
  description: string;
  /** Identificador del error del servidor (`digest`): sirve para buscarlo en los logs. */
  code?: string | null;
  /** Mensaje técnico. Sólo en desarrollo: en producción Next lo oculta igual. */
  detail?: string | null;
  actions: ReactNode;
  frame?: "stage" | "page";
}) {
  const Icon = kind === "error" ? AlertTriangle : Compass;

  const body = (
    <div className="lm-rise flex w-full max-w-md flex-col items-center gap-5 text-center" role={kind === "error" ? "alert" : undefined}>
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full shadow-[inset_0_1px_0_var(--lm-glass-edge)]",
          kind === "error" ? "bg-lm-danger-soft text-lm-danger" : "bg-lm-ink/6 text-lm-ink-2",
        )}
      >
        <Icon className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] font-medium tracking-[0.14em] text-lm-ink-3 uppercase">{kind === "error" ? "Error" : "404"}</p>
        <h1 className="font-lm-sans text-[clamp(22px,2.4vw,28px)] leading-[1.2] font-medium tracking-[-0.03em] text-balance text-lm-ink">{title}</h1>
        <p className="text-[13.5px] leading-[1.55] text-pretty text-lm-ink-2">{description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      {code ? (
        <p className="text-xs text-lm-ink-3">
          Código del error: <span className="font-mono text-lm-ink-2 select-all">{code}</span>
        </p>
      ) : null}
      {detail ? (
        <pre className="max-h-40 w-full overflow-auto rounded-lm-md border border-lm-line bg-lm-ink/5 p-3 text-left font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-lm-ink-2">
          {detail}
        </pre>
      ) : null}
    </div>
  );

  if (frame === "stage") {
    return <div className="lm-page-min grid place-items-center px-6 py-16 font-lm-sans">{body}</div>;
  }

  return (
    <div className="grid min-h-dvh place-items-center p-3 font-lm-sans text-lm-ink">
      <div className="lm-ambient" aria-hidden />
      <div className="lm-stage grid min-h-[min(560px,calc(100dvh-24px))] w-full max-w-3xl place-items-center rounded-lm-2xl px-6 py-14">{body}</div>
    </div>
  );
}

/** Lo que se le muestra a la persona de un error: el código siempre, el mensaje sólo en desarrollo. */
export function describeError(error: unknown): { code: string | null; detail: string | null } {
  const code = error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  const detail = process.env.NODE_ENV === "development" && error instanceof Error ? error.message : null;
  return { code, detail };
}
