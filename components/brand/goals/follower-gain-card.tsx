import { AlertTriangle, Info } from "lucide-react";

import { Card, CardBody, CardHeader, Meter, Tag } from "@/components/brand/ui/card";
import { WINDOW_HOURS, type FollowerSurprise, type PostFollowerGain } from "@/lib/brand/goals/attribution";
import { formatCount } from "@/lib/brand/goals/progress";
import { formatMultiple } from "@/lib/brand/insights";

/** Por debajo de esto Instagram probablemente no entrega `follower_count_1d` (sin verificar) y un solo seguidor domina cualquier ventana. */
const LOW_CONFIDENCE_FOLLOWERS = 100;

const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${formatCount(value)}`;
}

/**
 * "Seguidores tras publicar" en la ficha de una pieza (Plans/03 §3.13). Para un reel
 * Instagram no da el dato directo, así que es una ESTIMACIÓN y se rotula como tal, con
 * el aviso de ventana compartida cuando corresponde. Es una pista: nunca clasifica la
 * pieza (eso sigue siendo por alcance y autoridad, SOC §17).
 *
 * `hoursSincePublished` sólo se usa mientras la ventana sigue abierta, para
 * mostrar cuánto de las 72 h ya pasó.
 */
export function FollowerGainCard({
  gain,
  surprise,
  currentFollowers,
  hoursSincePublished,
}: {
  gain: PostFollowerGain | undefined;
  surprise: FollowerSurprise | undefined;
  currentFollowers: number | null;
  hoursSincePublished?: number | null;
}) {
  const description = `En las ${WINDOW_HOURS} h posteriores.`;

  if (!gain || gain.status === "SIN_DATOS") {
    return (
      <Card>
        <CardHeader title="Seguidores tras publicar" description={description} />
        <CardBody>
          <p className="text-[12.5px] leading-normal text-lm-ink-2">
            No hay datos: faltan fotos diarias del contador alrededor de la fecha de publicación (un día sin sincronizar deja un hueco).
          </p>
        </CardBody>
      </Card>
    );
  }

  if (gain.status === "MADURANDO") {
    const elapsed = hoursSincePublished != null ? Math.min(WINDOW_HOURS, Math.max(0, Math.round(hoursSincePublished))) : null;
    return (
      <Card>
        <CardHeader title="Seguidores tras publicar" description={description} />
        <CardBody className="flex flex-col gap-2.5">
          {elapsed !== null ? <Meter percent={(elapsed / WINDOW_HOURS) * 100} /> : null}
          <p className="text-[12.5px] leading-normal text-lm-ink-2">
            Todavía no pasaron las {WINDOW_HOURS} h: la ventana sigue abierta.
            {elapsed !== null ? (
              <>
                {" "}
                <span className="font-mono text-lm-ink">{elapsed} h</span> de {WINDOW_HOURS}.
              </>
            ) : null}
          </p>
        </CardBody>
      </Card>
    );
  }

  const estimated = gain.source === "ESTIMADO";

  return (
    <Card>
      <CardHeader
        title="Seguidores tras publicar"
        description={description}
        action={<Tag>{estimated ? "Estimación" : "Dato de Instagram"}</Tag>}
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="font-mono text-[26px] leading-none tracking-[-0.02em] tabular-nums">
            {signed(gain.followers)}
            <span className="ml-2 font-lm-sans text-sm tracking-normal text-lm-ink-3">
              {Math.abs(gain.followers) === 1 ? "seguidor" : "seguidores"}
            </span>
          </p>
          {gain.perThousandViews !== null ? (
            <p className="font-mono text-[12.5px] text-lm-ink-2 tabular-nums">{oneDecimal.format(gain.perThousandViews)} por cada 1.000 views</p>
          ) : null}
        </div>

        <p className="text-xs leading-normal text-lm-ink-3">
          {estimated
            ? `Seguidores netos entre la foto diaria de antes de publicar y la de ${WINDOW_HOURS} h después (${gain.windowDays} ${gain.windowDays === 1 ? "día" : "días"} entre fotos). Instagram no da este dato para reels: no es un conteo de quién entró por esta pieza.`
            : "Lo informa Instagram para posts y carruseles."}
        </p>

        {estimated && gain.sharedWindow ? (
          <p className="flex items-start gap-1.5 text-xs leading-normal text-lm-ink-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-lm-signal-text" />
            Ventana compartida: salió otra pieza propia dentro de las {WINDOW_HOURS} h, y los seguidores de las dos se mezclan. No se le puede atribuir a ésta sola.
          </p>
        ) : null}

        {estimated && currentFollowers !== null && currentFollowers < LOW_CONFIDENCE_FOLLOWERS ? (
          <p className="flex items-start gap-1.5 text-xs leading-normal text-lm-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Con {formatCount(currentFollowers)} seguidores, uno solo más o menos cambia la estimación. Es una pista de baja confianza hasta juntar semanas de datos.
          </p>
        ) : null}

        {surprise ? (
          <p className="flex items-start gap-1.5 border-l border-lm-line-strong pl-3 text-xs leading-normal text-lm-ink">
            <span>
              <strong className="font-medium">Para tener en cuenta:</strong> dejó {formatMultiple(surprise.multiple)} los seguidores por view que la mediana de tus otras piezas con ventana limpia ({oneDecimal.format(surprise.perThousandViews)} contra {oneDecimal.format(surprise.medianPerThousand)} por cada 1.000 views). Es una pista, no cambia su clasificación.
            </span>
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
