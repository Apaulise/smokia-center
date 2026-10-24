import { Chip, StatusBadge } from "@/components/leads/ui/status-badge";
import { Table, Td, TdSub, Th, Tr } from "@/components/leads/ui/table";
import { ESTADO_GROUP, ESTADO_LABEL } from "@/lib/ops/schema";
import type { OpsStatusItem } from "@/lib/ops/types";

export function OpsStatusTable({ rows }: { rows: OpsStatusItem[] }) {
  return (
    <Table className="min-w-[560px]">
      <thead>
        <tr>
          <Th>Tarea</Th>
          <Th>Área</Th>
          <Th>Agente</Th>
          <Th>Estado</Th>
          <Th align="right">Actualizado</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.title}</span>
                {row.needsOk ? <Chip>Pide OK</Chip> : null}
              </span>
              {row.detail ? <TdSub>{row.detail}</TdSub> : null}
            </Td>
            <Td className="text-lm-ink-2">{row.areaLabel}</Td>
            <Td className="text-lm-ink-2">{row.agent}</Td>
            <Td>
              <StatusBadge group={ESTADO_GROUP[row.estado]}>{ESTADO_LABEL[row.estado]}</StatusBadge>
            </Td>
            <Td numeric className="text-xs text-lm-ink-3">
              {row.at}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
