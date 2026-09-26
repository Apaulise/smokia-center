import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, TableProperties } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EnrichListButton } from "@/components/leads/enrich-list-button";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsKanban } from "@/components/leads/leads-kanban";
import { LeadsTable } from "@/components/leads/leads-table";
import type { LeadsSortField } from "@/lib/leads/queries";
import { getLeadList, listLeadCities, listLeads, listLeadsForKanban } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import { listIndustries } from "@/lib/settings/queries";
import { cn } from "@/lib/utils";

const SORT_FIELDS: LeadsSortField[] = ["created_at", "name", "status", "last_contacted_at", "next_action_at"];

type SearchParams = {
  view?: string;
  industryId?: string;
  status?: string;
  city?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getLeadList(id);
  return { title: list ? `${list.name} · Awareness AI` : "Lista de leads · Awareness AI" };
}

export default async function LeadListaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const list = await getLeadList(id);
  if (!list) notFound();

  const searchParamsResolved = await searchParams;
  const view = searchParamsResolved.view === "kanban" ? "kanban" : "tabla";
  const sort = SORT_FIELDS.includes(searchParamsResolved.sort as LeadsSortField)
    ? (searchParamsResolved.sort as LeadsSortField)
    : "created_at";
  const ascending = searchParamsResolved.dir === "asc";
  const page = Math.max(1, Number(searchParamsResolved.page) || 1);

  const filters = {
    leadListId: id,
    industryId: searchParamsResolved.industryId || undefined,
    status: (searchParamsResolved.status as LeadStatus) || undefined,
    city: searchParamsResolved.city || undefined,
    q: searchParamsResolved.q || undefined,
  };

  const [industries, cities] = await Promise.all([listIndustries(), listLeadCities()]);

  const basePath = `/leads/lista/${id}`;
  const otherParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParamsResolved)) {
    if (value && key !== "page") otherParams.set(key, value);
  }

  const backAction = (
    <ButtonLink href="/leads/lista" variant="ghost" size="sm">
      <ArrowLeft className="size-3.5" />
      Volver a listas
    </ButtonLink>
  );

  if (view === "kanban") {
    const leads = await listLeadsForKanban(filters);
    return (
      <>
        <PageHeader
          eyebrow="Gestor de Leads"
          title={list.name}
          description="Filtrá por rubro, estado o ciudad y hacé seguimiento hasta el cierre."
          action={
            <div className="flex items-center gap-3">
              {backAction}
              <EnrichListButton leadListId={id} />
              <ViewToggle view={view} basePath={basePath} otherParams={otherParams} />
            </div>
          }
        />
        <div className="space-y-6 px-6 py-8 lg:px-10">
          <LeadsFilters industries={industries} cities={cities} view={view} current={filters} basePath={basePath} />
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
        title={list.name}
        description="Filtrá por rubro, estado o ciudad y hacé seguimiento hasta el cierre."
        action={
          <div className="flex items-center gap-3">
            {backAction}
            <EnrichListButton leadListId={id} />
            <ViewToggle view={view} basePath={basePath} otherParams={otherParams} />
          </div>
        }
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        <LeadsFilters industries={industries} cities={cities} view={view} current={filters} basePath={basePath} />

        <LeadsTable leads={leads} industries={industries} />

        {count > 0 ? (
          <div className="flex items-center justify-between text-sm text-muted">
            <span className="tabular">
              Mostrando {from}–{to} de {count}
            </span>
            <div className="flex items-center gap-2">
              <PageLink basePath={basePath} params={otherParams} page={page - 1} disabled={page <= 1}>
                <ChevronLeft className="size-4" />
              </PageLink>
              <span className="tabular">
                {page} / {totalPages}
              </span>
              <PageLink basePath={basePath} params={otherParams} page={page + 1} disabled={page >= totalPages}>
                <ChevronRight className="size-4" />
              </PageLink>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ViewToggle({
  view,
  basePath,
  otherParams,
}: {
  view: string;
  basePath: string;
  otherParams: URLSearchParams;
}) {
  const tablaParams = new URLSearchParams(otherParams);
  tablaParams.set("view", "tabla");
  const kanbanParams = new URLSearchParams(otherParams);
  kanbanParams.set("view", "kanban");

  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      <ButtonLink
        href={`${basePath}?${tablaParams.toString()}`}
        variant={view === "tabla" ? "secondary" : "ghost"}
        size="sm"
      >
        <TableProperties className="size-3.5" />
        Tabla
      </ButtonLink>
      <ButtonLink
        href={`${basePath}?${kanbanParams.toString()}`}
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
  basePath,
  params,
  page,
  disabled,
  children,
}: {
  basePath: string;
  params: URLSearchParams;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const linkParams = new URLSearchParams(params);
  linkParams.set("page", String(page));

  return (
    <Link
      href={disabled ? "#" : `${basePath}?${linkParams.toString()}`}
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
