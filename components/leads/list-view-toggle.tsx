"use client";

import { LayoutGrid, TableProperties } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";

/** Conserva los filtros locales reflejados en la URL al cambiar de vista. */
export function ListViewToggle({ view, basePath }: { view: "tabla" | "kanban"; basePath: string }) {
  const searchParams = useSearchParams();
  const tableParams = new URLSearchParams(searchParams);
  tableParams.set("view", "tabla");
  tableParams.delete("page");
  const kanbanParams = new URLSearchParams(searchParams);
  kanbanParams.set("view", "kanban");
  kanbanParams.delete("page");

  return (
    <Segmented>
      <SegmentedLink href={`${basePath}?${tableParams.toString()}`} active={view === "tabla"}>
        <TableProperties className="mr-1.5 inline size-3.5" strokeWidth={1.5} /> Tabla
      </SegmentedLink>
      <SegmentedLink href={`${basePath}?${kanbanParams.toString()}`} active={view === "kanban"}>
        <LayoutGrid className="mr-1.5 inline size-3.5" strokeWidth={1.5} /> Kanban
      </SegmentedLink>
    </Segmented>
  );
}
