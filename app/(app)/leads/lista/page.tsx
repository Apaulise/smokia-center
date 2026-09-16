import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadListCard } from "@/components/leads/lead-list-card";
import { listLeadListsOverview } from "@/lib/leads/queries";

export const metadata = { title: "Listas de leads · Awareness AI" };

/**
 * Previsualización de listas (ajuste sobre Plan §1.3): antes de ver la tabla
 * de todos los leads mezclados, se elige una lista puntual. Cada card permite
 * además renombrar o borrar la lista sin entrar a sus leads.
 */
export default async function LeadsListaPage() {
  const lists = await listLeadListsOverview();

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Listas de leads"
        description="Elegí una lista para ver y trabajar sus leads."
      />
      <div className="px-6 py-8 lg:px-10">
        {lists.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-6" />}
            title="Todavía no generaste ninguna lista"
            description="Generá una lista por rubro y zona, o importá un CSV, para empezar a trabajarla."
            action={<ButtonLink href="/leads/generar">Generar lista</ButtonLink>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <LeadListCard key={list.id} list={list} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
