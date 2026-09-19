import { ResultBadge } from "@/components/brand/result-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  BASELINE_WINDOW,
  FAILED_THRESHOLD,
  formatMultiple,
  formatObjectiveValue,
  MATURATION_DAYS,
  MIN_BASELINE_SAMPLE,
  WINNER_THRESHOLD,
  type ObjectiveScore,
  type PostResult,
  type ResultObjective,
} from "@/lib/brand/insights";

function ScoreRow({ label, objective, score }: { label: string; objective: ResultObjective; score: ObjectiveScore | null }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      {score ? (
        <>
          <dd className="tabular mt-1 text-2xl text-ink">{formatMultiple(score.index)}</dd>
          <dd className="tabular mt-0.5 text-xs text-muted">
            {formatObjectiveValue(objective, score.value)} contra una mediana de {formatObjectiveValue(objective, score.median)}{" "}
            ({score.sample} piezas)
          </dd>
        </>
      ) : (
        <dd className="mt-1 text-sm text-muted">Sin baseline para este objetivo</dd>
      )}
    </div>
  );
}

/**
 * La clasificación de la ficha (Plans/03 §3.11) con las cuentas a la vista:
 * el valor de la pieza, la mediana contra la que se comparó y cuántas piezas
 * la componen. Es lo que permite reproducir el múltiplo a mano (SOC §24).
 */
export function ResultDetail({ result }: { result: PostResult | undefined }) {
  if (!result) return null;

  const explanation =
    result.classification === "MADURANDO"
      ? `Esta pieza se publicó hace menos de ${MATURATION_DAYS} días y todavía está sumando views: se clasifica cuando se asiente, para no compararla joven contra piezas ya maduras.`
      : result.classification === "SIN_BASELINE"
        ? `Hacen falta al menos ${MIN_BASELINE_SAMPLE} piezas anteriores del mismo formato, con datos, para tener contra qué comparar. Con menos, clasificar sería fabricar evidencia.`
        : null;

  return (
    <Card>
      <CardHeader
        title="Resultado contra tu baseline"
        description={`Mediana de las últimas ${BASELINE_WINDOW} piezas del mismo formato publicadas antes. Ganador desde ${formatMultiple(WINNER_THRESHOLD)}, experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)}.`}
      />
      <CardBody className="space-y-5">
        <ResultBadge result={result} />
        {explanation ? (
          <p className="text-sm text-muted">{explanation}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <ScoreRow label="Alcance" objective="ALCANCE" score={result.reach} />
            <ScoreRow label="Autoridad" objective="AUTORIDAD" score={result.authority} />
          </dl>
        )}
        <p className="text-xs text-muted">
          Alcance son las views. Autoridad es (guardados + comentarios + compartidos) sobre alcance. La conversión no se mide todavía.
        </p>
      </CardBody>
    </Card>
  );
}
