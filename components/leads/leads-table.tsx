"use client";

import { ArrowDown, ArrowUp, Loader2, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Select } from "@/components/leads/ui/field";
import { EmptyState } from "@/components/leads/ui/feedback";
import { Chip } from "@/components/leads/ui/status-badge";
import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import {
  bulkAssignIndustry,
  bulkDeleteLeads,
  bulkUpdateStatus,
  exportLeadsCsv,
  updateLeadStatus,
} from "@/lib/leads/actions";
import { enrichSelectedLeads } from "@/lib/leads/ai/actions";
import { describeNextAction } from "@/lib/leads/next-action-label";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

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
    <Link href={`${pathname}?${params.toString()}`} className="inline-flex items-center gap-1 hover:text-lm-ink">
      {label}
      {isActive ? activeDir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}
    </Link>
  );
}

/**
 * `leads` se copia a estado local y se actualiza de forma optimista en cada
 * mutación: esperar a que `router.refresh()` traiga la respuesta del servidor
 * antes de reflejar el cambio deja la pantalla "colgada" mientras tanto, sobre
 * todo al eliminar. El bloque `if (initialLeads !== syncedLeads)` resincroniza
 * durante el render cuando llega una página nueva del servidor (filtro,
 * orden, paginación, o el refresh de fondo ya resuelto).
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
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

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
    setEnrichMessage(null);
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
      current.map((lead) => (idSet.has(lead.id) ? { ...lead, industry_id: industryId, industries: industry } : lead)),
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

  function handleEnrich() {
    const ids = selectedIds;
    setEnrichMessage(null);
    startTransition(async () => {
      const result = await enrichSelectedLeads(ids);
      setEnrichMessage(result?.message ?? null);
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
    return <EmptyState title="Ningún lead coincide con estos filtros." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lm-md border border-lm-line-strong bg-lm-raised px-4 py-3">
          <span className="font-mono text-[13px] tabular-nums text-lm-ink">{selected.size} seleccionados</span>

          <div className="flex items-center gap-1.5">
            <Select className="h-8 w-40 text-xs" value={bulkIndustry} onChange={(event) => setBulkIndustry(event.target.value)}>
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
            <Select className="h-8 w-40 text-xs" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}>
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

          <Button type="button" size="sm" variant="secondary" onClick={handleEnrich}>
            <Sparkles className="size-3.5" strokeWidth={1.5} />
            Enriquecer
          </Button>

          <Button type="button" size="sm" variant="secondary" onClick={handleExport}>
            Exportar CSV
          </Button>

          <Button type="button" size="sm" variant="danger" onClick={handleDelete}>
            Eliminar
          </Button>

          {pending ? <Loader2 className="size-4 animate-spin text-lm-signal-text" /> : null}
          {enrichMessage ? <span className="text-xs text-lm-ink-3">{enrichMessage}</span> : null}

          <button type="button" onClick={clearSelection} className="ml-auto text-xs text-lm-ink-3 hover:text-lm-ink">
            Cancelar selección
          </button>
        </div>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Seleccionar todos"
                className="size-3.5 rounded-xs border-lm-line-strong accent-[#f2c14e]"
              />
            </Th>
            <Th>
              <SortHeader field="name" label="Nombre" />
            </Th>
            <Th>Rubro</Th>
            <Th>Contacto</Th>
            <Th>Ciudad</Th>
            <Th>Rating</Th>
            <Th>
              <SortHeader field="status" label="Estado" />
            </Th>
            <Th>Lista</Th>
            <Th>
              <SortHeader field="last_contacted_at" label="Últ. contacto" />
            </Th>
            <Th>Próxima acción</Th>
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
      </Table>
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
    <Tr selected={selected}>
      <Td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${lead.name}`}
          className="size-3.5 rounded-xs border-lm-line-strong accent-[#f2c14e]"
        />
      </Td>
      <Td>
        <Link href={`/leads/${lead.id}`} className="font-medium text-lm-ink hover:text-lm-signal-text">
          {lead.name}
        </Link>
      </Td>
      <Td>
        {lead.industries ? <Chip color={lead.industries.color}>{lead.industries.name}</Chip> : <span className="text-lm-ink-3">—</span>}
      </Td>
      <Td className="text-lm-ink-2">
        <div className="flex flex-col text-xs">
          {lead.phone ? <span>{lead.phone}</span> : null}
          {lead.email ? <span>{lead.email}</span> : null}
          {!lead.phone && !lead.email ? "—" : null}
        </div>
      </Td>
      <Td className="text-lm-ink-2">{lead.city ?? "—"}</Td>
      <Td className="font-mono text-xs text-lm-ink-2">
        {lead.rating != null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="size-3 fill-current text-lm-signal-text" strokeWidth={0} />
            {lead.rating.toFixed(1)}
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <InterestBars value={lead.interest_level} />
          <Select className="h-8 w-40 text-xs" value={lead.status} onChange={(event) => onStatusChange(event.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </div>
      </Td>
      <Td className="text-lm-ink-2">{lead.lead_lists?.name ?? "—"}</Td>
      <Td className="font-mono text-xs text-lm-ink-3">
        {lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString("es-AR") : "—"}
      </Td>
      <NextActionCell lead={lead} />
    </Tr>
  );
}

/**
 * Indicador de prioridad (Design System §04 "Detalle de lista", ícono de
 * barras junto al estado): 4 barras de altura creciente, tantas llenas como
 * cuartos de `interest_level` (0–10, escrito por `analyzeLeadResponse`
 * §1.12). Sin análisis todavía, no se dibuja nada — no hay prioridad que
 * mostrar, y una barra "vacía" por default insinuaría una lectura que no
 * existe.
 */
function InterestBars({ value }: { value: number | null }) {
  if (value == null) return <span className="inline-block w-[18px]" aria-hidden />;
  const filled = Math.ceil((value / 10) * 4);
  return (
    <span className="inline-flex items-end gap-px" title={`Interés ${value}/10`} aria-label={`Interés ${value} de 10`}>
      {[3, 5, 7, 9].map((height, index) => (
        <span
          key={height}
          className={cn("w-[3px] rounded-[1px]", index < filled ? "bg-lm-signal-text" : "bg-lm-line-strong")}
          style={{ height }}
        />
      ))}
    </span>
  );
}

function NextActionCell({ lead }: { lead: LeadWithRelations }) {
  const { label, reason, urgent } = describeNextAction(lead);
  return (
    <Td className={cn("text-xs", urgent ? "text-lm-danger" : "text-lm-ink-2")} title={reason ?? undefined}>
      {label}
    </Td>
  );
}
