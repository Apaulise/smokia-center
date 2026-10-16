import { Target } from "lucide-react";
import Link from "next/link";

import { DailyContactsChart } from "@/components/leads/execution/daily-contacts-chart";
import { EditGoalButton } from "@/components/leads/execution/goal-form-dialog";
import { MemberContribution } from "@/components/leads/team/member-contribution";
import { EmptyState } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Section } from "@/components/leads/ui/section";
import { Table, Td, Th, Tr, TdSub, MiniBar } from "@/components/leads/ui/table";
import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";
import { BOOKING_LAG_DAYS, type BlendedRate } from "@/lib/leads/execution/blend";
import { SPREADSHEET_DEFAULTS, type Chain } from "@/lib/leads/execution/chain";
import { getActiveSalesGoal } from "@/lib/leads/execution/queries";
import { getExecutionSummary } from "@/lib/leads/execution/summary";
import { getTeamSummary } from "@/lib/leads/team/summary";
import { cn } from "@/lib/utils";

export const metadata = { title: "Objetivo · Gestor de Leads · SmokIA" };

const PERIODS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type Period = keyof typeof PERIODS;

function pct(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")} %`;
}

function money(value: number, currency: string) {
  return `${currency} ${Math.round(value).toLocaleString("es-AR")}`;
}

const CHAIN_ROWS: { key: keyof Chain; label: string }[] = [
  { key: "clients", label: "Clientes necesarios" },
  { key: "salesCalls", label: "Llamadas de venta necesarias" },
  { key: "bookings", label: "Agendamientos necesarios" },
  { key: "contactsPerMonth", label: "Contactos al mes" },
  { key: "contactsPerDay", label: "Contactos por día" },
  { key: "contactsPerWeek", label: "Contactos por semana" },
];

/**
 * Cadena de ejecución (Plan §1.22): del objetivo de facturación a los
 * contactos por día, con las tasas supuestas corrigiéndose solas con lo que
 * pasa de verdad. Ver `lib/leads/execution/`.
 */
