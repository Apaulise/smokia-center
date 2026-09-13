"use client";

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  bulkAssignIndustry,
  bulkDeleteLeads,
  bulkUpdateStatus,
  exportLeadsCsv,
  updateLeadStatus,
} from "@/lib/leads/actions";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function SortHeader({ field, label }: { field: string; label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSort = searchParams.get("sort") ?? "created_at";
  const activeDir = searchParams.get("dir") ?? "desc";
  const isActive = activeSort === field;
  const nextDir = isActive && activeDir === "desc" ? "asc" : "desc";

  const params = new URLSearchParams(searchParams);
  params.set("sort", field);
  params.set("dir", nextDir);
  params.delete("page");

  return (
    <Link href={`${pathname}?${params.toString()}`} className="inline-flex items-center gap-1 hover:text-ink">
      {label}
      {isActive ? (
        activeDir === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className="size-3" />
        )
      ) : null}
    </Link>
  );
}

/**
 * `leads` se copia a estado local y se actualiza de forma optimista en cada
 * mutación: esperar a que `router.refresh()` traiga la respuesta del servidor
 * antes de reflejar el cambio deja la pantalla "colgada" mientras tanto, sobre
 * todo al eliminar. `useEffect` resincroniza cuando llega una página nueva del
 * servidor (filtro, orden, paginación, o el refresh de fondo ya resuelto).
 */
