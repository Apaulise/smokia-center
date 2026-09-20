import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { WEEKLY_REELS_MAX, WEEKLY_REELS_MIN } from "@/lib/brand/planner/schema";
import type { WeekSummary } from "@/lib/brand/planner/week";
import { cn } from "@/lib/utils";

/**
 * Las dos cosas que el SOC §19 pide mirar cada semana y que son más baratas de
 * ver en la grilla que de recordar: la cuenta de reels contra la cadencia base,
 * y la mezcla exploración / explotación. Cada número va con su texto: el color
 * nunca es la única codificación.
 */
export function WeekSummaryCard({
  summary,
  weekLabel,
  hasWinners,
}: {
  summary: WeekSummary;
  weekLabel: string;
  /** Si hay al menos un ganador vigente: sin ganadores, cero variantes es lo esperable, no una falla. */
  hasWinners: boolean;
}) {
  const { reels, total, variants, experiments } = summary;

  const cadence =
    reels < WEEKLY_REELS_MIN
      ? { tone: "text-warning", text: `Faltan ${WEEKLY_REELS_MIN - reels} para la cadencia base` }
      : reels > WEEKLY_REELS_MAX
        ? { tone: "text-muted", text: `${reels - WEEKLY_REELS_MAX} por encima de la cadencia base` }
        : { tone: "text-positive", text: "Dentro de la cadencia base" };

  const warnings: string[] = [];
  if (total > 0 && experiments === 0) {
    warnings.push("Ninguna pieza de esta semana es un experimento nuevo: la exploración no puede llegar a cero (SOC §19).");
  }
  if (total > 0 && hasWinners && variants === 0) {
    warnings.push("Hay ganadores vigentes y ninguna pieza de esta semana es una variante de uno (SOC §19).");
  }

  return (
    <Card className="px-6 py-5">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Reels de la semana · {weekLabel}</p>
          <p className="tabular mt-1 text-2xl text-ink">
            {reels}
            <span className="text-base text-muted"> de {WEEKLY_REELS_MIN}–{WEEKLY_REELS_MAX}</span>
          </p>
          <p className={cn("mt-1 text-xs", cadence.tone)}>{cadence.text}</p>
        </div>

        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Exploración / explotación</p>
          <p className="tabular mt-1 text-2xl text-ink">
            {experiments}
            <span className="text-base text-muted"> nuevas · </span>
            {variants}
            <span className="text-base text-muted"> variantes</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {total === 0 ? "Sin piezas planificadas esta semana." : `${total} ${total === 1 ? "pieza" : "piezas"} en total.`}
          </p>
        </div>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-line/60 pt-4">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
