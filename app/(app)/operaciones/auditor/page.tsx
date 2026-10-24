import { AuditorList } from "@/components/ops/auditor-list";
import { OpsFrame } from "@/components/ops/frame";
import { EmptyLine, EmptyState } from "@/components/leads/ui/feedback";
import { PageHeading } from "@/components/leads/ui/page-header";
import { Section } from "@/components/leads/ui/section";
import { formatUpdatedAt } from "@/lib/ops/format";
import { getOpsRecords } from "@/lib/ops/queries";

export const metadata = { title: "Auditor · Operaciones · SmokIA" };

export default async function AuditorPage() {
  const records = await getOpsRecords();
  const updatedAt = formatUpdatedAt(records.updatedAtIso ? new Date(records.updatedAtIso) : new Date());

  return (
    <OpsFrame crumb="Auditor" updatedAt={updatedAt}>
      <PageHeading
        eyebrow={`AUDITOR · ${records.weekLabel}`}
        title="Auditor"
        description="Mejoras que propone el Auditor revisando todas las áreas. Máximo tres a la vez; el resto queda en el historial."
      />
      {!records.schemaReady ? (
        <EmptyState
          title="Falta la base de Operaciones"
          description="Los hallazgos del Auditor aparecen cuando se aplica la migración y el orquestador empieza a escribirlos."
        />
      ) : records.readError ? (
        <EmptyState title="No se pudo leer al Auditor" description={records.readError} />
      ) : records.openImprovements.length === 0 && records.historyImprovements.length === 0 ? (
        <EmptyLine>El Auditor todavía no dejó hallazgos.</EmptyLine>
      ) : (
        <>
          {records.openImprovements.length === 0 ? (
            <EmptyLine>No hay hallazgos abiertos. Lo anterior quedó en el historial.</EmptyLine>
          ) : (
            <AuditorList items={records.openImprovements} />
          )}
          {records.historyImprovements.length > 0 ? (
            <Section eyebrow="HISTORIAL" title="Lo que ya no está al frente" description="Aplicado, descartado, o pasado de los tres abiertos.">
              <AuditorList items={records.historyImprovements} />
            </Section>
          ) : null}
        </>
      )}
    </OpsFrame>
  );
}
