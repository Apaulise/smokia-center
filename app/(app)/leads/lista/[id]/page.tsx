import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { EnrichListButton } from "@/components/leads/enrich-list-button";
import { LeadListResults } from "@/components/leads/lead-list-results";
import type { LeadListFilters } from "@/components/leads/leads-filters";
import { ListViewToggle } from "@/components/leads/list-view-toggle";
import { ButtonLink } from "@/components/leads/ui/button";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import type { LeadsSortField } from "@/lib/leads/queries";
import { getLeadList, listLeadsForKanban } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import { listIndustries } from "@/lib/settings/queries";

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

export default async function LeadListaDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const [list, query, industries, leads] = await Promise.all([
    getLeadList(id),
    searchParams,
    listIndustries(),
    listLeadsForKanban({ leadListId: id }),
  ]);
  if (!list) notFound();

  const view = query.view === "kanban" ? "kanban" : "tabla";
  const sort = SORT_FIELDS.includes(query.sort as LeadsSortField) ? (query.sort as LeadsSortField) : "created_at";
  const filters: LeadListFilters = {
    industryId: query.industryId ?? "",
    status: (query.status as LeadStatus) ?? "",
    city: query.city ?? "",
    q: query.q ?? "",
  };
  const cities = [...new Set(leads.map((lead) => lead.city).filter((city): city is string => Boolean(city)))].sort((a, b) => a.localeCompare(b, "es"));
  const basePath = `/leads/lista/${id}`;

  return (
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
              <ListViewToggle view={view} basePath={basePath} />
            </div>
          }
        />
      </div>
      <div className="px-6 py-8 lg:px-8">
        <LeadListResults
          leads={leads}
          industries={industries}
          cities={cities}
          view={view}
          initialFilters={filters}
          initialSort={sort}
          initialAscending={query.dir === "asc"}
          initialPage={Math.max(1, Number(query.page) || 1)}
          basePath={basePath}
        />
      </div>
    </>
  );
}
