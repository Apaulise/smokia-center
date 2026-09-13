import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Radar } from "lucide-react";

export const metadata = { title: "Gestor de Leads · Awareness AI" };

export default function LeadsDashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Dashboard"
        description="Contactados, agendas acordadas y clientes cerrados."
      />
      <div className="px-6 lg:px-10">
        <EmptyState
          icon={<Radar className="size-5" />}
          title="Todavía no hay leads"
          description="Generá tu primera lista por rubro y zona para empezar a ver métricas acá."
          action={
            <ButtonLink href="/leads/generar" variant="primary">
              Generar lista de leads
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}
