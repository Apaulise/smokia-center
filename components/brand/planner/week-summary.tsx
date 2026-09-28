import { AlertTriangle } from "lucide-react";

import { Eyebrow } from "@/components/brand/ui/card";
import { WEEKLY_REELS_MAX, WEEKLY_REELS_MIN } from "@/lib/brand/planner/schema";
import type { WeekSummary } from "@/lib/brand/planner/week";
import { cn } from "@/lib/utils";

/**
 * Las dos cosas que el SOC §19 pide mirar cada semana y que son más baratas de
 * ver en la grilla que de recordar: la cuenta de reels contra la cadencia base,
 * y la mezcla exploración / explotación. Franja sin cards, con divisor
 * vertical. Cada número va con su texto: el color nunca es la única codificación.
 */
export function WeekSummaryStrip({
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
      ? { tone: "text-lm-danger", text: `Faltan ${WEEKLY_REELS_MIN - reels} para la cadencia base` }
      : reels > WEEKLY_REELS_MAX
        ? { tone: "text-lm-ink-3", text: `${reels - WEEKLY_REELS_MAX} por encima de la cadencia base` }
        : { tone: "text-lm-success", text: "Dentro de la cadencia base" };

  const warnings: string[] = [];
  if (total > 0 && experiments === 0) {
    warnings.push("Ninguna pieza de esta semana es un experimento nuevo: la exploración no puede llegar a cero (SOC §19).");
  }
  if (total > 0 && hasWinners && variants === 0) {
    warnings.push("Hay ganadores vigentes y ninguna pieza de esta semana es una variante de uno (SOC §19).");
  }

  return (
    <div className="border-y border-lm-line">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col gap-2 py-4 sm:pr-5">
          <Eyebrow>Reels de la semana · {weekLabel}</Eyebrow>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[26px] leading-none tracking-[-0.02em] tabular-nums">
              {reels}{" "}
              <span className="text-[15px] text-lm-ink-3">
                de {WEEKLY_REELS_MIN}–{WEEKLY_REELS_MAX}
              </span>
            </span>
            <span className={cn("text-xs", cadence.tone)}>{cadence.text}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-lm-line py-4 sm:border-t-0 sm:border-l sm:px-5">
          <Eyebrow>Exploración / explotación</Eyebrow>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[26px] leading-none tracking-[-0.02em] tabular-nums">
              {experiments} <span className="text-[15px] text-lm-ink-3">nuevas ·</span> {variants}{" "}
              <span className="text-[15px] text-lm-ink-3">variantes</span>
            </span>
            <span className="text-xs text-lm-ink-3">
              {total === 0 ? "Sin piezas planificadas esta semana." : `${total} ${total === 1 ? "pieza" : "piezas"} en total.`}
            </span>
          </div>
        </div>
      </div>

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5 border-t border-lm-line py-3.5">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-xs text-lm-ink-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-lm-signal-text" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