export default async function ObjetivoPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const period: Period = periodParam === "7d" || periodParam === "90d" ? periodParam : "30d";

  // Con equipo manda la meta compartida y las tasas se ajustan con los datos de
  // los dos (Plan §1.23); sin equipo, la versión personal de siempre (§1.22).
  const team = await getTeamSummary(PERIODS[period]);
  const summary = team ? team.execution : await getExecutionSummary(PERIODS[period]);

  if (!summary) {
    // La primera vez que el equipo define la meta, se precarga con la meta personal anterior, si había.
    const initial = (team ? await getActiveSalesGoal() : null) ?? SPREADSHEET_DEFAULTS;
    return (
      <>
        <HeaderBar breadcrumb="Gestor de Leads / Objetivo" />
        <div className="px-6 py-8 lg:px-8">
          <PageHeading eyebrow={team ? "OBJETIVO DE EQUIPO" : "CADENA DE EJECUCIÓN"} title="Objetivo" />
          <div className="mt-8">
            <EmptyState
              icon={<Target className="size-5" strokeWidth={1.5} />}
              title={team ? "Todavía no definieron el objetivo del equipo" : "Todavía no definiste un objetivo"}
              description={
                team
                  ? "Cargá cuánto quieren facturar por mes entre los dos y las tasas estimadas: la app calcula cuántos contactos por día necesita el equipo y las corrige con los resultados reales de ambos. Cualquiera de los dos puede definirlo y cambiarlo."
                  : "Cargá cuánto querés facturar por mes y tus tasas estimadas: la app calcula cuántos contactos por día necesitás y las corrige con tus resultados reales."
              }
              action={<EditGoalButton initial={initial} label="Definir objetivo" variant="primary" />}
            />
          </div>
        </div>
      </>
    );
  }

  const { goal, rates, assumedChain, adjustedChain, today, week, month, metrics } = summary;
  const definedBy = team?.members.find((m) => m.member.ownerId === team.goal?.definedBy)?.member.name;
  const dailyTarget = adjustedChain.contactsPerDay;
  const remainingToday = Math.max(0, dailyTarget - today.contacts);
  const monthPace = month.contacts - month.plannedToDate;
  const humanResponseRate = metrics.contacts > 0 ? metrics.human_responses / metrics.contacts : null;
  const bookingBelowAssumed =
    rates.booking.enoughSample && rates.booking.observed !== null && rates.booking.observed < rates.booking.assumed;

  const rateRows: { key: string; label: string; rate: BlendedRate; detail: string }[] = [
    {
      key: "booking",
      label: "% contactos que agendan",
      rate: rates.booking,
      detail: `contactados entre hace ${PERIODS[period] + BOOKING_LAG_DAYS} y ${BOOKING_LAG_DAYS} días`,
    },
    { key: "show", label: "Asistencia a la llamada", rate: rates.show, detail: "turnos ya pasados, realizados vs. no asistió" },
    { key: "close", label: "Tasa de cierre", rate: rates.close, detail: "leads con reunión realizada que cerraron" },
  ];

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Objetivo" />

      <div className="flex flex-col gap-9 px-6 py-8 lg:px-8">
        <PageHeading
          eyebrow={team ? "OBJETIVO DE EQUIPO" : "CADENA DE EJECUCIÓN"}
          title="Objetivo"
          description={`${money(goal.monthlyRevenueTarget, goal.currency)} por mes con un ticket de ${money(goal.avgTicket, goal.currency)}.${
            definedBy ? ` Definido por ${definedBy}.` : ""
          }`}
          action={
            <div className="flex items-center gap-3">
              <Segmented>
                {(Object.keys(PERIODS) as Period[]).map((key) => (
                  <SegmentedLink key={key} href={`/leads/objetivo?period=${key}`} active={key === period}>
                    {key}
                  </SegmentedLink>
                ))}
              </Segmented>
              <EditGoalButton initial={goal} label="Editar objetivo" />
            </div>
          }
        />

        <KpiRow>
          <Kpi
            label="Hoy"
            signal
            value={`${today.contacts} / ${dailyTarget}`}
            delta={remainingToday > 0 ? `faltan ${remainingToday} contactos` : "objetivo del día cumplido"}
            trend={remainingToday > 0 ? "neutral" : "up"}
          />
          <Kpi label="Semana" value={`${week.contacts} / ${week.target}`} />
          <Kpi
            label="Mes"
            value={`${month.contacts} / ${month.target}`}
            delta={
              monthPace >= 0
                ? `al día (+${monthPace} sobre ${month.plannedToDate})`
                : `atrasado ${-monthPace} (a hoy: ${month.plannedToDate})`
            }
            trend={monthPace >= 0 ? "up" : "down"}
          />
          <Kpi label="Clientes del mes" value={`${month.won} / ${adjustedChain.clients}`} muted={month.won === 0} />
          <Kpi
            label="Facturación"
            value={money(month.revenue, goal.currency)}
            muted={month.revenue === 0}
            delta={`de ${money(goal.monthlyRevenueTarget, goal.currency)}${month.revenueEstimated ? " · estimada" : ""}`}
          />
        </KpiRow>

        {team ? (
          <Section
            eyebrow="EQUIPO"
            title="Aporte de cada uno"
            description="Cada uno contra su parte: el objetivo del equipo en partes iguales. El detalle de los leads de cada uno es privado."
          >
            <MemberContribution members={team.members} />
          </Section>
        ) : null}

        <Section
          eyebrow={team ? "CADENA DEL EQUIPO" : "TU CADENA"}
          title="Qué hace falta para llegar"
          description={
            team
              ? "La columna ajustada es la que manda: usa las tasas del equipo corregidas con los resultados reales de los dos."
              : "La columna ajustada es la que manda: usa tus tasas corregidas con los resultados reales."
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Paso</Th>
                <Th align="right">Con tus tasas</Th>
                <Th align="right">Con tasas ajustadas</Th>
              </tr>
            </thead>
            <tbody>
              {CHAIN_ROWS.map((row) => {
                const changed = adjustedChain[row.key] !== assumedChain[row.key];
                const highlight = row.key === "contactsPerDay";
                return (
                  <Tr key={row.key}>
                    <Td className={cn(highlight && "font-semibold")}>{row.label}</Td>
                    <Td numeric className="text-lm-ink-2">
                      {assumedChain[row.key]}
                    </Td>
                    <Td numeric className={cn(highlight && "font-semibold text-lm-signal-text")}>
                      {adjustedChain[row.key]}
                      {changed ? (
                        <span className="ml-2 text-xs text-lm-ink-3">
                          ({adjustedChain[row.key] > assumedChain[row.key] ? "+" : ""}
                          {adjustedChain[row.key] - assumedChain[row.key]})
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Section>

        <Section
          eyebrow="TASAS"
          title="Supuesto contra realidad"
          description={`Últimos ${PERIODS[period]} días. Con pocos datos pesa tu supuesto; a medida que hay volumen, pesa lo que pasa de verdad.`}
        >
          <Table>
            <thead>
              <tr>
                <Th>Tasa</Th>
                <Th align="right">Tu supuesto</Th>
                <Th align="right">Observada</Th>
                <Th align="right">Usada</Th>
                <Th>Peso de los datos</Th>
              </tr>
            </thead>
            <tbody>
              {rateRows.map(({ key, label, rate, detail }) => (
                <Tr key={key}>
                  <Td>
                    {label}
                    <TdSub>{detail}</TdSub>
                  </Td>
                  <Td numeric className="text-lm-ink-2">
                    {pct(rate.assumed)}
                  </Td>
                  <Td numeric className={cn(!rate.enoughSample && "text-lm-ink-3")}>
                    {rate.observed === null ? "sin datos" : pct(rate.observed)}
                    <TdSub>
                      {rate.successes}/{rate.n}
                      {rate.n > 0 && !rate.enoughSample ? " · muestra chica" : ""}
                    </TdSub>
                  </Td>
                  <Td numeric className="font-semibold">
                    {pct(rate.used)}
                  </Td>
                  <Td className="font-mono text-xs text-lm-ink-3 tabular-nums">
                    <MiniBar percent={rate.dataWeight * 100} />
                    {Math.round(rate.dataWeight * 100)} %
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <p className="text-[13px] text-lm-ink-2">
            Respuesta humana de los contactados en el período:{" "}
            <span className="font-mono text-lm-ink tabular-nums">{pct(humanResponseRate)}</span>{" "}
            <span className="text-lm-ink-3">
              ({metrics.human_responses}/{metrics.contacts})
            </span>
            .{" "}
            {bookingBelowAssumed ? (
              <>
                La tasa de agenda viene por debajo de tu supuesto: revisá qué aperturas rinden en{" "}
                <Link href="/leads" className="text-lm-ink underline underline-offset-2 hover:text-lm-signal-text">
                  Experimentación de aperturas
                </Link>
                .
              </>
            ) : (
              <>
                Qué ángulo de apertura rinde mejor, en{" "}
                <Link href="/leads" className="text-lm-ink underline underline-offset-2 hover:text-lm-signal-text">
                  Experimentación de aperturas
                </Link>
                .
              </>
            )}
          </p>
        </Section>

        <Section eyebrow="ESTE MES" title="Contactos por día" description="Primeros contactos y seguimientos enviados cada día, contra tu objetivo diario ajustado.">
          <DailyContactsChart days={month.days} target={dailyTarget} />
        </Section>
      </div>
    </>
  );
}
