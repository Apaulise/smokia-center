import { Users } from "lucide-react";
import Link from "next/link";

import { DailyContactsChart } from "@/components/leads/execution/daily-contacts-chart";
import { MemberContribution } from "@/components/leads/team/member-contribution";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Pipeline } from "@/components/leads/ui/pipeline";
import { Section } from "@/components/leads/ui/section";
import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";
import { buildProspectingStages, toPipelineStages, totalResponseRate } from "@/lib/leads/prospecting-rates";
import { mergeSeries, sumFunnels } from "@/lib/leads/team/aggregate";
import { getTeamSummary } from "@/lib/leads/team/summary";
import { sliceContacts } from "@/lib/leads/execution/derive";
import { todayIso } from "@/lib/leads/calendar";

export const metadata = { title: "Equipo · Gestor de Leads · SmokIA" };

/**
 * Dashboard de equipo (Plan §1.23): las métricas globales de los dos socios y
 * la de cada uno por separado. Sólo agregados — los leads, mensajes y notas de
 * cada uno siguen aislados por RLS; acá no hay ninguna fila de leads ajenos.
 * `?vista=equipo` (default) o `?vista=<id de un miembro>`.
 */
export default async function EquipoPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const team = await getTeamSummary(30);

  if (!team) {
    return (
      <>
        <HeaderBar breadcrumb="Gestor de Leads / Equipo" />
        <div className="px-6 py-8 lg:px-8">
          <PageHeading eyebrow="EQUIPO" title="Equipo" />
          <div className="mt-8">
            <EmptyState
              icon={<Users className="size-5" strokeWidth={1.5} />}
              title="Todavía no hay un equipo configurado"
              description="Cuando el equipo esté armado vas a ver acá las métricas de los dos juntos y la de cada uno. Mientras tanto, tu dashboard personal sigue funcionando igual."
              action={
                <ButtonLink href="/leads" variant="secondary">
                  Ir al dashboard
                </ButtonLink>
              }
            />
          </div>
        </div>
      </>
    );
  }

  const selected = team.members.find((m) => m.member.ownerId === vista) ?? null;
  const scopeMembers = selected ? [selected] : team.members;
  const label = (m: (typeof team.members)[number]) => (m.isMe ? `${m.member.name} (vos)` : m.member.name);

  const funnel = sumFunnels(scopeMembers.map((m) => m.funnel));
  const contacts = sliceContacts(mergeSeries(scopeMembers.map((m) => m.series)), todayIso());
  const execution = team.execution;
  // Objetivo diario del alcance elegido: el del equipo entero, o la parte de esa persona.
  const dailyTarget = execution ? (selected ? (selected.share?.today ?? 0) : execution.adjustedChain.contactsPerDay) : null;

  const conversionRate = funnel.total_leads > 0 ? Math.round((funnel.won / funnel.total_leads) * 1000) / 10 : 0;
  const totalRate = totalResponseRate(funnel);
  const pipelineStages = toPipelineStages(buildProspectingStages(funnel));

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Equipo" />

      <div className="flex flex-col gap-9 px-6 py-8 lg:px-8">
        <PageHeading
          eyebrow="EQUIPO"
          title={selected ? label(selected) : "Equipo"}
          description={
            selected
              ? selected.isMe
                ? "Tus números, tal como los ve tu socio."
                : "Sus números. Ves los totales, no sus leads."
              : "Los números de los dos juntos. Cada uno contra su parte del objetivo."
          }
          action={
            <Segmented>
              <SegmentedLink href="/leads/equipo" active={!selected}>
                Equipo
              </SegmentedLink>
              {team.members.map((m) => (
                <SegmentedLink key={m.member.ownerId} href={`/leads/equipo?vista=${m.member.ownerId}`} active={selected?.member.ownerId === m.member.ownerId}>
                  {label(m)}
                </SegmentedLink>
              ))}
            </Segmented>
          }
        />

        <KpiRow>
          {dailyTarget !== null ? (
            <Kpi
              label="Hoy"
              signal
              value={
                <Link href="/leads/objetivo" className="hover:text-lm-signal-text">
                  {contacts.today} / {dailyTarget}
                </Link>
              }
              delta={selected ? "contactos · su parte" : "contactos · equipo"}
              trend={contacts.today >= dailyTarget ? "up" : "neutral"}
            />
          ) : (
            <Kpi
              label="Hoy"
              muted
              value={contacts.today}
              delta={
                <Link href="/leads/objetivo" className="underline underline-offset-2 hover:text-lm-ink">
                  Definir objetivo
                </Link>
              }
            />
          )}
          <Kpi label="Leads" value={funnel.total_leads} />
          <Kpi
            label="Contactados"
            value={funnel.contacts_sent}
            delta={funnel.total_leads > 0 ? `${Math.round((funnel.contacts_sent / funnel.total_leads) * 100)} % del total` : "—"}
          />
          <Kpi label="Reuniones" value={funnel.meetings} delta={funnel.meetings > 0 ? "acumulado" : "—"} muted={funnel.meetings === 0} />
          <Kpi label="Ganados" value={funnel.won} muted={funnel.won === 0} />
          <Kpi
            label="Conversión"
            value={`${conversionRate} %`}
            muted={funnel.won === 0}
            delta={totalRate !== null ? `resp. total ${(totalRate * 100).toFixed(0)} % (no evaluativa)` : "—"}
          />
        </KpiRow>

        {!selected ? (
          <Section
            eyebrow="EQUIPO"
            title="Aporte de cada uno"
            description={
              execution
                ? "Cada uno contra su parte: el objetivo del equipo en partes iguales."
                : "Todavía no hay objetivo del equipo: definanlo en Objetivo para ver la parte de cada uno."
            }
          >
            <MemberContribution members={team.members} />
          </Section>
        ) : null}

        <Section eyebrow="PIPELINE" title="Prospección" description="Leads → contactados → respuestas → calificados → interesados → con reunión → ganados.">
          <Pipeline stages={pipelineStages} />
        </Section>

        {dailyTarget !== null ? (
          <Section
            eyebrow="ESTE MES"
            title="Contactos por día"
            description={
              selected
                ? "Primeros contactos y seguimientos de cada día, contra su parte del objetivo diario."
                : "Primeros contactos y seguimientos de los dos juntos, contra el objetivo diario del equipo."
            }
          >
            <DailyContactsChart days={contacts.monthDays} target={dailyTarget} />
          </Section>
        ) : null}
      </div>
    </>
  );
}
