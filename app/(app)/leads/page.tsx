import { Radar } from "lucide-react";
import Link from "next/link";

import { ActivityTimelineChart } from "@/components/leads/dashboard/activity-timeline-chart";
import { AngleExperimentsTable } from "@/components/leads/dashboard/angle-experiments";
import { StaleLeadsList, UpcomingAppointments } from "@/components/leads/dashboard/attention-panel";
import { IndustryDistributionChart } from "@/components/leads/dashboard/industry-distribution";
import { ListPerformanceTable } from "@/components/leads/dashboard/list-performance";
import { StyleLoopTile } from "@/components/leads/dashboard/style-loop";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Pipeline, PipelineExits } from "@/components/leads/ui/pipeline";
import { Section } from "@/components/leads/ui/section";
import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";
import {
  getActivityTimeline,
  getAngleVariantPerformance,
  getLeadsFunnel,
  getLeadsByIndustry,
  getListPerformance,
  getProspectingFunnel,
  listStaleLeads,
  listUpcomingAppointments,
} from "@/lib/leads/queries";
import { getStyleStats } from "@/lib/leads/ai/style/queries";
import { getExecutionSummary } from "@/lib/leads/execution/summary";
import { buildProspectingStages, totalResponseRate } from "@/lib/leads/prospecting-rates";

export const metadata = { title: "Gestor de Leads · Awareness AI" };

const STALE_DAYS = 7;
const PERIODS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type Period = keyof typeof PERIODS;

