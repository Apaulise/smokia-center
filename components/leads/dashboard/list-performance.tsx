import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CSV_PROVIDER_META, getProvider } from "@/lib/providers/registry";
import type { ListPerformance } from "@/lib/leads/queries";

function sourceLabel(source: ListPerformance["source"]) {
  if (source === "CSV" || source === "MANUAL") return CSV_PROVIDER_META.label;
  return getProvider(source)?.label ?? source;
}

/** rubro+zona si el proveedor los pidió (hoy sólo Google Maps); si no, no se inventa un dato que no está. */
function criteriaSummary(criteria: ListPerformance["criteria"]) {
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return null;
  const rubro = "rubro" in criteria ? criteria.rubro : undefined;
  const zona = "zona" in criteria ? criteria.zona : undefined;
  if (typeof rubro !== "string" || typeof zona !== "string") return null;
  return `${rubro} · ${zona}`;
}

/**
 * Rendimiento por lista de origen (Plan §1.4): qué combinación de rubro y
 * zona cierra mejor, para justificar en qué gastar crédito de Apify.
 */
export function ListPerformanceTable({ lists }: { lists: ListPerformance[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line/60 text-xs text-muted uppercase">
            <th className="px-2 py-3">Lista</th>
            <th className="px-2 py-3">Leads</th>
            <th className="px-2 py-3">Cerrados</th>
            <th className="px-2 py-3">Tasa de cierre</th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => {
            const criteria = criteriaSummary(list.criteria);
            const rate = list.win_rate ?? 0;
            return (
              <tr key={list.list_id} className="border-b border-line/40 last:border-0 hover:bg-surface/30">
                <td className="px-2 py-3">
                  <Link href={`/leads/lista/${list.list_id}`} className="text-ink hover:text-cyan">
                    {list.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{sourceLabel(list.source)}</Badge>
                    {criteria ? (
                      <span className="text-xs text-muted">{criteria}</span>
                    ) : list.industry_name ? (
                      <Badge color={list.industry_color ?? undefined}>{list.industry_name}</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="tabular px-2 py-3 text-muted">{list.lead_count}</td>
                <td className="tabular px-2 py-3 text-muted">{list.won_count}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-surface/60">
                      <div className="h-full rounded-full bg-cyan" style={{ width: `${rate}%` }} />
                    </div>
                    <span className="tabular text-ink">{rate}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
