import { addDaysIso, isoDateToUtcInstant, startOfMonthIso, startOfWeekIso, todayIso } from "@/lib/leads/calendar";
import { BOOKING_LAG_DAYS, blendRate, type BlendedRate } from "@/lib/leads/execution/blend";
import { buildChain, workingDaysElapsed, type Chain } from "@/lib/leads/execution/chain";
import {
  getActiveSalesGoal,
  getDailyContacts,
  getExecutionMetrics,
  type DailyContacts,
  type ExecutionMetrics,
  type SalesGoal,
} from "@/lib/leads/execution/queries";
import { manualTicketRevenue } from "@/lib/leads/goals";

export interface ExecutionSummary {
  goal: SalesGoal;
  windowDays: number;
  metrics: ExecutionMetrics;
  rates: { booking: BlendedRate; show: BlendedRate; close: BlendedRate };
  /** La cadena con las tasas que cargó el usuario, tal cual la planilla. */
  assumedChain: Chain;
  /** La que manda: con las tasas mezcladas con lo observado en la ventana. */
  adjustedChain: Chain;
  today: { date: string; contacts: number };
  week: { contacts: number; target: number };
  month: {
    days: DailyContacts[];
    contacts: number;
    /** Lo que "tendrías que llevar" a hoy, según los días hábiles transcurridos. */
    plannedToDate: number;
    target: number;
    won: number;
    revenue: number;
    revenueEstimated: boolean;
  };
}

/**
 * Todo lo que necesita la cadena de ejecución (Plan §1.22) en un solo lugar,
 * para que `/leads/objetivo` y el tile del dashboard no calculen distinto.
 * `null` si todavía no hay objetivo definido.
 */
export async function getExecutionSummary(windowDays: number): Promise<ExecutionSummary | null> {
  const goal = await getActiveSalesGoal();
  if (!goal) return null;

  const today = todayIso();
  const monthStart = startOfMonthIso(today);
  const weekStart = startOfWeekIso(today);
  const seriesStart = weekStart < monthStart ? weekStart : monthStart;
  const now = new Date();

  const [metrics, monthMetrics, series] = await Promise.all([
    getExecutionMetrics(new Date(now.getTime() - windowDays * 86_400_000).toISOString(), now.toISOString(), BOOKING_LAG_DAYS),
    getExecutionMetrics(isoDateToUtcInstant(monthStart), isoDateToUtcInstant(addDaysIso(today, 1)), BOOKING_LAG_DAYS),
    getDailyContacts(seriesStart, today),
  ]);

  const rates = {
    booking: blendRate("booking", goal.bookingRate, metrics.booked, metrics.booking_cohort),
    show: blendRate("show", goal.showRate, metrics.meetings_held, metrics.meetings_held + metrics.meetings_no_show),
    close: blendRate("close", goal.closeRate, metrics.won_from_held, metrics.held_leads),
  };

  const assumedChain = buildChain(goal);
  const adjustedChain = buildChain({
    ...goal,
    bookingRate: rates.booking.used,
    showRate: rates.show.used,
    closeRate: rates.close.used,
  });

  const monthDays = series.filter((d) => d.day >= monthStart);
  const monthContacts = monthDays.reduce((sum, d) => sum + d.contacts, 0);
  const weekContacts = series.filter((d) => d.day >= weekStart).reduce((sum, d) => sum + d.contacts, 0);
  const elapsed = Math.min(workingDaysElapsed(monthStart, today, goal.workingDaysPerWeek), goal.workingDaysPerMonth);

  return {
    goal,
    windowDays,
    metrics,
    rates,
    assumedChain,
    adjustedChain,
    today: { date: today, contacts: series.find((d) => d.day === today)?.contacts ?? 0 },
    week: { contacts: weekContacts, target: adjustedChain.contactsPerWeek },
    month: {
      days: monthDays,
      contacts: monthContacts,
      plannedToDate: adjustedChain.contactsPerDay * elapsed,
      target: adjustedChain.contactsPerMonth,
      won: monthMetrics.won_in_window,
      revenue: manualTicketRevenue.monthRevenue({ wonThisMonth: monthMetrics.won_in_window, avgTicket: goal.avgTicket }),
      revenueEstimated: manualTicketRevenue.estimated,
    },
  };
}
