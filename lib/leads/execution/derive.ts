import { startOfMonthIso, startOfWeekIso } from "@/lib/leads/calendar";
import { blendRate, type BlendedRate } from "@/lib/leads/execution/blend";
import { buildChain, workingDaysElapsed, type Chain } from "@/lib/leads/execution/chain";
import type { DailyContacts, ExecutionMetrics, SalesGoal } from "@/lib/leads/execution/queries";
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

/** Los contactos de hoy, de la semana y del mes sacados de una serie diaria (que arranca como mínimo al inicio de la semana o del mes). */
export function sliceContacts(series: DailyContacts[], today: string) {
  const monthStart = startOfMonthIso(today);
  const weekStart = startOfWeekIso(today);
  const monthDays = series.filter((d) => d.day >= monthStart);
  return {
    today: series.find((d) => d.day === today)?.contacts ?? 0,
    week: series.filter((d) => d.day >= weekStart).reduce((sum, d) => sum + d.contacts, 0),
    month: monthDays.reduce((sum, d) => sum + d.contacts, 0),
    monthDays,
  };
}

/**
 * La aritmética de la cadena de ejecución (Plan §1.22), sin tocar la base: la
 * comparten el resumen personal y el de equipo (Plan §1.23) para que ninguna
 * pantalla calcule distinto. `metrics` es la ventana elegida (las tasas),
 * `monthMetrics` el mes corrido (los ganados) y `series` los contactos por día.
 */
export function deriveExecution(args: {
  goal: SalesGoal;
  windowDays: number;
  metrics: ExecutionMetrics;
  monthMetrics: ExecutionMetrics;
  series: DailyContacts[];
  today: string;
}): ExecutionSummary {
  const { goal, windowDays, metrics, monthMetrics, series, today } = args;
  const monthStart = startOfMonthIso(today);

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

  const contacts = sliceContacts(series, today);
  const elapsed = Math.min(workingDaysElapsed(monthStart, today, goal.workingDaysPerWeek), goal.workingDaysPerMonth);

  return {
    goal,
    windowDays,
    metrics,
    rates,
    assumedChain,
    adjustedChain,
    today: { date: today, contacts: contacts.today },
    week: { contacts: contacts.week, target: adjustedChain.contactsPerWeek },
    month: {
      days: contacts.monthDays,
      contacts: contacts.month,
      plannedToDate: adjustedChain.contactsPerDay * elapsed,
      target: adjustedChain.contactsPerMonth,
      won: monthMetrics.won_in_window,
      revenue: manualTicketRevenue.monthRevenue({ wonThisMonth: monthMetrics.won_in_window, avgTicket: goal.avgTicket }),
      revenueEstimated: manualTicketRevenue.estimated,
    },
  };
}
