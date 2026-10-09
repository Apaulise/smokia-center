import { ListChecks } from "lucide-react";

import { EmptyListsActions } from "@/components/leads/empty-lists-actions";
import { ListsBrowser } from "@/components/leads/lists-browser";
import { EmptyState } from "@/components/leads/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { listLeadListsOverview } from "@/lib/leads/queries";
import { listIndustries } from "@/lib/settings/queries";

export const metadata = { title: "Listas de leads · SmokIA" };

/**
 * Previsualización de listas (Design System §03/04): tabla densa por
 * defecto, grilla opcional. Cada fila/card permite además renombrar o borrar
 * la lista sin entrar a sus leads.
 */
export default async function LeadsListaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view = viewParam === "grilla" ? "grilla" : "tabla";
  const [lists, industries] = await Promise.all([listLeadListsOverview(), listIndustries()]);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Listas" />
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <PageHeading title="Listas" description="Elegí una lista para ver y trabajar sus leads." />

        {lists.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-5" strokeWidth={1.5} />}
            title="Todavía no generaste ninguna lista"
            description="Generá una lista por rubro y zona, importá un CSV, o creá una vacía para cargarla a mano."
            action={<EmptyListsActions industries={industries ?? []} />}
          />
        ) : (
          <ListsBrowser lists={lists} view={view} industries={industries ?? []} />
        )}
      </div>
    </>
  );
}
