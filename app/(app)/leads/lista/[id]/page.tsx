import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, TableProperties } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { EnrichListButton } from "@/components/leads/enrich-list-button";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsKanban } from "@/components/leads/leads-kanban";
import { LeadsTable } from "@/components/leads/leads-table";
import { ButtonLink } from "@/components/leads/ui/button";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";
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
  return { title: list ? `${list.name} · SmokIA` : "Lista de leads · SmokIA" };
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

  const viewToggle = <ViewToggle view={view} basePath={basePath} otherParams={otherParams} />;

  const header = (
    <>
      <HeaderBar breadcrumb={`Gestor de Leads / Listas / ${list.name}`} />
      <div className="px-6 pt-8 lg:px-8">
        <PageHeading
          title={list.name}
          description="Filtrá por rubro, estado o ciudad y hacé seguimiento hasta el cierre."
          action={
            <div className="flex items-center gap-3">
              <ButtonLink href="/leads/lista" variant="ghost" size="sm">
                <ArrowLeft className="size-3.5" strokeWidth={1.5} />
                Volver a listas
              </ButtonLink>
              <EnrichListButton leadListId={id} />
              {viewToggle}
            </div>
          }
        />
      </div>
    </>
  );

  if (view === "kanban") {
    const leads = await listLeadsForKanban(filters);
    return (
      <>
        {header}
        <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
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
      {header}
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <LeadsFilters industries={industries} cities={cities} view={view} current={filters} basePath={basePath} />

        <LeadsTable leads={leads} industries={industries} />

        {count > 0 ? (
          <div className="flex items-center justify-between text-[13px] text-lm-ink-2">
            <span className="font-mono tabular-nums">
              Mostrando {from}–{to} de {count}
            </span>
            <div className="flex items-center gap-2">
              <PageLink basePath={basePath} params={otherParams} page={page - 1} disabled={page <= 1}>
                <ChevronLeft className="size-4" strokeWidth={1.5} />
              </PageLink>
              <span className="font-mono tabular-nums">
                {page} / {totalPages}
              </span>
              <PageLink basePath={basePath} params={otherParams} page={page + 1} disabled={page >= totalPages}>
                <ChevronRight className="size-4" strokeWidth={1.5} />
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
    <Segmented>
      <SegmentedLink href={`${basePath}?${tablaParams.toString()}`} active={view === "tabla"}>
        <TableProperties className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
        Tabla
      </SegmentedLink>
      <SegmentedLink href={`${basePath}?${kanbanParams.toString()}`} active={view === "kanban"}>
        <LayoutGrid className="mr-1.5 inline size-3.5" strokeWidth={1.5} />
        Kanban
      </SegmentedLink>
    </Segmented>
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
        "flex size-8 items-center justify-center rounded-lm-sm border border-lm-line-strong text-lm-ink-2",
        disabled ? "pointer-events-none opacity-40" : "hover:bg-lm-raised hover:text-lm-ink",
      )}
    >
      {children}
    </Link>
  );
}
