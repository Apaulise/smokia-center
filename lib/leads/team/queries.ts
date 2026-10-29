import type { SalesGoal, ExecutionMetrics, DailyContacts } from "@/lib/leads/execution/queries";
import type { ProspectingFunnel } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas del equipo (Plan §1.23). Todo lo de otro miembro pasa por funciones
 * SECURITY DEFINER que sólo devuelven conteos agregados y verifican que el que
 * llama y el miembro comparten equipo (migración 20261014120000). Nada de acá
 * lee filas de leads ajenos, y ninguna query usa la service role.
 */

export interface TeamMember {
  ownerId: string;
  name: string;
  avatarUrl: string | null;
}

/** El equipo del usuario, o `[]` si no pertenece a ninguno (todavía no se sembró). */
export async function getTeamDirectory(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_directory");
  if (error) throw error;
  return (data ?? []).map((row) => ({ ownerId: row.owner_id, name: row.name, avatarUrl: row.avatar_url }));
}

export type TeamAppointment = Database["public"]["Tables"]["appointments"]["Row"] & {
  leads: Pick<Database["public"]["Tables"]["leads"]["Row"], "id" | "name" | "status"> | null;
};

function mapTeamAppointment(row: Database["public"]["Functions"]["team_appointments"]["Returns"][number]): TeamAppointment {
  return {
    id: row.id,
    owner_id: row.owner_id,
    lead_id: row.lead_id,
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    meeting_url: row.meeting_url,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    leads: row.lead_id && row.lead_name && row.lead_status
      ? { id: row.lead_id, name: row.lead_name, status: row.lead_status }
      : null,
  };
}

/** Reuniones del equipo dentro de un rango. La función SQL verifica membresía. */
export async function listTeamAppointmentsInRange(startIso: string, endIso: string): Promise<TeamAppointment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_appointments", {
    p_from: startIso,
    p_to: endIso,
    p_list: false,
    p_limit: 1000,
  });
  if (error) throw error;
  return (data ?? []).map(mapTeamAppointment);
}

/** Misma semántica que la lista personal: futuras más pendientes de resolver. */
export async function listTeamUpcomingAppointments(limit = 500): Promise<TeamAppointment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_appointments", {
    p_list: true,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map(mapTeamAppointment);
}

/** Permite desplegar UI y migración en pasos separados sin romper Mi agenda. */
export async function isTeamAgendaAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.rpc("team_appointments", {
    p_from: now,
    p_to: now,
    p_list: false,
    p_limit: 1,
  });
  return !error;
}

/** La meta compartida: es de `SalesGoal` más quién la definió. */
export interface TeamGoal extends SalesGoal {
  definedBy: string;
}

type TeamGoalRow = Database["public"]["Tables"]["team_goals"]["Row"];

function toTeamGoal(row: TeamGoalRow): TeamGoal {
  return {
    id: row.id,
    currency: row.currency,
    createdAt: row.created_at,
    definedBy: row.owner_id,
    monthlyRevenueTarget: Number(row.monthly_revenue_target),
    avgTicket: Number(row.avg_ticket),
    bookingRate: Number(row.booking_rate),
    showRate: Number(row.show_rate),
    closeRate: Number(row.close_rate),
    workingDaysPerMonth: row.working_days_per_month,
    workingDaysPerWeek: row.working_days_per_week,
  };
}

/** La meta activa del equipo (una sola, por índice único parcial), o `null` si todavía no se definió. RLS limita a tu equipo. */
export async function getTeamGoal(): Promise<TeamGoal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_goals").select("*").eq("status", "ACTIVA").maybeSingle();
  if (error) throw error;
  return data ? toTeamGoal(data) : null;
}

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

/** Igual que `getExecutionMetrics`, pero de un miembro del equipo (puede ser uno mismo). */
export async function getTeamExecutionMetrics(
  ownerId: string,
  fromIso: string,
  toIso: string,
  bookingLagDays: number,
): Promise<ExecutionMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("team_execution_metrics", { p_owner: ownerId, p_from: fromIso, p_to: toIso, p_booking_lag_days: bookingLagDays })
    .maybeSingle();
  if (error) throw error;
  return data ?? EMPTY_METRICS;
}

/** Igual que `getDailyContacts`: primeros contactos + seguimientos por día, de un miembro del equipo. */
export async function getTeamDailyContacts(ownerId: string, fromDate: string, toDate: string): Promise<DailyContacts[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_daily_contacts", { p_owner: ownerId, p_from: fromDate, p_to: toDate });
  if (error) throw error;
  return (data ?? []).map((d) => ({ day: d.day, contacts: d.first_contacts + d.followups, followups: d.followups }));
}

const EMPTY_FUNNEL: ProspectingFunnel = {
  total_leads: 0,
  contacts_sent: 0,
  human_responses: 0,
  qualified: 0,
  interested: 0,
  meetings: 0,
  won: 0,
  total_responses: 0,
};

/** Igual que `getProspectingFunnel`, de un miembro del equipo. */
export async function getTeamFunnel(ownerId: string): Promise<ProspectingFunnel> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_prospecting_funnel", { p_owner: ownerId }).maybeSingle();
  if (error) throw error;
  return data ?? EMPTY_FUNNEL;
}

/** El id del equipo del usuario, o `null` si no pertenece a ninguno. RLS de `team_members` sólo deja ver la propia fila. */
export async function getMyTeamId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_members").select("team_id").maybeSingle();
  if (error) throw error;
  return data?.team_id ?? null;
}
