import { ChevronLeft, ChevronRight, List, LayoutGrid, Rows3 } from "lucide-react";
import Link from "next/link";

import { AgendaView } from "@/components/leads/agenda/agenda-view";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import {
  addDaysIso,
  addMonthsIso,
  isoDateToUtcInstant,
  monthGridDays,
  monthLabel,
  startOfMonthIso,
  startOfWeekIso,
  todayIso,
  weekDays,
  weekLabel,
} from "@/lib/leads/calendar";
import { listAppointmentsInRange, listLeadsLite, listUpcomingAppointmentsList } from "@/lib/leads/queries";

export const metadata = { title: "Agenda · Awareness AI" };

type View = "mes" | "semana" | "lista";

type SearchParams = { view?: string; date?: string };

/** /leads/agenda (Plan §1.5): calendario propio, sin dependencia de Google Calendar. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view: View = params.view === "semana" ? "semana" : params.view === "lista" ? "lista" : "mes";
  const today = todayIso();
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const [leads] = await Promise.all([listLeadsLite()]);

  if (view === "lista") {
    const appointments = await listUpcomingAppointmentsList();
    return (
      <>
        <PageHeader
          eyebrow="Gestor de Leads"
          title="Agenda"
          description="Próximos turnos, sin salir de la app."
          action={<ViewToggle view={view} date={anchor} />}
        />
        <div className="px-6 py-8 lg:px-10">
          <AgendaView view={view} days={[]} today={today} appointments={appointments} leads={leads} />
        </div>
      </>
    );
  }

  if (view === "semana") {
    const weekStart = startOfWeekIso(anchor);
    const days = weekDays(weekStart);
    const rangeStart = isoDateToUtcInstant(days[0]);
    const rangeEnd = isoDateToUtcInstant(addDaysIso(days[6], 1));
    const appointments = await listAppointmentsInRange(rangeStart, rangeEnd);

    return (
      <>
        <PageHeader
          eyebrow="Gestor de Leads"
          title="Agenda"
          description={weekLabel(days)}
          action={
            <div className="flex items-center gap-2">
              <PeriodNav view={view} prev={addDaysIso(weekStart, -7)} next={addDaysIso(weekStart, 7)} today={today} />
              <ViewToggle view={view} date={anchor} />
            </div>
          }
        />
        <div className="px-6 py-8 lg:px-10">
          <AgendaView view={view} days={days} today={today} appointments={appointments} leads={leads} />
        </div>
      </>
    );
  }

  const monthStart = startOfMonthIso(anchor);
  const days = monthGridDays(monthStart);
  const rangeStart = isoDateToUtcInstant(days[0]);
  const rangeEnd = isoDateToUtcInstant(addDaysIso(days[days.length - 1], 1));
  const appointments = await listAppointmentsInRange(rangeStart, rangeEnd);

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title="Agenda"
        description={monthLabel(monthStart)}
        action={
          <div className="flex items-center gap-2">
            <PeriodNav
              view={view}
              prev={addMonthsIso(monthStart, -1)}
              next={addMonthsIso(monthStart, 1)}
              today={today}
            />
            <ViewToggle view={view} date={anchor} />
          </div>
        }
      />
      <div className="px-6 py-8 lg:px-10">
        <AgendaView
          view={view}
          days={days}
          currentMonth={monthStart.slice(0, 7)}
          today={today}
          appointments={appointments}
          leads={leads}
        />
      </div>
    </>
  );
}

function PeriodNav({ view, prev, next, today }: { view: View; prev: string; next: string; today: string }) {
  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      <Link
        href={`/leads/agenda?view=${view}&date=${prev}`}
        aria-label="Período anterior"
        className="flex size-8 items-center justify-center rounded-[10px] hover:bg-surface/60 hover:text-cyan"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <Link
        href={`/leads/agenda?view=${view}&date=${today}`}
        className="rounded-[10px] px-2.5 py-1 text-xs text-muted hover:bg-surface/60 hover:text-ink"
      >
        Hoy
      </Link>
      <Link
        href={`/leads/agenda?view=${view}&date=${next}`}
        aria-label="Período siguiente"
        className="flex size-8 items-center justify-center rounded-[10px] hover:bg-surface/60 hover:text-cyan"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function ViewToggle({ view, date }: { view: View; date: string }) {
  const options: Array<{ value: View; label: string; icon: typeof LayoutGrid }> = [
    { value: "mes", label: "Mes", icon: LayoutGrid },
    { value: "semana", label: "Semana", icon: Rows3 },
    { value: "lista", label: "Lista", icon: List },
  ];

  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <ButtonLink
          key={value}
          href={`/leads/agenda?view=${value}&date=${date}`}
          variant={view === value ? "secondary" : "ghost"}
          size="sm"
        >
          <Icon className="size-3.5" />
          {label}
        </ButtonLink>
      ))}
    </div>
  );
}
