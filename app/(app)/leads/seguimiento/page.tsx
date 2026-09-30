import { FollowUpQueue } from "@/components/leads/follow-up-queue";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { listFollowUpQueue } from "@/lib/leads/queries";

export const metadata = { title: "Seguimiento · Awareness AI" };

const STALE_DAYS = 7;

export default async function SeguimientoPage() {
  const leads = await listFollowUpQueue(STALE_DAYS);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Seguimiento" />
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <PageHeading
          title="Seguimiento"
          description="A quién escribirle hoy: seguimientos con fecha vencida y leads que se están enfriando."
        />
        <FollowUpQueue leads={leads} />
      </div>
    </>
  );
}
