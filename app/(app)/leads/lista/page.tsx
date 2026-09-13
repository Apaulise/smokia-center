import { ChevronLeft, ChevronRight, LayoutGrid, TableProperties } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsKanban } from "@/components/leads/leads-kanban";
import { LeadsTable } from "@/components/leads/leads-table";
import type { LeadsSortField } from "@/lib/leads/queries";
import { listLeadCities, listLeadListsLite, listLeads, listLeadsForKanban } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import { listIndustries } from "@/lib/settings/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lista de leads · Awareness AI" };

const SORT_FIELDS: LeadsSortField[] = ["created_at", "name", "status", "last_contacted_at", "next_action_at"];

type SearchParams = {
  view?: string;
  industryId?: string;
  status?: string;
  leadListId?: string;
  city?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export default async function LeadsListaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === "kanban" ? "kanban" : "tabla";
  const sort = SORT_FIELDS.includes(params.sort as LeadsSortField) ? (params.sort as LeadsSortField) : "created_at";
  const ascending = params.dir === "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const filters = {
    industryId: params.industryId || undefined,
    status: (params.status as LeadStatus) || undefined,
    leadListId: params.leadListId || undefined,
    city: params.city || undefined,
    q: params.q || undefined,
  };

  const [industries, leadLists, cities] = await Promise.all([
    listIndustries(),
    listLeadListsLite(),
    listLeadCities(),
  ]);

  const otherParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") otherParams.set(key, value);
  }

  if (view === "kanban") {
    const leads = await listLeadsForKanban(filters);
    return (
      <>
        <PageHeader
          eyebrow="Gestor de Leads"
          title="Lista de leads"
          description="Filtrá por rubro, estado, lista de origen o ciudad y hacé seguimiento hasta el cierre."
          action={<ViewToggle view={view} otherParams={otherParams} />}
        />
        <div className="space-y-6 px-6 py-8 lg:px-10">
          <LeadsFilters
            industries={industries}
            leadLists={leadLists}
            cities={cities}
            view={view}
            current={filters}
          />
          <LeadsKanban leads={leads} />
        </div>
      </>
    );
  }

  const { leads, count, pageSize } = await listLeads(filters, page, sort, ascending);
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Lista de leads"
        description="Filtrá por rubro, estado, lista de origen o ciudad y hacé seguimiento hasta el cierre."
        action={<ViewToggle view={view} otherParams={otherParams} />}
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        <LeadsFilters industries={industries} leadLists={leadLists} cities={cities} view={view} current={filters} />

        <LeadsTable leads={leads} industries={industries} />

        {count > 0 ? (
          <div className="flex items-center justify-between text-sm text-muted">
            <span className="tabular">
              Mostrando {from}–{to} de {count}
            </span>
            <div className="flex items-center gap-2">
              <PageLink params={otherParams} page={page - 1} disabled={page <= 1}>
                <ChevronLeft className="size-4" />
              </PageLink>
              <span className="tabular">
                {page} / {totalPages}
              </span>
              <PageLink params={otherParams} page={page + 1} disabled={page >= totalPages}>
                <ChevronRight className="size-4" />
              </PageLink>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ViewToggle({ view, otherParams }: { view: string; otherParams: URLSearchParams }) {
  const tablaParams = new URLSearchParams(otherParams);
  tablaParams.set("view", "tabla");
  const kanbanParams = new URLSearchParams(otherParams);
  kanbanParams.set("view", "kanban");

  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      <ButtonLink
        href={`/leads/lista?${tablaParams.toString()}`}
        variant={view === "tabla" ? "secondary" : "ghost"}
        size="sm"
      >
        <TableProperties className="size-3.5" />
        Tabla
      </ButtonLink>
      <ButtonLink
        href={`/leads/lista?${kanbanParams.toString()}`}
        variant={view === "kanban" ? "secondary" : "ghost"}
        size="sm"
      >
        <LayoutGrid className="size-3.5" />
        Kanban
      </ButtonLink>
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: URLSearchParams;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const linkParams = new URLSearchParams(params);
  linkParams.set("page", String(page));

  return (
    <Link
      href={disabled ? "#" : `/leads/lista?${linkParams.toString()}`}
      aria-disabled={disabled}
      className={cn(
        "flex size-8 items-center justify-center rounded-[12px] border border-line",
        disabled ? "pointer-events-none opacity-40" : "hover:border-cyan/40 hover:text-cyan",
      )}
    >
      {children}
    </Link>
  );
}
