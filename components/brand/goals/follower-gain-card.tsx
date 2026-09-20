import { AlertTriangle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
 */
export function FollowerGainCard({
  gain,
  surprise,
  currentFollowers,
}: {
  gain: PostFollowerGain | undefined;
  surprise: FollowerSurprise | undefined;
  currentFollowers: number | null;
}) {
  const description = `Seguidores en las ${WINDOW_HOURS} h posteriores a publicar.`;

  if (!gain || gain.status === "SIN_DATOS") {
    return (
      <Card>
        <CardHeader title="Seguidores tras publicar" description={description} />
        <CardBody>
          <p className="text-sm text-muted">
            No hay datos: faltan fotos diarias del contador alrededor de la fecha de publicación (un día sin sincronizar deja un hueco).
          </p>
        </CardBody>
      </Card>
    );
  }

  if (gain.status === "MADURANDO") {
    return (
      <Card>
        <CardHeader title="Seguidores tras publicar" description={description} />
        <CardBody>
          <p className="text-sm text-muted">Todavía no pasaron las {WINDOW_HOURS} h desde que se publicó: la ventana sigue abierta.</p>
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
        action={<Badge tone={estimated ? "violet" : "cyan"}>{estimated ? "Estimación" : "Dato de Instagram"}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="tabular text-3xl text-ink">
            {signed(gain.followers)}
            <span className="ml-2 text-base text-muted">{Math.abs(gain.followers) === 1 ? "seguidor" : "seguidores"}</span>
          </p>
          {gain.perThousandViews !== null ? (
            <p className="tabular text-sm text-muted">{oneDecimal.format(gain.perThousandViews)} por cada 1.000 views</p>
          ) : null}
        </div>

        <p className="text-xs text-muted">
          {estimated
            ? `Seguidores netos entre la foto diaria de antes de publicar y la de ${WINDOW_HOURS} h después (${gain.windowDays} ${gain.windowDays === 1 ? "día" : "días"} entre fotos). Instagram no da este dato para reels: no es un conteo de quién entró por esta pieza.`
            : "Lo informa Instagram para posts y carruseles."}
        </p>

        {estimated && gain.sharedWindow ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Ventana compartida: salió otra pieza propia dentro de las {WINDOW_HOURS} h, y los seguidores de las dos se mezclan. No se le puede atribuir a ésta sola.
          </p>
        ) : null}

        {estimated && currentFollowers !== null && currentFollowers < LOW_CONFIDENCE_FOLLOWERS ? (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Con {formatCount(currentFollowers)} seguidores, uno solo más o menos cambia la estimación. Es una pista de baja confianza hasta juntar semanas de datos.
          </p>
        ) : null}

        {surprise ? (
          <p className="flex items-start gap-1.5 rounded-[12px] border border-violet/30 bg-violet/5 p-3 text-xs text-ink">
            <Info className="mt-0.5 size-3.5 shrink-0 text-[#c4a6ff]" />
            <span>
              <strong>Para tener en cuenta:</strong> dejó {formatMultiple(surprise.multiple)} los seguidores por view que la mediana de tus otras piezas con ventana limpia ({oneDecimal.format(surprise.perThousandViews)} contra {oneDecimal.format(surprise.medianPerThousand)} por cada 1.000 views). Es una pista, no cambia su clasificación.
            </span>
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
