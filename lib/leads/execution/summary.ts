import { addDaysIso, isoDateToUtcInstant, startOfMonthIso, startOfWeekIso, todayIso } from "@/lib/leads/calendar";
import { BOOKING_LAG_DAYS } from "@/lib/leads/execution/blend";
import { deriveExecution, type ExecutionSummary } from "@/lib/leads/execution/derive";
import { getActiveSalesGoal, getDailyContacts, getExecutionMetrics } from "@/lib/leads/execution/queries";

export type { ExecutionSummary } from "@/lib/leads/execution/derive";

/**
 * Todo lo que necesita la cadena de ejecución (Plan §1.22) en un solo lugar,
 * para que `/leads/objetivo` y el tile del dashboard no calculen distinto.
 * `null` si todavía no hay objetivo definido.
 *
 * Es la versión PERSONAL (la meta de `sales_goals` y sólo tus datos). Con un
 * equipo sembrado manda `getTeamSummary` (Plan §1.23); esta queda de respaldo
 * para cuando el usuario no pertenece a ninguno.
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

  return deriveExecution({ goal, windowDays, metrics, monthMetrics, series, today });
}
