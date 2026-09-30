import { EmptyLine } from "@/components/leads/ui/feedback";
import type { StyleStats } from "@/lib/leads/ai/style/queries";

/**
 * Cuánto editás los borradores de la IA (Plan §1.20.1). Con el `n` al lado,
 * mismo criterio que la tabla de ángulos: el porcentaje sin la muestra no
 * dice nada.
 */
export function StyleLoopTile({ stats }: { stats: StyleStats }) {
  if (stats.total === 0) {
    return <EmptyLine>Todavía no confirmaste ninguna apertura ni respuesta generada por la IA.</EmptyLine>;
  }

  const rate = Math.round((stats.edited / stats.total) * 100);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-lm-ink">
        Editaste <span className="font-mono tabular-nums">{stats.edited}</span> de{" "}
        <span className="font-mono tabular-nums">{stats.total}</span> borradores <span className="text-lm-ink-2">({rate} %)</span>
        {stats.averageDistance !== null ? (
          <>
            {" · "}
            <span className="text-lm-ink-2">distancia media </span>
            <span className="font-mono tabular-nums">{stats.averageDistance}</span>
          </>
        ) : null}
      </p>
      <p className="text-xs text-lm-ink-3">
        Cada edición tuya se guarda como ejemplo de cómo escribís. Si este porcentaje baja con el tiempo, el agente está aprendiendo.
      </p>
    </div>
  );
}
