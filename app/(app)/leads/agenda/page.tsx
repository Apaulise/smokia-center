import { AgendaView } from "@/components/leads/agenda/agenda-view";
import {
  PeriodNav as SharedPeriodNav,
  ViewToggle as SharedViewToggle,
  type CalendarView,
} from "@/components/shell/calendar-nav";
import { PageHeader } from "@/components/shell/page-header";
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

type View = CalendarView;

const BASE_PATH = "/leads/agenda";

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

function PeriodNav(props: { view: View; prev: string; next: string; today: string }) {
  return <SharedPeriodNav basePath={BASE_PATH} {...props} />;
}

function ViewToggle(props: { view: View; date: string }) {
  return <SharedViewToggle basePath={BASE_PATH} {...props} />;
}
