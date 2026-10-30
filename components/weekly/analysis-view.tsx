import { ChartLegend, BrandLineChart, type LineChartPoint } from "@/components/brand/dashboard/line-chart";
import { OpsFrame } from "@/components/ops/frame";
import { ChangeList, ConclusionReview } from "@/components/weekly/review-form";
import { WeekSelect } from "@/components/weekly/week-select";
import { EmptyLine, EmptyState } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { PageHeading } from "@/components/leads/ui/page-header";
import { Section } from "@/components/leads/ui/section";
import { Chip } from "@/components/leads/ui/status-badge";
import { Table, Td, TdSub, Th, Tr } from "@/components/leads/ui/table";
import { TabLink } from "@/components/leads/ui/tabs";
import { WEEKLY_AREAS } from "@/lib/weekly/areas";
import { formatUpdatedAt } from "@/lib/ops/format";
import type { WeeklyChart, WeeklyKpi, WeeklyPageModel, WeeklyTable as WeeklyTableModel } from "@/lib/weekly/types";

export function WeeklyAnalysis({ model }: { model: WeeklyPageModel }) {
  const updatedAt = formatUpdatedAt(model.report ? new Date(model.report.publishedAt) : new Date());

  return (
    <OpsFrame crumb="Análisis semanal" updatedAt={updatedAt}>
      <PageHeading
        eyebrow={`ANÁLISIS · ${model.weekLabel.toUpperCase()}`}
        title="Análisis semanal"
        description="Qué pasó en cada área, contra la semana anterior. Los números del CRM se calculan acá. El texto lo publica el agente."
        action={<WeekSelect area={model.area} value={model.weekStart} weeks={model.weeks} />}
      />

      <nav className="flex gap-6 overflow-x-auto border-b border-lm-line" aria-label="Áreas">
        {WEEKLY_AREAS.map((area) => (
          <TabLink
            key={area.id}
            className="shrink-0 whitespace-nowrap"
            href={`/operaciones/analisis?area=${area.id}&week=${model.weekStart}`}
            active={area.id === model.area}
          >
            {area.label}
          </TabLink>
        ))}
      </nav>

      {model.crmError ? <EmptyState title="No se pudieron leer los números" description={model.crmError} /> : null}

      {model.brandConnected === false ? (
        <EmptyLine>
          No hay una cuenta de {model.areaLabel} conectada en Marca. Publicados y alcance aparecen cuando exista. El texto no depende de eso.
        </EmptyLine>
      ) : null}

      {model.truncated ? (
        <EmptyLine>Hay demasiados registros para sumarlos todos. Los números de esta semana pueden estar incompletos.</EmptyLine>
      ) : null}

      {model.empty ? (
        <EmptyState
          title={model.schemaReady ? "Todavía no hay análisis de esta semana" : "Falta la base del análisis"}
          description={
            !model.schemaReady
              ? "El texto queda guardado cuando se aplica la migración. Si el área tiene números en el CRM, se ven igual."
              : model.area === "x_threads"
                ? "X y Threads no están en el CRM. Cuando el agente publique el análisis, los números y el texto van a aparecer acá, marcados como informados."
                : "Si hubo actividad, los números del CRM aparecen solos. El texto lo publica el agente al cerrar la semana."
          }
        />
      ) : (
        <>
          {model.kpis.length > 0 ? (
            <Section
              eyebrow={model.kpis[0]?.source === "reporte" ? "Informado por el agente" : "Del CRM"}
              title="La semana"
              description={model.definition ?? "Estos números los cargó el agente. No salen del CRM."}
              action={<Chip>{model.kpis[0]?.source === "reporte" ? "Informado" : "CRM"}</Chip>}
            >
              <KpiGrid kpis={model.kpis} />
            </Section>
          ) : null}

          {model.charts.map((chart) => (
            <Section
              key={chart.title}
              title={chart.title}
              description={chart.description}
              action={
                <span className="flex flex-wrap items-center gap-3">
                  <Chip>{chart.source === "reporte" ? "Informado" : "CRM"}</Chip>
                  <ChartLegend series={chart.series} />
                </span>
              }
            >
              <BrandLineChart
                points={toPoints(chart)}
                series={chart.series}
                minPointsMessage="Con menos de dos días con dato no se dibuja la curva."
              />
            </Section>
          ))}

          {model.unattributedNote ? <p className="m-0 text-[13px] text-lm-ink-3">{model.unattributedNote}</p> : null}

          {model.table ? <MessageTable table={model.table} /> : null}

          {model.reportedKpis.length > 0 ? (
            <Section
              eyebrow="Aparte del CRM"
              title="Lo que informó el agente"
              description="Estos números no se calcularon en el CRM. Quedan aparte para no mezclarlos con los de arriba."
              action={<Chip>Informado</Chip>}
            >
              <KpiGrid kpis={model.reportedKpis} />
            </Section>
          ) : null}
        </>
      )}

      {!model.empty ? (
      <>
      <Section eyebrow="Del agente" title="Conclusiones" description="El texto es de quien publicó el análisis. El estado y el resultado los marcás vos.">
        {!model.schemaReady ? (
          <EmptyLine>Falta aplicar la migración para guardar el análisis. Los números del CRM, si los hay, se ven igual.</EmptyLine>
        ) : model.reportError ? (
          <EmptyLine>{model.reportError}</EmptyLine>
        ) : model.report ? (
          <ConclusionReview
            reportId={model.report.id}
            text={model.report.conclusions}
            status={model.report.conclusionStatus}
            result={model.report.conclusionResult}
          />
        ) : (
          <EmptyLine>Esta semana todavía no tiene análisis escrito.</EmptyLine>
        )}
      </Section>

      <Section title="Cambios propuestos" description="Pendiente, aprobado, en prueba, descartado o medido. Guardar el estado no manda ningún mensaje.">
        {model.report && model.report.changes.length > 0 ? (
          <ChangeList reportId={model.report.id} changes={model.report.changes} />
        ) : (
          <EmptyLine>
            {model.schemaReady
              ? "No hay cambios propuestos para esta semana."
              : "Los cambios aparecen cuando el agente puede escribir el análisis."}
          </EmptyLine>
        )}
      </Section>
      </>
      ) : null}
    </OpsFrame>
  );
}

