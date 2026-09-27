import Link from "next/link";

import { Chip } from "@/components/leads/ui/status-badge";
import { MiniBar, Table, Td, TdSub, Th, Tr } from "@/components/leads/ui/table";
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

/** Rendimiento por lista de origen: qué combinación de rubro y zona cierra mejor, para saber en qué gastar crédito de Apify. */
export function ListPerformanceTable({ lists }: { lists: ListPerformance[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Lista</Th>
          <Th>Fuente</Th>
          <Th>Rubro · zona</Th>
          <Th align="right">Leads</Th>
          <Th align="right">Cerr.</Th>
          <Th>Tasa de cierre</Th>
        </tr>
      </thead>
      <tbody>
        {lists.map((list) => {
          const criteria = criteriaSummary(list.criteria);
          const rate = list.win_rate ?? 0;
          return (
            <Tr key={list.list_id}>
              <Td>
                <Link href={`/leads/lista/${list.list_id}`} className="text-lm-ink hover:text-lm-signal-text">
                  {list.name}
                </Link>
              </Td>
              <Td className="text-lm-ink-2">{sourceLabel(list.source)}</Td>
              <Td>
                {criteria ? (
                  <TdSub>{criteria}</TdSub>
                ) : list.industry_name ? (
                  <Chip color={list.industry_color ?? undefined}>{list.industry_name}</Chip>
                ) : (
                  <span className="text-lm-ink-3">—</span>
                )}
              </Td>
              <Td numeric>{list.lead_count}</Td>
              <Td numeric>{list.won_count}</Td>
              <Td>
                <MiniBar percent={rate} />
                <span className="font-mono text-xs tabular-nums text-lm-ink">{rate} %</span>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
