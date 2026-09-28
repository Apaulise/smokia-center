import Link from "next/link";

import { Card, CardHeader } from "@/components/brand/ui/card";
import type { NextStep } from "@/lib/brand/goals/next-steps";

/**
 * "Próximos pasos" (Plans/03 §3.13). Cada paso lo calcula el código del estado real
 * y trae el número que lo justifica: no es un consejo genérico. Con todo en orden
 * lo dice en vez de inventar tareas.
 */
export function NextStepsCard({ steps }: { steps: NextStep[] }) {
  return (
    <Card>
      <CardHeader
        title="Próximos pasos"
        description="Calculados del planificador, las métricas y la base de conocimiento."
      />
      {steps.length === 0 ? (
        <p className="px-5 py-[18px] text-[12.5px] leading-[1.5] text-lm-ink-2">
          Nada pendiente: la cadencia, las hipótesis y la sincronización están en orden.
        </p>
      ) : (
        <ol className="flex flex-col px-5 pt-1 pb-2">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 border-b border-lm-line py-4 last:border-0"
            >
              <span className="row-span-2 grid size-[22px] place-items-center rounded-full border border-lm-line-strong font-mono text-[11px] text-lm-ink-2">
                {index + 1}
              </span>
              <span className="text-[13.5px] font-medium text-lm-ink">{step.title}</span>
              <Link
                href={step.href}
                className="text-xs whitespace-nowrap text-lm-ink-2 transition-colors hover:text-lm-signal-text"
              >
                {step.cta} →
              </Link>
              <span className="col-span-2 text-[12.5px] leading-normal text-lm-ink-2">{step.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
