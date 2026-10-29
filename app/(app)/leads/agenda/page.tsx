import { AgendaView } from "@/components/leads/agenda/agenda-view";
import { AgendaScopeToggle, type AgendaScope } from "@/components/leads/agenda/agenda-scope-toggle";
import { NextAppointmentPanel } from "@/components/leads/agenda/next-appointment-panel";
import {
  PeriodNav as SharedPeriodNav,
  ViewToggle as SharedViewToggle,
  type CalendarView,
} from "@/components/shell/calendar-nav";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
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
import {
  getNextAppointmentBriefing,
  listAppointmentsInRange,
  listLeadsLite,
  listUpcomingAppointmentsList,
} from "@/lib/leads/queries";
import { getTeamDirectory, isTeamAgendaAvailable, listTeamAppointmentsInRange, listTeamUpcomingAppointments } from "@/lib/leads/team/queries";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Agenda · SmokIA" };

type View = CalendarView;

const BASE_PATH = "/leads/agenda";

type SearchParams = { view?: string; date?: string; scope?: string };

/** /leads/agenda (Plan §1.5, Design System §05 "Agenda"): calendario propio, sin dependencia de Google Calendar. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view: View = params.view === "semana" ? "semana" : params.view === "lista" ? "lista" : "mes";
  const today = todayIso();
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const user = await getCurrentUser();
  if (!user) return null;

  const [leads, briefing, members, teamAgendaAvailable] = await Promise.all([
    listLeadsLite(),
    getNextAppointmentBriefing(),
    getTeamDirectory(),
    isTeamAgendaAvailable(),
  ]);
  const hasTeam = members.length > 1;
  const scope: AgendaScope = params.scope === "team" && hasTeam && teamAgendaAvailable ? "team" : "mine";
  const scopeToggle = <AgendaScopeToggle scope={scope} view={view} date={anchor} hasTeam={hasTeam} teamAvailable={teamAgendaAvailable} />;

  if (view === "lista") {
    const appointments = scope === "team" ? await listTeamUpcomingAppointments() : await listUpcomingAppointmentsList();
    return (
      <>
        <HeaderBar breadcrumb="Gestor de Leads / Agenda" />
        <div className="flex">
          <div className="flex-1 px-6 py-8 lg:px-8">
            <PageHeading
              title="Agenda"
              description={scope === "team" ? "Próximos turnos de todo el equipo." : "Tus próximos turnos, sin salir de la app."}
              action={<div className="flex flex-wrap items-center gap-2">{scopeToggle}<ViewToggle view={view} date={anchor} scope={scope} /></div>}
            />
            <div className="mt-8">
              <AgendaView view={view} days={[]} today={today} appointments={appointments} leads={leads} scope={scope} members={members} currentUserId={user.id} />
            </div>
          </div>
          {scope === "mine" ? <NextAppointmentPanel briefing={briefing} /> : null}
        </div>
      </>
    );
  }

  if (view === "semana") {
    const weekStart = startOfWeekIso(anchor);
    const days = weekDays(weekStart);
    const rangeStart = isoDateToUtcInstant(days[0]);
    const rangeEnd = isoDateToUtcInstant(addDaysIso(days[6], 1));
    const appointments = scope === "team"
      ? await listTeamAppointmentsInRange(rangeStart, rangeEnd)
      : await listAppointmentsInRange(rangeStart, rangeEnd);

    return (
      <>
        <HeaderBar breadcrumb="Gestor de Leads / Agenda" />
        <div className="flex">
          <div className="flex-1 px-6 py-8 lg:px-8">
            <PageHeading
              title={weekLabel(days)}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {scopeToggle}
                  <PeriodNav view={view} prev={addDaysIso(weekStart, -7)} next={addDaysIso(weekStart, 7)} today={today} scope={scope} />
                  <ViewToggle view={view} date={anchor} scope={scope} />
                </div>
              }
            />
            <div className="mt-8">
              <AgendaView view={view} days={days} today={today} appointments={appointments} leads={leads} scope={scope} members={members} currentUserId={user.id} />
            </div>
          </div>
          {scope === "mine" ? <NextAppointmentPanel briefing={briefing} /> : null}
        </div>
      </>
    );
  }

  const monthStart = startOfMonthIso(anchor);
  const days = monthGridDays(monthStart);
  const rangeStart = isoDateToUtcInstant(days[0]);
  const rangeEnd = isoDateToUtcInstant(addDaysIso(days[days.length - 1], 1));
  const appointments = scope === "team"
    ? await listTeamAppointmentsInRange(rangeStart, rangeEnd)
    : await listAppointmentsInRange(rangeStart, rangeEnd);

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Agenda" />
      <div className="flex">
        <div className="flex-1 px-6 py-8 lg:px-8">
          <PageHeading
            title={monthLabel(monthStart)}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {scopeToggle}
                <PeriodNav view={view} prev={addMonthsIso(monthStart, -1)} next={addMonthsIso(monthStart, 1)} today={today} scope={scope} />
                <ViewToggle view={view} date={anchor} scope={scope} />
              </div>
            }
          />
          <div className="mt-8">
            <AgendaView
              view={view}
              days={days}
              currentMonth={monthStart.slice(0, 7)}
              today={today}
              appointments={appointments}
              leads={leads}
              scope={scope}
              members={members}
              currentUserId={user.id}
            />
          </div>
        </div>
        {scope === "mine" ? <NextAppointmentPanel briefing={briefing} /> : null}
      </div>
    </>
  );
}

function PeriodNav({ scope, ...props }: { view: View; prev: string; next: string; today: string; scope: AgendaScope }) {
  return <SharedPeriodNav basePath={BASE_PATH} variant="signal" extraParams={{ scope: scope === "team" ? "team" : undefined }} {...props} />;
}

function ViewToggle({ scope, ...props }: { view: View; date: string; scope: AgendaScope }) {
  return <SharedViewToggle basePath={BASE_PATH} variant="signal" extraParams={{ scope: scope === "team" ? "team" : undefined }} {...props} />;
}
