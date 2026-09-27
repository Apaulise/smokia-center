import type { IndustryDistribution } from "@/lib/leads/queries";

const VISIBLE_ROWS = 6;
const UNASSIGNED_COLOR = "#3A3B3E"; // chart/neutral-1 del handoff: "Sin rubro" siempre en este gris, nunca en un color de rubro real.

/**
 * Distribución de leads por rubro: una sola barra apilada (8px) + leyenda con
 * %. El color de cada segmento es el que el usuario eligió para ese rubro en
 * Configuración — no se inventa una paleta acá (skill dataviz: identidad
 * categórica que ya trae el dominio, no se re-deriva).
 */
export function IndustryDistributionChart({ industries }: { industries: IndustryDistribution[] }) {
  const total = industries.reduce((sum, i) => sum + i.lead_count, 0);
  const unassigned = industries.find((i) => i.industry_id === null);

  const sorted = [...industries.filter((i) => i.industry_id !== null)].sort((a, b) => b.lead_count - a.lead_count);
  const visible = sorted.slice(0, VISIBLE_ROWS);
  const rest = sorted.slice(VISIBLE_ROWS);
  const restCount = rest.reduce((sum, i) => sum + i.lead_count, 0);

  if (total === 0) {
    return <p className="text-[13px] text-lm-ink-2">Todavía no hay leads para distribuir por rubro.</p>;
  }

  const segments = [
    ...visible.map((i) => ({ key: i.industry_id as string, color: i.color, count: i.lead_count })),
    ...(rest.length > 0 ? [{ key: "otros", color: "#8A8C8F", count: restCount }] : []),
    ...(unassigned ? [{ key: "sin-rubro", color: UNASSIGNED_COLOR, count: unassigned.lead_count }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-lm-xs">
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{ width: `${(segment.count / total) * 100}%`, backgroundColor: segment.color }}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-2 text-[13px]">
        {visible.map((industry) => (
          <li key={industry.industry_id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 truncate text-lm-ink">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: industry.color }} />
              <span className="truncate">{industry.name}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-lm-ink-3">
              {((industry.lead_count / total) * 100).toFixed(0)} %
            </span>
          </li>
        ))}
        {rest.length > 0 ? (
          <li className="flex items-center justify-between gap-3 text-lm-ink-2">
            <span className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: "#8A8C8F" }} />
              Otros rubros ({rest.length})
            </span>
            <span className="font-mono text-xs text-lm-ink-3">{((restCount / total) * 100).toFixed(0)} %</span>
          </li>
        ) : null}
        {unassigned ? (
          <li className="flex items-center justify-between gap-3 text-lm-ink-3">
            <span className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: UNASSIGNED_COLOR }} />
              Sin rubro
            </span>
            <span className="font-mono text-xs">{((unassigned.lead_count / total) * 100).toFixed(0)} %</span>
          </li>
        ) : null}
      </ul>

    </div>
  );
}
