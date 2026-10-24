import { ApprovalQueue } from "@/components/ops/approval-queue";
import { OpsFrame } from "@/components/ops/frame";
import { EmptyState } from "@/components/leads/ui/feedback";
import { PageHeading } from "@/components/leads/ui/page-header";
import { formatUpdatedAt } from "@/lib/ops/format";
import { getOpsRecords } from "@/lib/ops/queries";

export const metadata = { title: "Aprobaciones · Operaciones · SmokIA" };

export default async function AprobacionesPage() {
  const records = await getOpsRecords();
  const updatedAt = formatUpdatedAt(records.updatedAtIso ? new Date(records.updatedAtIso) : new Date());
  const whatsappOnly = records.approvals.every((item) => item.channel === "whatsapp");

  return (
    <OpsFrame crumb="Aprobaciones" updatedAt={updatedAt}>
      <PageHeading
        eyebrow={whatsappOnly ? "COLA · WHATSAPP" : "COLA"}
        title="Aprobaciones"
        description="Nada sale desde esta pantalla. Aprobá, editá o salteá: queda registrado para que Mr. Pou lo lea. Acá no se manda WhatsApp ni mail."
      />
      {!records.schemaReady ? (
        <EmptyState
          title="Falta la base de Operaciones"
          description="Cuando se aplique la migración, los borradores que manden los agentes van a aparecer en esta cola."
        />
      ) : records.readError ? (
        <EmptyState title="No se pudo leer la cola" description={records.readError} />
      ) : (
        <ApprovalQueue items={records.approvals} />
      )}
    </OpsFrame>
  );
}