/** Home del gestor (Plan §1.4). Los agregados salen de funciones Postgres vía `.rpc()` — ver lib/leads/queries.ts. */
export default async function LeadsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: Period = periodParam === "7d" || periodParam === "90d" ? periodParam : "30d";

  const [funnel, exitsFunnel, angleExperiments, timeline, byIndustry, listPerformance, appointments, staleLeads, styleStats, execution] =
    await Promise.all([
      getProspectingFunnel(),
      getLeadsFunnel(),
      getAngleVariantPerformance(),
      getActivityTimeline(PERIODS[period]),
      getLeadsByIndustry(),
      getListPerformance(),
      listUpcomingAppointments(),
      listStaleLeads(STALE_DAYS),
      getStyleStats(),
      // Misma ventana por defecto que /leads/objetivo, para que el "Hoy" coincida (Plan §1.22).
      getExecutionSummary(30),
    ]);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" }).toUpperCase();
  const updatedAt = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const generarCta = (
    <ButtonLink href="/leads/generar" variant="primary">
      + Generar lista
    </ButtonLink>
  );

  if (funnel.total_leads === 0) {
    return (
      <>
        <HeaderBar breadcrumb="Gestor de Leads / Dashboard" />
        <div className="px-6 py-8 lg:px-8">
          <PageHeading eyebrow={`RESUMEN · ${monthLabel}`} title="Dashboard" />
          <div className="mt-8">
            <EmptyState
              icon={<Radar className="size-5" strokeWidth={1.5} />}
              title="Todavía no hay leads"
              description="Generá tu primera lista por rubro y zona para empezar a ver métricas acá."
              action={
                <div className="flex items-center gap-2">
                  {generarCta}
                  <ButtonLink href="/leads/generar" variant="secondary">
                    Importar CSV
                  </ButtonLink>
                </div>
              }
            />
          </div>
        </div>
      </>
    );
  }

  const stages = buildProspectingStages(funnel);
  const hotFrom = 2; // human_responses en adelante se pinta caliente (README "Estados del pipeline")
  const pipelineStages = stages.map((stage, index) => ({
    label: stage.label.replace(" (humano)", "").replace("Leads totales", "Leads").replace("Cerrados ganados", "Ganados"),
    value: stage.count,
    conversion: stage.rateFromPrevious === null ? null : Math.round(stage.rateFromPrevious * 100),
    hot: index >= hotFrom,
  }));

  const exitsByStatus = Object.fromEntries(exitsFunnel.map((s) => [s.status, s.lead_count]));
  const exits = [
    { label: "Ahora no", value: exitsByStatus.AHORA_NO ?? 0 },
    { label: "Perdido", value: exitsByStatus.CERRADO_PERDIDO ?? 0 },
    { label: "Descartado", value: exitsByStatus.DESCARTADO ?? 0 },
  ];

  const conversionRate = funnel.total_leads > 0 ? Math.round((funnel.won / funnel.total_leads) * 1000) / 10 : 0;
  const totalRate = totalResponseRate(funnel);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Dashboard" meta={`Actualizado ${updatedAt}`} />

      <div className="flex flex-col gap-9 px-6 py-8 lg:px-8">
        <PageHeading
          eyebrow={`RESUMEN · ${monthLabel}`}
          title="Dashboard"
          action={
            <div className="flex items-center gap-3">
              <Segmented>
                {(Object.keys(PERIODS) as Period[]).map((key) => (
                  <SegmentedLink key={key} href={`/leads?period=${key}`} active={key === period}>
                    {key}
                  </SegmentedLink>
                ))}
              </Segmented>
              {generarCta}
            </div>
          }
        />

        <KpiRow>
          {execution ? (
            <Kpi
              label="Hoy"
              value={
                <Link href="/leads/objetivo" className="hover:text-lm-signal-text">
                  {execution.today.contacts} / {execution.adjustedChain.contactsPerDay}
                </Link>
              }
              delta="contactos · ver cadena"
              trend={execution.today.contacts >= execution.adjustedChain.contactsPerDay ? "up" : "neutral"}
            />
          ) : (
            <Kpi
              label="Hoy"
              muted
              value="—"
              delta={
                <Link href="/leads/objetivo" className="underline underline-offset-2 hover:text-lm-ink">
                  Definir objetivo
                </Link>
              }
            />
          )}
          <Kpi label="Leads" value={funnel.total_leads} />
          <Kpi label="Contactados" value={funnel.contacts_sent} delta={`${Math.round((funnel.contacts_sent / funnel.total_leads) * 100)} % del total`} />
          <Kpi label="Reuniones" value={funnel.meetings} signal delta={funnel.meetings > 0 ? "acumulado" : "—"} muted={funnel.meetings === 0} />
          <Kpi label="Ganados" value={funnel.won} muted={funnel.won === 0} />
          <Kpi
            label="Conversión"
            value={`${conversionRate} %`}
            muted={funnel.won === 0}
            delta={totalRate !== null ? `resp. total ${(totalRate * 100).toFixed(0)} % (no evaluativa)` : "—"}
          />
        </KpiRow>

        <Section eyebrow="PIPELINE" title="Prospección" description="Un solo embudo: leads → contactados → respuestas → calificados → interesados → con reunión → ganados.">
          <Pipeline stages={pipelineStages} />
          <PipelineExits exits={exits} />
        </Section>

        <div className="grid grid-cols-1 gap-9 lg:grid-cols-3">
          <Section eyebrow="EVOLUCIÓN" title="Contactos y cierres" description={`Últimos ${PERIODS[period]} días.`} className="lg:col-span-2">
            <ActivityTimelineChart points={timeline} />
          </Section>
          <Section eyebrow="RUBROS" title="Distribución por rubro">
            <IndustryDistributionChart industries={byIndustry} />
          </Section>
        </div>

        <Section
          eyebrow="ORIGEN"
          title="Rendimiento por lista"
          description="Qué combinación de rubro y zona cierra mejor — para saber en qué gastar crédito de Apify."
        >
          {listPerformance.length > 0 ? (
            <ListPerformanceTable lists={listPerformance} />
          ) : (
            <p className="text-[13px] text-lm-ink-2">Todavía no hay listas con leads para comparar.</p>
          )}
        </Section>

        <Section eyebrow="APERTURAS" title="Experimentación de aperturas" description="Qué ángulo y qué variante conviene usar (Plan §1.19).">
          <AngleExperimentsTable rows={angleExperiments} />
        </Section>

        <Section
          eyebrow="ESTILO"
          title="Cuánto corregís a la IA"
          description="Tus ediciones sobre los borradores son lo que el agente usa para aprender a escribir como vos (Plan §1.20)."
        >
          <StyleLoopTile stats={styleStats} />
        </Section>

        <div className="grid grid-cols-1 gap-9 lg:grid-cols-2">
          <Section eyebrow="AGENDA" title="Próximas reuniones">
            <UpcomingAppointments appointments={appointments} />
          </Section>
          <Section
            eyebrow="ATENCIÓN"
            title={`Sin tocar hace más de ${STALE_DAYS} días`}
            action={
              <ButtonLink href="/leads/seguimiento" variant="ghost" size="sm">
                Ver todos
              </ButtonLink>
            }
          >
            <StaleLeadsList leads={staleLeads} />
          </Section>
        </div>
      </div>
    </>
  );
}
