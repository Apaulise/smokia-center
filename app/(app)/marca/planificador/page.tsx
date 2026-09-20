import { PlannerView } from "@/components/brand/planner/planner-view";
import { WeekSummaryCard } from "@/components/brand/planner/week-summary";
import { PeriodNav, ViewToggle, type CalendarView } from "@/components/shell/calendar-nav";
import { PageHeader } from "@/components/shell/page-header";
import { getLinkablePosts } from "@/lib/brand/goals/queries";
import { getPlannerItemsInRange, getItemChoices, getUnscheduledItems } from "@/lib/brand/planner/queries";
import { summarizeWeek } from "@/lib/brand/planner/week";
import { getBrandPostClassifications } from "@/lib/brand/queries";
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
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Planificador · Awareness AI" };

// Publicar es una Server Action de esta página, y Instagram procesa el video
// antes de contestar: el maxDuration de la página es el de la publicación.
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const BASE_PATH = "/marca/planificador";
const VIEWS: CalendarView[] = ["mes", "semana"];

type SearchParams = { view?: string; date?: string };

/** /marca/planificador (Plans/03 §3.7): el pipeline de contenido sobre un calendario, con publicación. */
export default async function PlanificadorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view: CalendarView = params.view === "semana" ? "semana" : "mes";
  const today = todayIso();
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const isWeek = view === "semana";
  const monthStart = startOfMonthIso(anchor);
  const weekStart = startOfWeekIso(anchor);
  const days = isWeek ? weekDays(weekStart) : monthGridDays(monthStart);

  const user = await requireUser();
  const supabase = await createClient();

  const [items, unscheduled, choices, classifications, account, linkablePosts] = await Promise.all([
    getPlannerItemsInRange(PLATFORM, isoDateToUtcInstant(days[0]), isoDateToUtcInstant(addDaysIso(days[days.length - 1], 1))),
    getUnscheduledItems(PLATFORM),
    getItemChoices(PLATFORM),
    getBrandPostClassifications(PLATFORM),
    supabase.from("brand_accounts").select("username").eq("platform", PLATFORM).limit(1).maybeSingle(),
    getLinkablePosts(PLATFORM),
  ]);

  // La semana que se resume: la que se está mirando, o en la vista de mes la de hoy (si está en la grilla)
  // o la primera del mes. Todas caen dentro de los días ya cargados, así que no hace falta otra consulta.
  const summaryDays = isWeek ? days : days.includes(today) ? weekDays(today) : weekDays(monthStart);
  const summary = summarizeWeek(items, summaryDays);
  const hasWinners = Object.values(classifications).some((result) => result.classification.startsWith("GANADOR"));

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Planificador"
        description={isWeek ? weekLabel(days) : monthLabel(monthStart)}
        action={
          <div className="flex items-center gap-2">
            <PeriodNav
              basePath={BASE_PATH}
              view={view}
              prev={isWeek ? addDaysIso(weekStart, -7) : addMonthsIso(monthStart, -1)}
              next={isWeek ? addDaysIso(weekStart, 7) : addMonthsIso(monthStart, 1)}
              today={today}
            />
            <ViewToggle basePath={BASE_PATH} view={view} date={anchor} views={VIEWS} />
          </div>
        }
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <WeekSummaryCard summary={summary} weekLabel={weekLabel(summaryDays)} hasWinners={hasWinners} />

        <PlannerView
          platform={PLATFORM}
          ownerId={user.id}
          accountUsername={account.data?.username ?? null}
          mode={view === "semana" ? "semana" : "mes"}
          days={days}
          currentMonth={isWeek ? undefined : monthStart.slice(0, 7)}
          today={today}
          items={items}
          unscheduled={unscheduled}
          choices={choices}
          linkablePosts={linkablePosts}
        />
      </div>
    </>
  );
}
