import { Badge, type BadgeTone } from "@/components/ui/badge";
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

const TONE: Record<ResultClass, BadgeTone> = {
  GANADOR_ALCANCE: "positive",
  GANADOR_AUTORIDAD: "positive",
  GANADOR_CONVERSION: "positive",
  NEUTRO: "neutral",
  // Un experimento fallido es información (SOC §17), no un error: ámbar, no rojo.
  EXPERIMENTO_FALLIDO: "warning",
  SIN_BASELINE: "neutral",
  MADURANDO: "neutral",
};

const EXPLANATION: Partial<Record<ResultClass, string>> = {
  SIN_BASELINE: `Hacen falta al menos ${MIN_BASELINE_SAMPLE} piezas anteriores del mismo formato, con datos, para comparar.`,
  MADURANDO: `Publicada hace menos de ${MATURATION_DAYS} días: todavía está sumando views. Se clasifica cuando se asiente.`,
};

/**
 * La clasificación de una pieza contra el baseline propio (Plans/03 §3.11).
 * El badge nunca va solo: al lado va el múltiplo ("2,3× la mediana"), porque
 * el color no es una codificación suficiente y el número es lo que se puede
 * contrastar. Sin múltiplo cuando no hay baseline — no hay nada que mostrar.
 */
export function ResultBadge({ result, className }: { result: PostResult | undefined; className?: string }) {
  if (!result) return null;

  const headline = headlineScore(result);
  const title =
    EXPLANATION[result.classification] ??
    `Ganador desde ${formatMultiple(WINNER_THRESHOLD)} la mediana; experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)}.`;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)} title={title}>
      <Badge tone={TONE[result.classification]}>{RESULT_LABEL[result.classification]}</Badge>
      {headline ? <span className="tabular text-xs text-muted">{formatMultiple(headline.score.index)} la mediana</span> : null}
    </div>
  );
}
