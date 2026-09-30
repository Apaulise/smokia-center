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
  contacts: number;
}

/** Primeros contactos por día calendario de Argentina, de `fromDate` a `toDate` inclusive ("YYYY-MM-DD"). */
export async function getDailyContacts(fromDate: string, toDate: string): Promise<DailyContacts[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_daily_contacts", { p_from: fromDate, p_to: toDate });
  if (error) throw error;
  return data ?? [];
}
