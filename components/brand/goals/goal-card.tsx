import { CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { GoalDialogButton } from "@/components/brand/goals/goal-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  formatCount,
  formatIsoDate,
  formatPerDay,
  formatProgressLine,
  MIN_HISTORY_DAYS,
  type GoalProgress,
} from "@/lib/brand/goals/progress";
import type { BrandGoal } from "@/lib/brand/goals/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";

function Fact({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-1 text-base text-ink">{children}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * El medidor: relleno cyan (acción y resultado), pista del mismo tono más claro
 * (skill dataviz: la pista es un escalón de la misma rampa). El número va SIEMPRE
 * al lado, en el texto de arriba — el medidor solo no dice "49 de 10.000", dice
 * "casi vacío". Con un avance chico el relleno tiene un mínimo de 4 px: sin él,
 * 0,5 % es invisible y parece que el medidor no funciona.
 */
function Meter({ progress }: { progress: GoalProgress }) {
  const width = progress.fraction > 0 ? `max(${(progress.fraction * 100).toFixed(2)}%, 4px)` : "0";
  return (
    <div
      role="progressbar"
      aria-label="Avance hacia la meta de seguidores"
      aria-valuemin={0}
      aria-valuemax={progress.target}
      aria-valuenow={progress.current ?? 0}
      className="h-2 w-full overflow-hidden rounded-[4px] bg-cyan/15"
    >
      <div className="h-full rounded-[4px] bg-cyan" style={{ width }} />
    </div>
  );
}

/**
 * La meta de seguidores en el dashboard (Plans/03 §3.13). Sin ritmo inventado:
 * hasta juntar MIN_HISTORY_DAYS de fotos diarias dice cuánto historial hay, y no
 * proyecta nada.
 */
export function GoalCard({
  platform,
  goal,
  progress,
  currentFollowers,
}: {
  platform: BrandPlatform;
  goal: BrandGoal | null;
  progress: GoalProgress | null;
  currentFollowers: number | null;
}) {
  if (!goal || !progress) {
    return (
      <Card>
        <CardHeader
          title="Meta de seguidores"
          description="Definí a dónde querés llegar y la app te dice cómo vas y qué hacer después."
          action={
            <GoalDialogButton
              platform={platform}
              currentFollowers={currentFollowers}
              hasActiveGoal={false}
              label="Definir meta"
              variant="primary"
            />
          }
        />
        <CardBody>
          <p className="text-sm text-muted">
            {currentFollowers === null
              ? "Todavía no hay un conteo de seguidores: sincronizá la cuenta para poder definir una meta."
              : `Hoy tenés ${formatCount(currentFollowers)} seguidores.`}
          </p>
        </CardBody>
      </Card>
    );
  }

  const achieved = progress.achieved || goal.status === "CUMPLIDA";
  const pace = progress.pace;

  return (
    <Card>
      <CardHeader
        title="Meta de seguidores"
        description={goal.deadline ? `Plazo: ${formatIsoDate(goal.deadline)}` : "Sin plazo"}
        action={
          <GoalDialogButton
            platform={platform}
            currentFollowers={currentFollowers}
            hasActiveGoal={goal.status === "ACTIVA"}
            initialTarget={achieved ? undefined : goal.target_followers}
            initialDeadline={achieved ? null : goal.deadline}
            label={achieved ? "Definir otra meta" : "Cambiar meta"}
            variant={achieved ? "primary" : "secondary"}
          />
        }
      />
      <CardBody className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tabular text-2xl text-ink">
              {progress.current !== null ? formatProgressLine(progress.current, progress.target) : `— de ${formatCount(progress.target)}`}
            </p>
            {achieved ? (
              <Badge tone="positive">
                <CheckCircle2 className="size-3.5" />
                Meta cumplida
              </Badge>
            ) : progress.onTrack === true ? (
              <Badge tone="positive">
                <TrendingUp className="size-3.5" />
                Vas en camino
              </Badge>
            ) : progress.onTrack === false ? (
              <Badge tone="warning">
                <TrendingDown className="size-3.5" />
                Por debajo del ritmo necesario
              </Badge>
            ) : null}
          </div>
          <Meter progress={progress} />
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Fact
            label="Faltan"
            hint={progress.gained !== null ? `${progress.gained >= 0 ? "+" : ""}${formatCount(progress.gained)} desde que la definiste` : undefined}
          >
            {progress.remaining !== null ? formatCount(progress.remaining) : "—"}
          </Fact>

          <Fact
            label="Ritmo real"
            hint={pace ? `entre el ${formatIsoDate(pace.fromDay)} y el ${formatIsoDate(pace.toDay)}` : undefined}
          >
            {pace ? formatPerDay(pace.perDay) : <span className="text-sm text-muted">Sin historial suficiente, {progress.historyDays} de {MIN_HISTORY_DAYS} días</span>}
          </Fact>

          <Fact label="Ritmo necesario">
            {progress.neededPerDay !== null ? (
              formatPerDay(progress.neededPerDay)
            ) : (
              <span className="text-sm text-muted">
                {achieved ? "—" : progress.deadline ? "Plazo vencido" : "Sin plazo"}
              </span>
            )}
          </Fact>

          <Fact label="A este ritmo">
            {achieved ? (
              <span className="text-sm text-muted">—</span>
            ) : progress.projection?.kind === "FECHA" ? (
              formatIsoDate(progress.projection.date)
            ) : progress.projection?.kind === "ESTANCADO" ? (
              <span className="text-sm text-muted">No se llega: el ritmo es cero o negativo</span>
            ) : progress.projection?.kind === "LEJOS" ? (
              <span className="text-sm text-muted">Más de 10 años</span>
            ) : (
              <span className="text-sm text-muted">Sin ritmo medido</span>
            )}
          </Fact>
        </dl>

        {!pace && !achieved ? (
          <p className="text-xs text-muted">
            El ritmo sale de las fotos diarias del contador, no de un dato que entregue Instagram. Hasta tener {MIN_HISTORY_DAYS} días no se muestra: antes que una proyección inventada.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
