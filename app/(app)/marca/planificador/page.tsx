import { PlannerView } from "@/components/brand/planner/planner-view";
import { WeekSummaryStrip } from "@/components/brand/planner/week-summary";
import { Crumbs } from "@/components/brand/ui/card";
import { HeaderBar } from "@/components/leads/ui/page-header";
import { PeriodNav, ViewToggle, type CalendarView } from "@/components/shell/calendar-nav";
import { getLinkablePosts } from "@/lib/brand/goals/queries";
import { getImportAnalysisCounts, getPlannerItemsInRange, getItemChoices, getUnscheduledItems } from "@/lib/brand/planner/queries";
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

export const metadata = { title: "Planificador · SmokIA" };

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

  const [items, unscheduled, choices, classifications, account, linkablePosts, importCounts] = await Promise.all([
    getPlannerItemsInRange(PLATFORM, isoDateToUtcInstant(days[0]), isoDateToUtcInstant(addDaysIso(days[days.length - 1], 1))),
    getUnscheduledItems(PLATFORM),
    getItemChoices(PLATFORM),
    getBrandPostClassifications(PLATFORM),
    supabase.from("brand_accounts").select("username").eq("platform", PLATFORM).limit(1).maybeSingle(),
    getLinkablePosts(PLATFORM),
    getImportAnalysisCounts(PLATFORM),
  ]);

  // La semana que se resume: la que se está mirando, o en la vista de mes la de hoy (si está en la grilla)
  // o la primera del mes. Todas caen dentro de los días ya cargados, así que no hace falta otra consulta.
  const summaryDays = isWeek ? days : days.includes(today) ? weekDays(today) : weekDays(monthStart);
  const summary = summarizeWeek(items, summaryDays);
  const hasWinners = Object.values(classifications).some((result) => result.classification.startsWith("GANADOR"));

  const planned = items.filter((item) => item.status !== "PUBLICADO").length;
  const eyebrow = `${items.length} ${items.length === 1 ? "PIEZA" : "PIEZAS"} · ${planned} ${planned === 1 ? "PLANIFICADA" : "PLANIFICADAS"}`;

  return (
    <>
      <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Planificador" }]} />} />

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
        importCounts={importCounts}
        title={isWeek ? weekLabel(days) : monthLabel(monthStart)}
        eyebrow={eyebrow}
        nav={
          <PeriodNav
            variant="signal"
            basePath={BASE_PATH}
            view={view}
            prev={isWeek ? addDaysIso(weekStart, -7) : addMonthsIso(monthStart, -1)}
            next={isWeek ? addDaysIso(weekStart, 7) : addMonthsIso(monthStart, 1)}
            today={today}
          />
        }
        toggle={<ViewToggle variant="signal" basePath={BASE_PATH} view={view} date={anchor} views={VIEWS} />}
        strip={<WeekSummaryStrip summary={summary} weekLabel={weekLabel(summaryDays)} hasWinners={hasWinners} />}
      />
    </>
  );
}
