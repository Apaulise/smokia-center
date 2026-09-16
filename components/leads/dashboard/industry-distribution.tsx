import type { IndustryDistribution } from "@/lib/leads/queries";

const VISIBLE_ROWS = 6;

/**
 * Distribución de leads por rubro (Plan §1.4). El color es el que el usuario
 * eligió para cada rubro en Configuración — no se inventa una paleta acá.
 */
export function IndustryDistributionChart({ industries }: { industries: IndustryDistribution[] }) {
  const visible = industries.slice(0, VISIBLE_ROWS);
  const rest = industries.slice(VISIBLE_ROWS);
  const restCount = rest.reduce((sum, i) => sum + i.lead_count, 0);
  const max = Math.max(1, ...industries.map((i) => i.lead_count));

  return (
    <ol className="space-y-3">
      {visible.map((industry) => (
        <Row
          key={industry.industry_id ?? "sin-rubro"}
          label={industry.name}
          color={industry.color}
          count={industry.lead_count}
          max={max}
        />
      ))}
      {rest.length > 0 ? (
        <Row label={`Otros rubros (${rest.length})`} color="#AAB8D4" count={restCount} max={max} muted />
      ) : null}
    </ol>
  );
}

function Row({
  label,
  color,
  count,
  max,
  muted,
}: {
  label: string;
  color: string;
  count: number;
  max: number;
  muted?: boolean;
}) {
  const pct = (count / max) * 100;
  return (
    <li className="group space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className={muted ? "text-muted" : "text-ink"}>{label}</span>
        <span className="tabular text-muted">{count}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface/60">
        <div
          className="h-full rounded-full transition-[filter] duration-150 group-hover:brightness-125"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}
