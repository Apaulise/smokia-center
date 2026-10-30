import Link from "next/link";

import { AreaSummaryTable } from "@/components/ops/area-summary";
import { AuditorList } from "@/components/ops/auditor-list";
import { OpsFrame } from "@/components/ops/frame";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyLine, EmptyState } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { PageHeading } from "@/components/leads/ui/page-header";
import { Section } from "@/components/leads/ui/section";
import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";
import { formatUpdatedAt, monthLabel } from "@/lib/ops/format";
import { periodDelta } from "@/lib/ops/period";
import { getOpsKpis, getOpsRecords } from "@/lib/ops/queries";
import { summarizeAreas } from "@/lib/ops/summary";
import { OPS_PERIODS, type OpsPeriod } from "@/lib/ops/types";

export const metadata = { title: "Operaciones · SmokIA" };

function parsePeriod(value: string | undefined): OpsPeriod {
  return value === "30d" ? "30d" : "7d";
}

export default async function OperacionesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const [kpis, records] = await Promise.all([getOpsKpis(period), getOpsRecords()]);

  const updatedAt = formatUpdatedAt(records.updatedAtIso ? new Date(records.updatedAtIso) : new Date());
  const delta = periodDelta(kpis.contacted, kpis.contactedPrevious, period);
  const pending = records.schemaReady && !records.readError ? records.pendingCount : null;
  const pendingDelta = !records.schemaReady
    ? "falta la migración"
    : records.readError
      ? "no se pudo leer la cola"
      : pending && pending > 0
        ? "borradores en la cola"
        : "cola al día";
  const contentTotal = kpis.instagramQueue + kpis.youtubeQueue;
  const areas = summarizeAreas(records.items);
  const blocks = records.items.filter((item) => item.estado === "bloqueo");
  const waiting = records.approvals.filter((item) => item.decision === "pending");

  return (
    <OpsFrame crumb="Resumen" updatedAt={updatedAt}>
      <PageHeading
        eyebrow={`RESUMEN · ${monthLabel()}`}
        title="Resumen"
        description="Qué se hizo, qué falta y qué necesita tu OK. Los agentes reportan acá; Mr. Pou te avisa sólo lo que no puede esperar."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/operaciones/analisis" variant="ghost">
              Análisis semanal
            </ButtonLink>
            <Segmented>
              {OPS_PERIODS.map((key) => (
                <SegmentedLink key={key} href={`/operaciones?period=${key}`} active={key === period}>
                  {key}
                </SegmentedLink>
              ))}
            </Segmented>
            {pending != null && pending > 0 ? (
              <ButtonLink href="/operaciones/aprobaciones" variant="primary">
                Revisar {pending} {pending === 1 ? "aprobación" : "aprobaciones"}
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <KpiRow className="auto-cols-[minmax(148px,1fr)]">
        <Kpi
          label="Contactados"
          value={
            <Link href="/leads/objetivo" className="hover:text-lm-signal-text">
              {kpis.contactedTarget != null ? `${kpis.contacted} / ${kpis.contactedTarget}` : kpis.contacted}
            </Link>
          }
          delta={kpis.contactedTarget != null ? delta.text : "sin objetivo cargado"}
          trend={kpis.contactedTarget != null ? delta.trend : "neutral"}
          muted={kpis.contacted === 0 && kpis.contactedTarget == null}
        />
        <Kpi
          label="Respuestas"
          value={String(kpis.replies)}
          delta="de leads, en el período"
          muted={kpis.replies === 0}
        />
        <Kpi
          label="Reuniones"
          value={
            <Link href="/leads/agenda" className="hover:text-lm-signal-text">
              {kpis.meetings}
            </Link>
          }
          delta={`agendadas · próximos ${kpis.periodDays} días`}
          muted={kpis.meetings === 0}
        />
        <Kpi
          label="Contenido en cola"
          value={
            <Link href="/marca/planificador" className="hover:text-lm-signal-text">
              {contentTotal}
            </Link>
          }
          delta={contentTotal === 0 ? "nada en el planificador" : `IG ${kpis.instagramQueue} · YT ${kpis.youtubeQueue}`}
          muted={contentTotal === 0}
        />
        <Kpi
          label="Necesita tu OK"
          value={pending == null ? "—" : String(pending)}
          delta={pendingDelta}
          signal={pending != null}
          mark={pending != null}
          muted={pending == null}
        />
      </KpiRow>

      {!records.schemaReady ? (
        <EmptyState
          title="Falta la base de Operaciones"
          description="Los números de arriba salen de Leads y Marca. El estado de los agentes, la cola y el Auditor aparecen cuando se aplica la migración en Supabase."
        />
      ) : records.readError ? (
        <EmptyLine>{records.readError}</EmptyLine>
      ) : (
        <>
          <div className="flex flex-wrap gap-9">
            <div className="min-w-0 flex-[2_1_420px]">
              <Section
                eyebrow="ATENCIÓN"
                title="Necesita tu OK"
                description="Borradores que no salen sin tu aprobación. Aprobarlos acá sólo los deja registrados."
                action={
                  <ButtonLink href="/operaciones/aprobaciones" variant="secondary" size="sm">
                    Ver cola
                  </ButtonLink>
                }
              >
                {waiting.length === 0 ? (
                  <EmptyLine>No hay borradores esperando tu OK.</EmptyLine>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {waiting.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <Link href="/operaciones/aprobaciones" className="flex items-center gap-3 border-b border-lm-line py-2.5">
                          <span className="size-1.5 shrink-0 rounded-full bg-lm-signal" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-lm-ink">{item.lead}</span>
                            <span className="block truncate text-xs text-lm-ink-3">
                              {item.agent}
                              {item.why ? ` · ${item.why}` : ""}
                            </span>
                          </span>
                          <span className="font-mono text-xs text-lm-ink-3">{item.at}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
            <div className="min-w-0 flex-[1_1_260px]">
              <Section eyebrow="BLOQUEOS" title="Frenado hasta que decidas">
                {blocks.length === 0 ? (
                  <EmptyLine>Nada frenado en este momento.</EmptyLine>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {blocks.slice(0, 6).map((item) => (
                      <li key={item.id} className="border-b border-lm-line py-2.5">
                        <span className="block text-[13px] font-medium text-lm-ink">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-lm-ink-3">
                          {item.agent}
                          {item.detail ? ` · ${item.detail}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>

          <Section eyebrow="ÁREAS" title="Estado por área" description="Hecho, pendiente y bloqueo de lo que reportaron los agentes.">
            {records.items.length === 0 ? (
              <EmptyLine>Los agentes todavía no reportaron tareas.</EmptyLine>
            ) : (
              <AreaSummaryTable rows={areas} />
            )}
          </Section>

          <Section
            eyebrow="AUDITOR"
            title="Qué mejorar"
            action={
              <ButtonLink href="/operaciones/auditor" variant="ghost" size="sm">
                Ver todo
              </ButtonLink>
            }
          >
            {records.openImprovements.length === 0 ? (
              <EmptyLine>El Auditor todavía no dejó hallazgos.</EmptyLine>
            ) : (
              <AuditorList items={records.openImprovements} />
            )}
          </Section>
        </>
      )}
    </OpsFrame>
  );
}
