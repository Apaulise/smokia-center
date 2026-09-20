import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
        description="Calculados del estado real del planificador, las métricas y la base de conocimiento."
      />
      <CardBody>
        {steps.length === 0 ? (
          <p className="text-sm text-muted">Nada pendiente: la cadencia, las hipótesis y la sincronización están en orden.</p>
        ) : (
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.id} className="flex items-start gap-4 border-b border-line/60 pb-4 last:border-0 last:pb-0">
                <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-muted">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{step.title}</p>
                  <p className="mt-1 text-xs text-muted">{step.detail}</p>
                </div>
                <Link
                  href={step.href}
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs text-cyan hover:underline"
                >
                  {step.cta}
                  <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
