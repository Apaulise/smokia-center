import Link from "next/link";

import { MiniBar, Table, Td, Th, Tr } from "@/components/leads/ui/table";
import type { OpsAreaSummary } from "@/lib/ops/types";

export function AreaSummaryTable({ rows }: { rows: OpsAreaSummary[] }) {
  return (
    <Table className="min-w-[520px]">
      <thead>
        <tr>
          <Th>Área</Th>
          <Th>Agentes</Th>
          <Th align="right">Hecho</Th>
          <Th align="right">Pend.</Th>
          <Th align="right">Bloqueo</Th>
          <Th>Avance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.area} className="relative">
            <Td>
              <Link
                href={`/operaciones/areas?area=${row.area}`}
                className="absolute inset-0"
                aria-label={`Ver ${row.label}`}
              />
              <span className="font-medium">{row.label}</span>
            </Td>
            <Td className="text-lm-ink-2">{row.agents}</Td>
            <Td numeric>{row.done}</Td>
            <Td numeric>{row.pending}</Td>
            <Td numeric className={row.blocked > 0 ? "text-lm-danger" : "text-lm-ink-3"}>
              {row.blocked}
            </Td>
            <Td className="font-mono text-xs text-lm-ink-2">
              <MiniBar percent={row.percent} />
              {row.percent} %
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
