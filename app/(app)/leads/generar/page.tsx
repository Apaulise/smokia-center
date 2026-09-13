import { FileSpreadsheet } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { CsvImportForm } from "@/components/leads/csv-import-form";
import { GenerarForm } from "@/components/leads/generar-form";
import { JobStatusPanel } from "@/components/leads/job-status-panel";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { listIndustries } from "@/lib/settings/queries";

export const metadata = { title: "Generar leads · Awareness AI" };

export default async function GenerarLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job: jobId } = await searchParams;
  const industries = await listIndustries();

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Generar lista"
        description="Elegí una fuente, definí rubro y zona, y lanzá la búsqueda."
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        {jobId ? <JobStatusPanel key={jobId} jobId={jobId} /> : null}

        <GenerarForm industries={industries} />

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-cyan" />
                CSV / manual
              </span>
            }
            description="Red de seguridad cuando Apify falla o no hay crédito. Sin costo ni API."
          />
          <CardBody>
            <CsvImportForm industries={industries} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
