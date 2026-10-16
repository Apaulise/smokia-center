import type { DailyContacts, ExecutionMetrics } from "@/lib/leads/execution/queries";
import type { ProspectingFunnel } from "@/lib/leads/queries";

/**
 * Sumas del equipo (Plan §1.23). Todos los campos de las métricas y del embudo
 * son conteos aditivos entre personas, así que el total del equipo es la suma
 * de los miembros; las tasas se calculan DESPUÉS, sobre el total (una tasa
 * agrupada pesa a cada persona por su volumen, no la promedia).
 */

function sumBy<T extends object>(rows: T[], empty: T): T {
  const total = { ...empty } as Record<string, number>;
  for (const key of Object.keys(empty)) {
    total[key] = rows.reduce((sum, row) => sum + Number((row as Record<string, number>)[key] ?? 0), 0);
  }
  return total as T;
}

const ZERO_METRICS: ExecutionMetrics = {
  contacts: 0,
  human_responses: 0,
  booking_cohort: 0,
  booked: 0,
  meetings_held: 0,
  meetings_no_show: 0,
  held_leads: 0,
  won_from_held: 0,
  won_in_window: 0,
};

const ZERO_FUNNEL: ProspectingFunnel = {
  total_leads: 0,
  contacts_sent: 0,
  human_responses: 0,
  qualified: 0,
  interested: 0,
  meetings: 0,
  won: 0,
  total_responses: 0,
};

export function sumMetrics(rows: ExecutionMetrics[]): ExecutionMetrics {
  return sumBy(rows, ZERO_METRICS);
}

export function sumFunnels(rows: ProspectingFunnel[]): ProspectingFunnel {
  return sumBy(rows, ZERO_FUNNEL);
}

/** Une varias series diarias (los mismos días en cada una) sumando día por día. */
export function mergeSeries(series: DailyContacts[][]): DailyContacts[] {
  const byDay = new Map<string, DailyContacts>();
  for (const days of series) {
    for (const d of days) {
      const acc = byDay.get(d.day) ?? { day: d.day, contacts: 0, followups: 0 };
      acc.contacts += d.contacts;
      acc.followups += d.followups;
      byDay.set(d.day, acc);
    }
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