export function LeadsTable({
  leads: initialLeads,
  industries,
}: {
  leads: LeadWithRelations[];
  industries: Industry[];
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [bulkIndustry, setBulkIndustry] = useState("");
  const [bulkStatus, setBulkStatus] = useState<LeadStatus | "">("");

  // Resincroniza con la página que llega del servidor (filtro, orden,
  // paginación, o el refresh de fondo ya resuelto) sin pasar por un efecto:
  // ajustar estado derivado de un prop se hace durante el render (React docs,
  // "Adjusting state when a prop changes"), no en un useEffect.
  const [syncedLeads, setSyncedLeads] = useState(initialLeads);
  if (initialLeads !== syncedLeads) {
    setSyncedLeads(initialLeads);
    setLeads(initialLeads);
  }

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function updateLocalStatus(ids: string[], status: LeadStatus) {
    const idSet = new Set(ids);
    setLeads((current) => current.map((lead) => (idSet.has(lead.id) ? { ...lead, status } : lead)));
  }

  function handleDelete() {
    if (!window.confirm(`¿Eliminar ${selected.size} leads? No se puede deshacer.`)) return;
    const ids = selectedIds;
    setLeads((current) => current.filter((lead) => !ids.includes(lead.id)));
    clearSelection();
    startTransition(async () => {
      await bulkDeleteLeads(ids);
      router.refresh();
    });
  }

  function handleAssignIndustry() {
    if (!bulkIndustry) return;
    const ids = selectedIds;
    const industryId = bulkIndustry === "__none__" ? null : bulkIndustry;
    const industry = industries.find((i) => i.id === industryId) ?? null;
    const idSet = new Set(ids);
    setLeads((current) =>
      current.map((lead) =>
        idSet.has(lead.id) ? { ...lead, industry_id: industryId, industries: industry } : lead,
      ),
    );
    setBulkIndustry("");
    startTransition(async () => {
      await bulkAssignIndustry(ids, industryId);
      router.refresh();
    });
  }

  function handleBulkStatus() {
    if (!bulkStatus) return;
    const ids = selectedIds;
    const status = bulkStatus;
    updateLocalStatus(ids, status);
    setBulkStatus("");
    startTransition(async () => {
      await bulkUpdateStatus(ids, status);
      router.refresh();
    });
  }

  function handleExport() {
    const ids = selectedIds;
    startTransition(async () => {
      const result = await exportLeadsCsv(ids);
      if (result.ok) downloadCsv(result.csv, result.filename);
    });
  }

  function handleRowStatusChange(id: string, status: LeadStatus) {
    updateLocalStatus([id], status);
    startTransition(async () => {
      await updateLeadStatus(id, status);
      router.refresh();
    });
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-[20px] border border-line bg-elevated/70 px-6 py-16 text-center text-sm text-muted">
        Ningún lead coincide con estos filtros.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-cyan/30 bg-cyan/5 px-4 py-3">
          <span className="text-sm text-ink">{selected.size} seleccionados</span>

          <div className="flex items-center gap-1.5">
            <Select
              className="h-8 w-40 text-xs"
              value={bulkIndustry}
              onChange={(event) => setBulkIndustry(event.target.value)}
            >
              <option value="">Asignar rubro…</option>
              <option value="__none__">Sin rubro</option>
              {industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="secondary" disabled={!bulkIndustry} onClick={handleAssignIndustry}>
              Aplicar
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Select
              className="h-8 w-40 text-xs"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}
            >
              <option value="">Cambiar estado…</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="secondary" disabled={!bulkStatus} onClick={handleBulkStatus}>
              Aplicar
            </Button>
          </div>

          <Button type="button" size="sm" variant="secondary" onClick={handleExport}>
            Exportar CSV
          </Button>

          <Button type="button" size="sm" variant="danger" onClick={handleDelete}>
            Eliminar
          </Button>

          {pending ? <Loader2 className="size-4 animate-spin text-cyan" /> : null}

          <button type="button" onClick={clearSelection} className="ml-auto text-xs text-muted hover:text-ink">
            Cancelar selección
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[20px] border border-line bg-elevated/70">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-line/60 text-xs text-muted uppercase">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todos"
                  className="size-4 rounded border-line accent-cyan"
                />
              </th>
              <th className="px-2 py-3">
                <SortHeader field="name" label="Nombre" />
              </th>
              <th className="px-2 py-3">Rubro</th>
              <th className="px-2 py-3">Contacto</th>
              <th className="px-2 py-3">Ciudad</th>
              <th className="px-2 py-3">
                <SortHeader field="status" label="Estado" />
              </th>
              <th className="px-2 py-3">Lista</th>
              <th className="px-2 py-3">
                <SortHeader field="last_contacted_at" label="Últ. contacto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <LeadRowView
                key={lead.id}
                lead={lead}
                selected={selected.has(lead.id)}
                onToggle={() => toggleOne(lead.id)}
                onStatusChange={(status) => handleRowStatusChange(lead.id, status)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadRowView({
  lead,
  selected,
  onToggle,
  onStatusChange,
}: {
  lead: LeadWithRelations;
  selected: boolean;
  onToggle: () => void;
  onStatusChange: (status: LeadStatus) => void;
}) {
  return (
    <tr className="border-b border-line/40 last:border-0 hover:bg-surface/30">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${lead.name}`}
          className="size-4 rounded border-line accent-cyan"
        />
      </td>
      <td className="px-2 py-3">
        <Link href={`/leads/${lead.id}`} className="font-medium text-ink hover:text-cyan">
          {lead.name}
        </Link>
      </td>
      <td className="px-2 py-3">
        {lead.industries ? (
          <Badge color={lead.industries.color}>{lead.industries.name}</Badge>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-3 text-muted">
        <div className="flex flex-col text-xs">
          {lead.phone ? <span>{lead.phone}</span> : null}
          {lead.email ? <span>{lead.email}</span> : null}
          {!lead.phone && !lead.email ? "—" : null}
        </div>
      </td>
      <td className="px-2 py-3 text-muted">{lead.city ?? "—"}</td>
      <td className="px-2 py-3">
        <Select
          className="h-8 w-40 text-xs"
          value={lead.status}
          onChange={(event) => onStatusChange(event.target.value as LeadStatus)}
        >
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-2 py-3 text-muted">{lead.lead_lists?.name ?? "—"}</td>
      <td className="px-2 py-3 text-muted">
        {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString("es-AR") : "—"}
      </td>
    </tr>
  );
}
