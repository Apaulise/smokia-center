import { ResultChip } from "@/components/brand/result-badge";
import { Card, CardBody, CardHeader, Eyebrow } from "@/components/brand/ui/card";
import {
  BASELINE_WINDOW,
  FAILED_THRESHOLD,
  formatMultiple,
  formatObjectiveValue,
  headlineScore,
  MATURATION_DAYS,
  MIN_BASELINE_SAMPLE,
  WINNER_THRESHOLD,
  type ObjectiveScore,
  type PostResult,
  type ResultObjective,
} from "@/lib/brand/insights";

function ScoreRow({ label, objective, score }: { label: string; objective: ResultObjective; score: ObjectiveScore | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      {score ? (
        <>
          <span className="font-mono text-[22px] leading-none tracking-[-0.02em] tabular-nums">{formatMultiple(score.index)}</span>
          <span className="font-mono text-[11.5px] text-lm-ink-3 tabular-nums">
            {formatObjectiveValue(objective, score.value)} contra una mediana de {formatObjectiveValue(objective, score.median)} (
            {score.sample} piezas)
          </span>
        </>
      ) : (
        <span className="text-[12.5px] text-lm-ink-2">Sin baseline para este objetivo</span>
      )}
    </div>
  );
}

/** "2026-09-26T…" + 3 días → "29/9". */
function maturesOn(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const date = new Date(new Date(publishedAt).getTime() + MATURATION_DAYS * 86_400_000);
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * La clasificación de la ficha (Plans/03 §3.11) con las cuentas a la vista:
 * el valor de la pieza, la mediana contra la que se comparó y cuántas piezas
 * la componen. Es lo que permite reproducir el múltiplo a mano (SOC §24).
 */
export function ResultDetail({ result, publishedAt }: { result: PostResult | undefined; publishedAt?: string | null }) {
  if (!result) return null;

  const explanation =
    result.classification === "MADURANDO"
      ? `Esta pieza se publicó hace menos de ${MATURATION_DAYS} días y todavía está sumando views: se clasifica cuando se asiente, para no compararla joven contra piezas ya maduras.`
      : result.classification === "SIN_BASELINE"
        ? `Hacen falta al menos ${MIN_BASELINE_SAMPLE} piezas anteriores del mismo formato, con datos, para tener contra qué comparar. Con menos, clasificar sería fabricar evidencia.`
        : null;

  const headline = headlineScore(result);
  const matures = result.classification === "MADURANDO" ? maturesOn(publishedAt ?? null) : null;

  return (
    <Card>
      <CardHeader
        title="Resultado contra tu baseline"
        description={`Mediana de las últimas ${BASELINE_WINDOW} piezas del mismo formato publicadas antes. Ganador desde ${formatMultiple(WINNER_THRESHOLD)}, experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)}.`}
      />
      <CardBody className="flex flex-col gap-3.5 px-5 py-[18px]">
        <div className="flex flex-wrap items-center gap-3.5">
          <ResultChip classification={result.classification} className="h-[22px] px-2 text-[11.5px]" />
          {headline ? (
            <span className="font-mono text-[11.5px] text-lm-ink-3">
              {formatMultiple(headline.score.index)} la mediana{explanation ? " hoy" : ""}
              {matures ? ` · sin clasificar hasta el ${matures}` : ""}
            </span>
          ) : null}
        </div>
        {explanation ? (
          <p className="text-[13.5px] leading-[1.6] text-lm-ink">{explanation}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <ScoreRow label="Alcance" objective="ALCANCE" score={result.reach} />
            <ScoreRow label="Autoridad" objective="AUTORIDAD" score={result.authority} />
          </dl>
        )}
        <p className="text-xs leading-normal text-lm-ink-3">
          Alcance son las views. Autoridad es (guardados + comentarios + compartidos) sobre alcance. La conversión no se mide todavía.
        </p>
      </CardBody>
    </Card>
  );
}
