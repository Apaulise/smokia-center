import { FollowUpQueue } from "@/components/leads/follow-up-queue";
import { FollowUpTabs } from "@/components/leads/crm/sections";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { FollowUpMetricsPanel } from "@/components/leads/follow-up-metrics-panel";
import { getFollowUpMetrics } from "@/lib/leads/follow-up-metrics";
import { listFollowUpQueue } from "@/lib/leads/queries";

export const metadata = { title: "Seguimiento · SmokIA" };

export default async function SeguimientoPage() {
  const [leads, metrics] = await Promise.all([listFollowUpQueue(), getFollowUpMetrics()]);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Seguimiento" />
      <div className="flex min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeading
          title="Seguimiento"
          description="Leads ya contactados que siguen sin cerrar, con los más estancados primero."
        />
        <FollowUpTabs active="prospectos" />
        <FollowUpQueue leads={leads} />
        <FollowUpMetricsPanel metrics={metrics} />
      </div>
    </>
  );
}