function KpiGrid({ kpis }: { kpis: WeeklyKpi[] }) {
  return (
    <KpiRow className="auto-cols-[minmax(148px,1fr)]">
      {kpis.map((kpi) => (
        <Kpi
          key={kpi.key}
          label={kpi.label}
          value={kpi.display}
          delta={kpi.delta}
          trend={kpi.trend}
          muted={kpi.muted}
          signal={kpi.signal}
          mark={kpi.signal}
        />
      ))}
    </KpiRow>
  );
}

function MessageTable({ table }: { table: WeeklyTableModel }) {
  return (
    <Section
      title="Por tipo de mensaje"
      description={table.caption}
      action={<Chip>{table.source === "reporte" ? "Informado" : "CRM"}</Chip>}
    >
      <Table className="min-w-[640px]">
        <thead>
          <tr>
            {table.columns.map((column) => (
              <Th key={column.key} align={column.numeric ? "right" : undefined}>
                {column.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <Tr key={row.key}>
              {table.columns.map((column) => (
                <Td key={column.key} numeric={column.numeric}>
                  {column.key === "type" ? (
                    <>
                      <span>{row.cells[column.key]}</span>
                      {row.sampleNote ? <TdSub>{row.sampleNote}</TdSub> : null}
                    </>
                  ) : (
                    row.cells[column.key]
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

function toPoints(chart: WeeklyChart): LineChartPoint[] {
  return chart.points.map((point) => ({ day: point.day, ...point.values }));
}
