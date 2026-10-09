import { GenerarSourceSwitch } from "@/components/leads/generar-source-switch";
import { JobStatusPanel } from "@/components/leads/job-status-panel";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { getListPerformance } from "@/lib/leads/queries";
import { getApifyCredit, listIndustries } from "@/lib/settings/queries";

export const metadata = { title: "Generar leads · SmokIA" };

export default async function GenerarLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job: jobId } = await searchParams;
  const [industries, listPerformance, apifyCredit] = await Promise.all([
    listIndustries(),
    getListPerformance(),
    getApifyCredit(),
  ]);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Generar lista" />
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <PageHeading title="Generar lista" description="Elegí una fuente, definí rubro y zona, y lanzá la búsqueda." />

        {jobId ? <JobStatusPanel key={jobId} jobId={jobId} /> : null}

        <GenerarSourceSwitch industries={industries} listPerformance={listPerformance} apifyCredit={apifyCredit} />
      </div>
    </>
  );
}
