import { Percent, PhoneCall, Radar, Target, Trophy } from "lucide-react";

import { ActivityTimelineChart } from "@/components/leads/dashboard/activity-timeline-chart";
import { StaleLeadsList, UpcomingAppointments } from "@/components/leads/dashboard/attention-panel";
import { IndustryDistributionChart } from "@/components/leads/dashboard/industry-distribution";
import { LeadsFunnel } from "@/components/leads/dashboard/leads-funnel";
import { ListPerformanceTable } from "@/components/leads/dashboard/list-performance";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import {
  getActivityTimeline,
  getDashboardSummary,
  getLeadsByIndustry,
  getLeadsFunnel,
  getListPerformance,
  listStaleLeads,
  listUpcomingAppointments,
} from "@/lib/leads/queries";

export const metadata = { title: "Gestor de Leads · Awareness AI" };

const STALE_DAYS = 7;

/** Home del gestor (Plan §1.4). Los agregados salen de funciones Postgres vía `.rpc()` — ver lib/leads/queries.ts. */
export default async function LeadsDashboardPage() {
  const [summary, funnel, timeline, byIndustry, listPerformance, appointments, staleLeads] = await Promise.all([
    getDashboardSummary(),
    getLeadsFunnel(),
    getActivityTimeline(30),
    getLeadsByIndustry(),
    getListPerformance(),
    listUpcomingAppointments(),
    listStaleLeads(STALE_DAYS),
  ]);

  if (summary.total_leads === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Gestor de Leads"
          title="Dashboard"
          description="Contactados, agendas acordadas y clientes cerrados."
        />
        <div className="px-6 lg:px-10">
          <EmptyState
            icon={<Radar className="size-5" />}
            title="Todavía no hay leads"
            description="Generá tu primera lista por rubro y zona para empezar a ver métricas acá."
            action={
              <ButtonLink href="/leads/generar" variant="primary">
                Generar lista de leads
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Dashboard"
        description="Contactados, agendas acordadas y clientes cerrados."
        action={
          <ButtonLink href="/leads/generar" variant="primary">
            Generar lista de leads
          </ButtonLink>
        }
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Leads totales" value={summary.total_leads} icon={<Radar className="size-4" />} />
          <StatTile
            label="Contactados"
            value={summary.contacted}
            accent="cyan"
            icon={<PhoneCall className="size-4" />}
          />
          <StatTile label="Agendados" value={summary.scheduled} accent="violet" icon={<Target className="size-4" />} />
          <StatTile
            label="Cerrados ganados"
            value={summary.won}
            accent="cyan"
            icon={<Trophy className="size-4" />}
          />
          <StatTile
            label="Tasa de conversión"
            value={`${summary.conversion_rate ?? 0}%`}
            accent="violet"
            icon={<Percent className="size-4" />}
          />
        </div>

        <Card>
          <CardHeader title="Embudo por estado" description="Cuántos leads hay hoy en cada etapa del pipeline." />
          <CardBody>
            <LeadsFunnel stages={funnel} />
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Contactos y cierres" description="Últimos 30 días." />
            <CardBody>
              <ActivityTimelineChart points={timeline} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Distribución por rubro" />
            <CardBody>
              <IndustryDistributionChart industries={byIndustry} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Rendimiento por lista de origen"
            description="Qué combinación de rubro y zona cierra mejor — para saber en qué gastar crédito de Apify."
          />
          <CardBody>
            {listPerformance.length > 0 ? (
              <ListPerformanceTable lists={listPerformance} />
            ) : (
              <p className="text-sm text-muted">Todavía no hay listas con leads para comparar.</p>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Próximas reuniones" />
            <CardBody>
              <UpcomingAppointments appointments={appointments} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Sin tocar hace más de ${STALE_DAYS} días`} />
            <CardBody>
              <StaleLeadsList leads={staleLeads} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
