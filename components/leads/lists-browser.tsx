"use client";

import { LayoutGrid, Plus, Search, TableProperties } from "lucide-react";
import { useMemo, useState } from "react";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { CreateListDialog } from "@/components/leads/create-list-dialog";
import { LeadListCard } from "@/components/leads/lead-list-card";
import { ListsTable } from "@/components/leads/lists-table";
import { Button, ButtonLink } from "@/components/leads/ui/button";
import { Input } from "@/components/leads/ui/field";
import { SegmentedLink } from "@/components/leads/ui/tabs";
import type { LeadListOverviewRow } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

/**
 * Cuerpo de /leads/lista con listas (Design System §03: buscador + toggle de
 * vista + CTA en la misma fila que el título, filtro instantáneo del lado
 * del cliente — son come mucho unas pocas decenas de listas, no hace falta
 * ida y vuelta al servidor). El estado vacío (cero listas) lo sigue
 * resolviendo la page directamente, antes de montar esto.
 */
export function ListsBrowser({
  lists,
  view,
  industries,
}: {
  lists: LeadListOverviewRow[];
  view: "tabla" | "grilla";
  industries: Industry[];
}) {
  const [query, setQuery] = useState("");
  const [addingLead, setAddingLead] = useState(false);
  const [creatingList, setCreatingList] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter((list) => list.name.toLowerCase().includes(q));
  }, [lists, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-56">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-lm-ink-3" strokeWidth={1.5} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar listas"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="inline-flex gap-0.5 rounded-lm-sm border border-lm-line bg-lm-surface p-0.5">
          <SegmentedLink href="/leads/lista?view=tabla" active={view === "tabla"}>
            <TableProperties className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            Tabla
          </SegmentedLink>
          <SegmentedLink href="/leads/lista?view=grilla" active={view === "grilla"}>
            <LayoutGrid className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
            Grilla
          </SegmentedLink>
        </div>
        <Button type="button" variant="secondary" onClick={() => setCreatingList(true)}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          Nueva lista
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAddingLead(true)}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          Agregar lead
        </Button>
        <ButtonLink href="/leads/generar" variant="primary">
          Generar lista
        </ButtonLink>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-lm-ink-3">Ninguna lista coincide con “{query}”.</p>
      ) : view === "grilla" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((list) => (
            <LeadListCard key={list.id} list={list} />
          ))}
        </div>
      ) : (
        <ListsTable lists={filtered} />
      )}

      {creatingList ? <CreateListDialog industries={industries} onClose={() => setCreatingList(false)} /> : null}
      {addingLead ? (
        <AddLeadDialog industries={industries} lists={lists} onClose={() => setAddingLead(false)} />
      ) : null}
    </div>
  );
}
