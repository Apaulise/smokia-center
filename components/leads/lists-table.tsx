import Link from "next/link";

import { sourceLabel } from "@/components/leads/lead-list-card";
import { ListActionsMenu } from "@/components/leads/list-actions-menu";
import { Chip, StatusBadge } from "@/components/leads/ui/status-badge";
import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import type { LeadListOverviewRow } from "@/lib/leads/queries";

const JOB_STATUS_LABEL: Record<LeadListOverviewRow["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

const JOB_STATUS_GROUP: Record<LeadListOverviewRow["status"], "frio" | "curso" | "ganado" | "salida"> = {
  PENDIENTE: "frio",
  EN_CURSO: "curso",
  COMPLETADO: "ganado",
  FALLIDO: "salida",
};

/** Tabla densa de listas (Design System DataTable): default de /leads/lista. */
export function ListsTable({ lists }: { lists: LeadListOverviewRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Nombre</Th>
          <Th>Fuente</Th>
          <Th>Rubro</Th>
          <Th>Creada</Th>
          <Th align="right">Leads</Th>
          <Th>Estado</Th>
          <Th aria-label="Acciones" />
        </tr>
      </thead>
      <tbody>
        {lists.map((list) => {
          const leadCount = list.leads[0]?.count ?? 0;
          return (
            <Tr key={list.id}>
              <Td>
                <Link href={`/leads/lista/${list.id}`} className="font-medium text-lm-ink hover:text-lm-signal-text">
                  {list.name}
                </Link>
              </Td>
              <Td className="text-lm-ink-2">{sourceLabel(list.source)}</Td>
              <Td>
                {list.industries ? (
                  <Chip color={list.industries.color}>{list.industries.name}</Chip>
                ) : (
                  <span className="text-lm-ink-3">Sin asignar</span>
                )}
              </Td>
              <Td className="font-mono text-xs text-lm-ink-3">
                {new Date(list.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
              </Td>
              <Td numeric>{leadCount}</Td>
              <Td>
                <StatusBadge group={JOB_STATUS_GROUP[list.status]}>{JOB_STATUS_LABEL[list.status]}</StatusBadge>
              </Td>
              <Td className="text-right">
                <ListActionsMenu listId={list.id} listName={list.name} leadCount={leadCount} />
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
