import {
  FAILED_THRESHOLD,
  formatMultiple,
  headlineScore,
  MATURATION_DAYS,
  MIN_BASELINE_SAMPLE,
  RESULT_LABEL,
  WINNER_THRESHOLD,
  type PostResult,
  type ResultClass,
} from "@/lib/brand/insights";
import { cn } from "@/lib/utils";

/**
 * Chip de estado con borde 1px y radio 4 (handoff MARCA_PERSONAL.md):
 * Madurando neutro claro, Neutro apagado, Ganador en verde. Un experimento
 * fallido es información (SOC §17), no un error: va con el rojo suave del
 * sistema pero sin relleno.
 */
const CHIP: Record<ResultClass, string> = {
  GANADOR_ALCANCE: "border-lm-success/45 text-lm-success",
  GANADOR_AUTORIDAD: "border-lm-success/45 text-lm-success",
  GANADOR_CONVERSION: "border-lm-success/45 text-lm-success",
  NEUTRO: "border-lm-line text-lm-ink-3",
  EXPERIMENTO_FALLIDO: "border-lm-danger/40 text-lm-danger",
  SIN_BASELINE: "border-lm-line text-lm-ink-3",
  MADURANDO: "border-lm-line-strong text-lm-smoke-5",
};

const EXPLANATION: Partial<Record<ResultClass, string>> = {
  SIN_BASELINE: `Hacen falta al menos ${MIN_BASELINE_SAMPLE} piezas anteriores del mismo formato, con datos, para comparar.`,
  MADURANDO: `Publicada hace menos de ${MATURATION_DAYS} días: todavía está sumando views. Se clasifica cuando se asiente.`,
};

export function ResultChip({ classification, className }: { classification: ResultClass; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-lm-sm border px-[7px] font-lm-sans text-[11px] whitespace-nowrap",
        CHIP[classification],
        className,
      )}
    >
      {RESULT_LABEL[classification]}
    </span>
  );
}

/**
 * La clasificación de una pieza contra el baseline propio (Plans/03 §3.11).
 * El chip nunca va solo: al lado va el múltiplo ("2,3× la mediana"), porque
 * el color no es una codificación suficiente y el número es lo que se puede
 * contrastar. Sin múltiplo cuando no hay baseline — no hay nada que mostrar.
 */
export function ResultBadge({
  result,
  className,
  suffix = " la mediana",
}: {
  result: PostResult | undefined;
  className?: string;
  suffix?: string;
}) {
  if (!result) return null;

  const headline = headlineScore(result);
  const title =
    EXPLANATION[result.classification] ??
    `Ganador desde ${formatMultiple(WINNER_THRESHOLD)} la mediana; experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)}.`;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)} title={title}>
      <ResultChip classification={result.classification} />
      {headline ? (
        <span className="font-mono text-[11px] text-lm-ink-3 tabular-nums">
          {formatMultiple(headline.score.index)}
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
