import { FollowUpQueue } from "@/components/leads/follow-up-queue";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { listFollowUpQueue } from "@/lib/leads/queries";

export const metadata = { title: "Seguimiento · Awareness AI" };

export default async function SeguimientoPage() {
  const leads = await listFollowUpQueue();

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Seguimiento" />
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <PageHeading
          title="Seguimiento"
          description="Leads ya contactados que siguen sin cerrar, con los más estancados primero."
        />
        <FollowUpQueue leads={leads} />
      </div>
    </>
  );
}
