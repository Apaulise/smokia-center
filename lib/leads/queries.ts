import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

const PAGE_SIZE = 25;

/** Fila de `leads` con el rubro y la lista de origen ya resueltos por el join de `SELECT_LEAD_ROW`. */
export type LeadWithRelations = Database["public"]["Tables"]["leads"]["Row"] & {
  industries: Pick<Database["public"]["Tables"]["industries"]["Row"], "id" | "name" | "color"> | null;
  lead_lists: Pick<Database["public"]["Tables"]["lead_lists"]["Row"], "id" | "name" | "source"> | null;
};

export interface LeadsFilter {
  industryId?: string;
  status?: LeadStatus;
  leadListId?: string;
  city?: string;
  q?: string;
}

export type LeadsSortField = "created_at" | "name" | "status" | "last_contacted_at" | "next_action_at";

const SELECT_LEAD_ROW = "*, industries(id, name, color), lead_lists(id, name, source)";

function applyLeadFilters<T>(query: T, filters: LeadsFilter) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.industryId) q = q.eq("industry_id", filters.industryId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.leadListId) q = q.eq("lead_list_id", filters.leadListId);
  if (filters.city) q = q.eq("city", filters.city);
  if (filters.q?.trim()) {
    const term = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,address.ilike.%${term}%`);
  }
  return q;
}

/**
 * Lista paginada de leads con los filtros combinables de `/leads/lista`
 * (Plan §1.3). Paginación del lado del servidor con `.range()`, como pide
 * el plan — nada de traer todo y cortar en el cliente.
 */
export async function listLeads(
  filters: LeadsFilter,
  page: number,
  sort: LeadsSortField = "created_at",
  ascending = false,
) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const query = applyLeadFilters(
    supabase.from("leads").select(SELECT_LEAD_ROW, { count: "exact" }),
    filters,
  ).order(sort, { ascending }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { leads: (data ?? []) as LeadWithRelations[], count: count ?? 0, pageSize: PAGE_SIZE };
}

const KANBAN_LIMIT = 500;

/**
 * Todos los leads que matchean los filtros, sin paginar (con un tope): la
 * vista Kanban necesita las ocho columnas completas, no una página a la vez.
 */
export async function listLeadsForKanban(filters: LeadsFilter) {
  const supabase = await createClient();
  const { data, error } = await applyLeadFilters(
    supabase.from("leads").select(SELECT_LEAD_ROW),
    filters,
  )
    .order("created_at", { ascending: false })
    .limit(KANBAN_LIMIT);
  if (error) throw error;
  return (data ?? []) as LeadWithRelations[];
}

export async function getLead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(SELECT_LEAD_ROW)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as LeadWithRelations | null;
}

export async function listLeadActivities(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listUpcomingAppointmentsForLead(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("lead_id", leadId)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Listas de origen del usuario, para el filtro "lista de origen" de /leads/lista. */
export async function listLeadListsLite() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_lists")
    .select("id, name, source")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Ciudades distintas entre los leads del usuario, para el filtro "ciudad". */
export async function listLeadCities() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("city")
    .not("city", "is", null)
    .order("city");
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.city).filter((city): city is string => Boolean(city)))];
}

/** No hace falta filtrar por owner_id: RLS ya garantiza que sólo vuelven las filas del usuario (CLAUDE.md §4). */
export async function getScrapeJob(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("*, lead_lists(name, source)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecentJobs(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scrape_jobs")
    .select("*, lead_lists(name, source)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
