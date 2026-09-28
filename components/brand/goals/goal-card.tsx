import type { ReactNode } from "react";

import { GoalDialogButton } from "@/components/brand/goals/goal-dialog";
import { Card, CardBody, CardHeader, Eyebrow, Meter } from "@/components/brand/ui/card";
import {
  formatCount,
  formatIsoDate,
  formatPerDay,
  formatPercent,
  MIN_HISTORY_DAYS,
  type GoalProgress,
} from "@/lib/brand/goals/progress";
import type { BrandGoal } from "@/lib/brand/goals/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { cn } from "@/lib/utils";

function Fact({ label, children, hint, hintTone }: { label: string; children: ReactNode; hint?: ReactNode; hintTone?: "up" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="font-mono text-base tabular-nums">{children}</div>
      {hint ? <p className={cn("text-[11.5px]", hintTone === "up" ? "text-lm-success" : "text-lm-ink-3")}>{hint}</p> : null}
    </div>
  );
}

/** Texto de apoyo cuando no hay un número: no va en Mono ni en tamaño de dato. */
function Note({ children }: { children: ReactNode }) {
  return <span className="font-lm-sans text-[12.5px] leading-[1.45] text-lm-ink-2">{children}</span>;
}

/**
 * La meta de seguidores en el dashboard (Plans/03 §3.13). Sin ritmo inventado:
 * hasta juntar MIN_HISTORY_DAYS de fotos diarias dice cuánto historial hay, y no
 * proyecta nada. El número siempre va al lado de la barra: sola dice "casi
 * vacío", no "118 de 10.000". Con un avance chico el relleno tiene un mínimo de
 * 4 px, porque 1,2 % es invisible y parece que el medidor no funciona.
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
          <p className="text-[12.5px] leading-[1.5] text-lm-ink-2">
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
    <Card className="flex flex-col">
      <CardHeader
        title="Meta de seguidores"
        description={
          goal.deadline ? (
            <>
              Plazo: <span className="font-mono">{formatIsoDate(goal.deadline)}</span>
            </>
          ) : (
            "Sin plazo"
          )
        }
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
      <CardBody className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2.5 font-mono">
            <span className="text-[30px] leading-none tracking-[-0.02em] text-lm-signal-text">
              {progress.current !== null ? formatCount(progress.current) : "—"}
            </span>
            <span className="text-sm text-lm-ink-3">de {formatCount(progress.target)}</span>
            <span className="flex-1" />
            {progress.current !== null ? (
              <span className="text-[13px] text-lm-ink-2">{formatPercent(progress.fraction * 100)}</span>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label="Avance hacia la meta de seguidores"
            aria-valuemin={0}
            aria-valuemax={progress.target}
            aria-valuenow={progress.current ?? 0}
          >
            <Meter percent={progress.fraction * 100} tone="signal" minPx={4} className="h-1 rounded-[2px]" />
          </div>
          {achieved ? (
            <p className="text-xs text-lm-success">Meta cumplida</p>
          ) : progress.onTrack === true ? (
            <p className="text-xs text-lm-success">Vas en camino</p>
          ) : progress.onTrack === false ? (
            <p className="text-xs text-lm-danger">Por debajo del ritmo necesario</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Fact
            label="Faltan"
            hint={
              progress.gained !== null
                ? `${progress.gained >= 0 ? "↑" : "↓"} ${formatCount(Math.abs(progress.gained))} desde que la definiste`
                : undefined
            }
            hintTone={progress.gained !== null && progress.gained > 0 ? "up" : undefined}
          >
            {progress.remaining !== null ? formatCount(progress.remaining) : "—"}
          </Fact>

          <Fact
            label="Ritmo real"
            hint={pace ? `entre el ${formatIsoDate(pace.fromDay)} y el ${formatIsoDate(pace.toDay)}` : undefined}
          >
            {pace ? (
              formatPerDay(pace.perDay)
            ) : (
              <Note>
                Sin historial suficiente, {progress.historyDays} de {MIN_HISTORY_DAYS} días
              </Note>
            )}
          </Fact>

          <Fact label="Ritmo necesario">
            {progress.neededPerDay !== null ? (
              formatPerDay(progress.neededPerDay)
            ) : (
              <Note>{achieved ? "—" : progress.deadline ? "Plazo vencido" : "Sin plazo"}</Note>
            )}
          </Fact>

          <Fact label="A este ritmo">
            {achieved ? (
              <Note>—</Note>
            ) : progress.projection?.kind === "FECHA" ? (
              formatIsoDate(progress.projection.date)
            ) : progress.projection?.kind === "ESTANCADO" ? (
              <Note>No se llega: el ritmo es cero o negativo</Note>
            ) : progress.projection?.kind === "LEJOS" ? (
              <Note>Más de 10 años</Note>
            ) : (
              <Note>Sin ritmo medido</Note>
            )}
          </Fact>
        </dl>

        {!pace && !achieved ? (
          <p className="border-t border-lm-line pt-3.5 text-[12.5px] leading-[1.55] text-lm-ink-3">
            El ritmo sale de las fotos diarias del contador, no de un dato que entregue Instagram. Hasta tener {MIN_HISTORY_DAYS} días no se muestra: antes que una proyección inventada.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
