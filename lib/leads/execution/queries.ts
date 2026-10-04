import { isoDateOf, isoDateToUtcInstant, addDaysIso } from "@/lib/leads/calendar";
import type { ChainInputs } from "@/lib/leads/execution/chain";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export interface SalesGoal extends ChainInputs {
  id: string;
  currency: string;
  createdAt: string;
}

type SalesGoalRow = Database["public"]["Tables"]["sales_goals"]["Row"];

function toSalesGoal(row: SalesGoalRow): SalesGoal {
  return {
    id: row.id,
    currency: row.currency,
    createdAt: row.created_at,
    monthlyRevenueTarget: Number(row.monthly_revenue_target),
    avgTicket: Number(row.avg_ticket),
    bookingRate: Number(row.booking_rate),
    showRate: Number(row.show_rate),
    closeRate: Number(row.close_rate),
    workingDaysPerMonth: row.working_days_per_month,
    workingDaysPerWeek: row.working_days_per_week,
  };
}

/** El objetivo activo (hay uno solo por usuario, lo garantiza un índice único parcial), o `null` si todavía no se definió. */
export async function getActiveSalesGoal(): Promise<SalesGoal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales_goals").select("*").eq("status", "ACTIVA").maybeSingle();
  if (error) throw error;
  return data ? toSalesGoal(data) : null;
}

export type ExecutionMetrics = Database["public"]["Functions"]["leads_execution_metrics"]["Returns"][number];

const EMPTY_METRICS: ExecutionMetrics = {
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

/** Numeradores y denominadores de las tres tasas de la cadena, en `[fromIso, toIso)`. Ver la migración `20260930130000`. */
export async function getExecutionMetrics(fromIso: string, toIso: string, bookingLagDays: number): Promise<ExecutionMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("leads_execution_metrics", { p_from: fromIso, p_to: toIso, p_booking_lag_days: bookingLagDays })
    .maybeSingle();
  if (error) throw error;
  return data ?? EMPTY_METRICS;
}

export interface DailyContacts {
  day: string;
  /** Total del día para el objetivo: primeros contactos + seguimientos enviados. */
  contacts: number;
  /** De ese total, cuántos fueron seguimientos a leads que no respondieron (o que se retomaron). */
  followups: number;
}

/**
 * Contactos por día calendario de Argentina, de `fromDate` a `toDate` inclusive ("YYYY-MM-DD").
 * Cuentan los primeros contactos y también los seguimientos confirmados: retomar
 * una conversación frenada es trabajo comercial del día igual que abrir una nueva.
 * Las tasas de la cadena (`getExecutionMetrics`) siguen midiendo sólo primeros contactos.
 */
export async function getDailyContacts(fromDate: string, toDate: string): Promise<DailyContacts[]> {
  const supabase = await createClient();
  const [first, followUps] = await Promise.all([
    supabase.rpc("leads_daily_contacts", { p_from: fromDate, p_to: toDate }),
    supabase
      .from("lead_messages")
      .select("occurred_at")
      .eq("sender", "VENDEDOR")
      .eq("kind", "SEGUIMIENTO")
      .eq("confirmed", true)
      .gte("occurred_at", isoDateToUtcInstant(fromDate))
      .lt("occurred_at", isoDateToUtcInstant(addDaysIso(toDate, 1))),
  ]);
  if (first.error) throw first.error;
  if (followUps.error) throw followUps.error;

  const followupsByDay = new Map<string, number>();
  for (const row of followUps.data ?? []) {
    const day = isoDateOf(row.occurred_at);
    followupsByDay.set(day, (followupsByDay.get(day) ?? 0) + 1);
  }

  return (first.data ?? []).map((d) => {
    const followups = followupsByDay.get(d.day) ?? 0;
    return { day: d.day, contacts: d.contacts + followups, followups };
  });
}
