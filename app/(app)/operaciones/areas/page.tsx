import { OpsFrame } from "@/components/ops/frame";
import { OpsStatusTable } from "@/components/ops/status-table";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyLine, EmptyState } from "@/components/leads/ui/feedback";
import { PageHeading } from "@/components/leads/ui/page-header";
import { Segmented, SegmentedLink, TabLink, Tabs } from "@/components/leads/ui/tabs";
import { formatUpdatedAt } from "@/lib/ops/format";
import { AREA_LABEL, ESTADO_LABEL } from "@/lib/ops/schema";
import { getOpsRecords } from "@/lib/ops/queries";
import { AREA_FILTERS, ESTADO_FILTERS, type OpsAreaFilter, type OpsEstado, type OpsEstadoFilter } from "@/lib/ops/types";

export const metadata = { title: "Áreas · Operaciones · SmokIA" };

function parseArea(value: string | undefined): OpsAreaFilter {
  return AREA_FILTERS.find((area) => area === value) ?? "todas";
}

function parseEstado(value: string | undefined): OpsEstadoFilter {
  return ESTADO_FILTERS.find((estado) => estado === value) ?? "todo";
}

function hrefFor(area: OpsAreaFilter, estado: OpsEstadoFilter): string {
  const params = new URLSearchParams();
  if (area !== "todas") params.set("area", area);
  if (estado !== "todo") params.set("estado", estado);
  const query = params.toString();
  return query ? `/operaciones/areas?${query}` : "/operaciones/areas";
}

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; estado?: string }>;
}) {
  const params = await searchParams;
  const area = parseArea(params.area);
  const estado = parseEstado(params.estado);
  const records = await getOpsRecords();
  const updatedAt = formatUpdatedAt(records.updatedAtIso ? new Date(records.updatedAtIso) : new Date());
  const rows = records.items.filter(
    (item) => (area === "todas" || item.area === area) && (estado === "todo" || item.estado === estado),
  );
  const canFilter = records.schemaReady && !records.readError;

  return (
    <OpsFrame crumb="Áreas" updatedAt={updatedAt}>
      <PageHeading
        eyebrow="ESTADO · ESTA SEMANA"
        title="Áreas"
        action={
          canFilter ? (
            <Segmented>
              {ESTADO_FILTERS.map((key) => (
                <SegmentedLink key={key} href={hrefFor(area, key)} active={key === estado}>
                  {key === "todo" ? "Todo" : ESTADO_LABEL[key as OpsEstado]}
                </SegmentedLink>
              ))}
            </Segmented>
          ) : null
        }
      />

      {!records.schemaReady ? (
        <EmptyState
          title="Falta la base de Operaciones"
          description="El estado por área aparece cuando los agentes pueden escribir en Supabase."
        />
      ) : records.readError ? (
        <EmptyState title="No se pudo leer el estado" description={records.readError} />
      ) : (
        <>
          <Tabs>
            {AREA_FILTERS.map((key) => (
              <TabLink key={key} href={hrefFor(key, estado)} active={key === area}>
                {key === "todas" ? "Todas" : AREA_LABEL[key]}
              </TabLink>
            ))}
          </Tabs>
          {records.items.length === 0 ? (
            <EmptyLine>Los agentes todavía no reportaron tareas.</EmptyLine>
          ) : rows.length === 0 ? (
            <EmptyLine action={<ButtonLink href="/operaciones/areas" variant="secondary" size="sm">Ver todo</ButtonLink>}>
              Nada con ese estado en esta área.
            </EmptyLine>
          ) : (
            <OpsStatusTable rows={rows} />
          )}
        </>
      )}
    </OpsFrame>
  );
}
