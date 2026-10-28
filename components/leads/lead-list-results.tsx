"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { LeadsFilters, type LeadListFilters } from "@/components/leads/leads-filters";
import { LeadsKanban } from "@/components/leads/leads-kanban";
import { LeadsTable } from "@/components/leads/leads-table";
import type { LeadsSortField, LeadWithRelations } from "@/lib/leads/queries";
import { STATUS_LABEL } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

const PAGE_SIZE = 25;

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

function comparable(lead: LeadWithRelations, field: LeadsSortField) {
  if (field === "status") return STATUS_LABEL[lead.status];
  return lead[field] ?? "";
}

export function LeadListResults({
  leads,
  industries,
  cities,
  view,
  initialFilters,
  initialSort,
  initialAscending,
  initialPage,
  basePath,
}: {
  leads: LeadWithRelations[];
  industries: Industry[];
  cities: string[];
  view: "tabla" | "kanban";
  initialFilters: LeadListFilters;
  initialSort: LeadsSortField;
  initialAscending: boolean;
  initialPage: number;
  basePath: string;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState(initialSort);
  const [ascending, setAscending] = useState(initialAscending);
  const [page, setPage] = useState(initialPage);

  const filtered = useMemo(() => {
    const term = normalized(filters.q.trim());
    const result = leads.filter((lead) => {
      if (filters.industryId && lead.industry_id !== filters.industryId) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.city && lead.city !== filters.city) return false;
      if (!term) return true;
      return [lead.name, lead.phone, lead.email, lead.address, lead.city].some((value) => normalized(value).includes(term));
    });

    return result.sort((a, b) => {
      const left = comparable(a, sort);
      const right = comparable(b, sort);
      const comparison = String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
      return ascending ? comparison : -comparison;
    });
  }, [ascending, filters, leads, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = view === "tabla" ? filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : filtered;

  function replaceUrl(nextFilters: LeadListFilters, nextSort = sort, nextAscending = ascending, nextPage = 1) {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set("sort", nextSort);
    params.set("dir", nextAscending ? "asc" : "desc");
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    window.history.replaceState(null, "", `${basePath}?${params.toString()}`);
  }

  function changeFilters(next: LeadListFilters) {
    setFilters(next);
    setPage(1);
    replaceUrl(next);
  }

  function changeSort(field: LeadsSortField) {
    const nextAscending = field === sort ? !ascending : field === "name" || field === "status";
    setSort(field);
    setAscending(nextAscending);
    setPage(1);
    replaceUrl(filters, field, nextAscending);
  }

  function changePage(next: number) {
    setPage(next);
    replaceUrl(filters, sort, ascending, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const from = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <div className="flex flex-col gap-6">
      <LeadsFilters industries={industries} cities={cities} value={filters} onChange={changeFilters} />

      {view === "kanban" ? (
        <LeadsKanban leads={visible} />
      ) : (
        <LeadsTable leads={visible} industries={industries} sort={sort} ascending={ascending} onSort={changeSort} />
      )}

      {view === "tabla" && filtered.length > 0 ? (
        <div className="flex items-center justify-between text-[13px] text-lm-ink-2">
          <span className="font-mono tabular-nums">Mostrando {from}–{to} de {filtered.length}</span>
          <div className="flex items-center gap-2">
            <PageButton disabled={currentPage <= 1} label="Página anterior" onClick={() => changePage(currentPage - 1)}>
              <ChevronLeft className="size-4" strokeWidth={1.5} />
            </PageButton>
            <span className="font-mono tabular-nums">{currentPage} / {totalPages}</span>
            <PageButton disabled={currentPage >= totalPages} label="Página siguiente" onClick={() => changePage(currentPage + 1)}>
              <ChevronRight className="size-4" strokeWidth={1.5} />
            </PageButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageButton({ disabled, label, onClick, children }: React.PropsWithChildren<{ disabled: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lm-sm border border-lm-line-strong text-lm-ink-2",
        disabled ? "opacity-40" : "hover:bg-lm-raised hover:text-lm-ink",
      )}
    >
      {children}
    </button>
  );
}
