import { addDaysIso, isoDateToUtcInstant, todayIso } from "@/lib/leads/calendar";
import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/leads/status";
import type { Database, Json } from "@/lib/supabase/database.types";

const PAGE_SIZE = 25;

/** Fila de `leads` con el rubro, la lista de origen y la próxima acción calculada, ya resueltos por el join de `SELECT_LEAD_ROW`. */
export type LeadWithRelations = Database["public"]["Tables"]["leads"]["Row"] & {
  industries: Pick<Database["public"]["Tables"]["industries"]["Row"], "id" | "name" | "color"> | null;
  lead_lists: Pick<Database["public"]["Tables"]["lead_lists"]["Row"], "id" | "name" | "source"> | null;
  lead_intel: Pick<Database["public"]["Tables"]["lead_intel"]["Row"], "next_best_action" | "next_best_action_reason"> | null;
};

export interface LeadsFilter {
  industryId?: string;
  status?: LeadStatus;
  leadListId?: string;
  city?: string;
  q?: string;
}

export type LeadsSortField = "created_at" | "name" | "status" | "last_contacted_at" | "next_action_at";

const SELECT_LEAD_ROW =
  "*, industries(id, name, color), lead_lists(id, name, source), lead_intel(next_best_action, next_best_action_reason)";

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

export type LeadNoteRow = Pick<Database["public"]["Tables"]["lead_activities"]["Row"], "content" | "occurred_at">;

/**
 * Las notas manuales del lead (tipo `NOTA` de `lead_activities`), más viejas
 * primero — para el copiloto (Plan §1.7 y ss.). Alguien que anota "esto lo
 * contestó un bot" o "ya tienen una solución armada" está corrigiendo al
 * sistema con algo que sólo un humano puede ver; sin esto esa nota se queda
 * en el timeline y el próximo análisis o mensaje sugerido no la conoce.
 */
export async function listLeadNotes(leadId: string): Promise<LeadNoteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("content, occurred_at")
    .eq("lead_id", leadId)
    .eq("type", "NOTA")
    .order("occurred_at", { ascending: true });
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

/** Leads del usuario en formato liviano, para el selector de lead del formulario de turnos. */
export async function listLeadsLite(limit = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("id, name").order("name").limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type LeadListOverviewRow = Database["public"]["Tables"]["lead_lists"]["Row"] & {
  industries: Pick<Database["public"]["Tables"]["industries"]["Row"], "id" | "name" | "color"> | null;
  leads: { count: number }[];
};

/**
 * Previsualización de listas de /leads/lista: una por lista, con el conteo
 * real de leads (no `lead_lists.lead_count`, que es un contador de import que
 * no se ajusta cuando se borran leads sueltos).
 */
export async function listLeadListsOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_lists")
    .select("*, industries(id, name, color), leads(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadListOverviewRow[];
}

export type LeadListRow = Database["public"]["Tables"]["lead_lists"]["Row"] & {
  industries: Pick<Database["public"]["Tables"]["industries"]["Row"], "id" | "name" | "color"> | null;
};

/** Una lista puntual, para el encabezado de /leads/lista/[id]. */
export async function getLeadList(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_lists")
    .select("*, industries(id, name, color)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as LeadListRow | null;
}

/** Conteo liviano de listas, para el badge del ítem "Listas" del sidebar — sin traer filas. */
export async function countLeadLists(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("lead_lists").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Turnos de hoy (no cancelados), para el badge del ítem "Agenda" del sidebar — sin traer filas. */
export async function countTodayAppointments(): Promise<number> {
  const supabase = await createClient();
  const todayStart = isoDateToUtcInstant(todayIso());
  const todayEnd = isoDateToUtcInstant(addDaysIso(todayIso(), 1));
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("starts_at", todayStart)
    .lt("starts_at", todayEnd)
    .neq("status", "CANCELADA");
  if (error) throw error;
  return count ?? 0;
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

// ── Dashboard del gestor (Plan §1.4) ────────────────────────────────────────
// Los agregados pesados salen de funciones Postgres (supabase/migrations
// /20260914120000_leads_dashboard_functions.sql) llamadas por `.rpc()`, en vez
// de traer filas acá para contarlas. Corren SECURITY INVOKER, así que RLS
// filtra igual que en cualquier otra query.

export interface DashboardSummary {
  total_leads: number;
  contacted: number;
  scheduled: number;
  won: number;
  conversion_rate: number | null;
}

const EMPTY_SUMMARY: DashboardSummary = {
  total_leads: 0,
  contacted: 0,
  scheduled: 0,
  won: 0,
  conversion_rate: null,
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_dashboard_summary").maybeSingle();
  if (error) throw error;
  return data ?? EMPTY_SUMMARY;
}

export interface FunnelStage {
  status: LeadStatus;
  lead_count: number;
}

export async function getLeadsFunnel(): Promise<FunnelStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_funnel_by_status");
  if (error) throw error;
  return data ?? [];
}

export interface ActivityTimelinePoint {
  day: string;
  contacted: number;
  won: number;
}

export async function getActivityTimeline(days = 30): Promise<ActivityTimelinePoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_activity_timeline", { days });
  if (error) throw error;
  return data ?? [];
}

export interface IndustryDistribution {
  industry_id: string | null;
  name: string;
  color: string;
  lead_count: number;
}

export async function getLeadsByIndustry(): Promise<IndustryDistribution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_by_industry");
  if (error) throw error;
  return data ?? [];
}

export interface ListPerformance {
  list_id: string;
  name: string;
  source: Database["public"]["Enums"]["lead_source"];
  criteria: Json | null;
  industry_name: string | null;
  industry_color: string | null;
  lead_count: number;
  contacted_count: number;
  won_count: number;
  win_rate: number | null;
}

export async function getListPerformance(): Promise<ListPerformance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_performance_by_list");
  if (error) throw error;
  return data ?? [];
}

// ── Métricas de prospección (Plan §1.17) ────────────────────────────────────

export type ProspectingFunnel = Database["public"]["Functions"]["leads_prospecting_funnel"]["Returns"][number];

const EMPTY_PROSPECTING_FUNNEL: ProspectingFunnel = {
  total_leads: 0,
  contacts_sent: 0,
  human_responses: 0,
  qualified: 0,
  interested: 0,
  meetings: 0,
  won: 0,
  total_responses: 0,
};

/** Los siete escalones y la tasa total no evaluativa (SPA §20/§21) — todo calculado en SQL. */
export async function getProspectingFunnel(): Promise<ProspectingFunnel> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leads_prospecting_funnel").maybeSingle();
  if (error) throw error;
  return data ?? EMPTY_PROSPECTING_FUNNEL;
}

export type AngleVariantPerformance = Database["public"]["Functions"]["lead_angle_variant_performance"]["Returns"][number];

/** Rendimiento por ángulo y variante de apertura (Plan §1.19) — el `n` viaja siempre junto a cada tasa. */
export async function getAngleVariantPerformance(): Promise<AngleVariantPerformance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_angle_variant_performance");
  if (error) throw error;
  return data ?? [];
}

export interface NextAppointmentBriefing {
  appointment: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    meetingUrl: string | null;
  };
  lead: {
    id: string;
    name: string;
    status: LeadStatus;
    listName: string | null;
  };
  /** Hasta 3 señales confirmadas del lead, como contexto para preparar la reunión (Design System §05, "Para preparar"). */
  prepPoints: { kind: Database["public"]["Enums"]["lead_signal_kind"]; description: string }[];
}

/** La reunión agendada más próxima con su contexto de preparación, para el panel lateral de /leads/agenda. */
export async function getNextAppointmentBriefing(): Promise<NextAppointmentBriefing | null> {
  const supabase = await createClient();
  const { data: appointment, error } = await supabase
    .from("appointments")
    .select("id, title, starts_at, ends_at, meeting_url, leads(id, name, status, lead_lists(name))")
    .in("status", ["AGENDADA", "CONFIRMADA"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!appointment || !appointment.leads) return null;

  const { data: signals, error: signalsError } = await supabase
    .from("lead_signals")
    .select("kind, description")
    .eq("lead_id", appointment.leads.id)
    .eq("status", "CONFIRMADO")
    .not("description", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  if (signalsError) throw signalsError;

  return {
    appointment: {
      id: appointment.id,
      title: appointment.title,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      meetingUrl: appointment.meeting_url,
    },
    lead: {
      id: appointment.leads.id,
      name: appointment.leads.name,
      status: appointment.leads.status,
      listName: appointment.leads.lead_lists?.name ?? null,
    },
    prepPoints: (signals ?? []).map((s) => ({ kind: s.kind, description: s.description! })),
  };
}

/** Próximas reuniones agendadas, para el widget de atención del dashboard. */
export async function listUpcomingAppointments(limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, title, starts_at, leads(id, name)")
    .in("status", ["AGENDADA", "CONFIRMADA"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Leads sin tocar hace más de `days` días: nunca contactados desde que se
 * crearon, o sin contacto desde la última actividad — lo que sea más
 * reciente. Se excluyen los estados terminales, que ya no necesitan seguimiento.
 *
 * Plan §1.16: también entran los que tienen `next_action_at` vencido —
 * típicamente un `AHORA_NO` cuya fecha de retomar ya llegó (SPA §16). Es la
 * misma lista, ampliada: acá es donde aparece solo cuando llega la fecha.
 */
export async function listStaleLeads(days = 7, limit = 5) {
  const supabase = await createClient();
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, status, last_contacted_at, created_at, next_action_at")
    .not("status", "in", "(CERRADO_GANADO,CERRADO_PERDIDO,DESCARTADO)")
    .or(`last_contacted_at.lt.${threshold},and(last_contacted_at.is.null,created_at.lt.${threshold}),next_action_at.lte.${now}`)
    .order("last_contacted_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type FollowUpQueueLead = LeadWithRelations & {
  overdue: boolean;
  /** Tiene una fecha de próxima acción a futuro: ya se hizo lo que tocaba y se espera. */
  waiting: boolean;
};

/**
 * Cola de seguimiento de `/leads/seguimiento` (Plan §1.20): prospecciones
 * abiertas, es decir leads a los que ya se les escribió (`last_contacted_at`
 * no nulo) y que no están en un estado terminal. Los leads sin contactar no
 * entran: son contactos cargados para escribirles más adelante, no un
 * seguimiento pendiente. Ordenada por último contacto más viejo primero — el
 * que lleva más tiempo sin novedades es el más prioritario. `overdue` marca
 * además los que tienen una fecha de retomar ya cumplida.
 */
export async function listFollowUpQueue(limit = 200) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select(SELECT_LEAD_ROW)
    .not("status", "in", "(CERRADO_GANADO,CERRADO_PERDIDO,DESCARTADO)")
    .not("last_contacted_at", "is", null)
    .order("last_contacted_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as LeadWithRelations[];
  return rows.map((lead) => ({
    ...lead,
    overdue: Boolean(lead.next_action_at && new Date(lead.next_action_at) <= new Date(now)),
    waiting: Boolean(lead.next_action_at && new Date(lead.next_action_at) > new Date(now)),
  })) satisfies FollowUpQueueLead[];
}

// ── Agenda (Plan §1.5) ───────────────────────────────────────────────────────

const SELECT_APPOINTMENT_ROW = "*, leads(id, name, status)";

export type AppointmentWithLead = Database["public"]["Tables"]["appointments"]["Row"] & {
  leads: Pick<Database["public"]["Tables"]["leads"]["Row"], "id" | "name" | "status"> | null;
};

/** Turnos cuyo `starts_at` cae en `[startIso, endIso)` (instantes UTC ya resueltos) — vistas mes y semana. */
export async function listAppointmentsInRange(startIso: string, endIso: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT_APPOINTMENT_ROW)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppointmentWithLead[];
}

/** Próximos turnos sin recorte por rango — vista lista de /leads/agenda. */
export async function listUpcomingAppointmentsList(limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT_APPOINTMENT_ROW)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppointmentWithLead[];
}

// ── Copiloto de prospección (Plan §1.9 en adelante) ─────────────────────────

export type LeadIntelRow = Database["public"]["Tables"]["lead_intel"]["Row"];

/** `enrichment` y `memory` se guardan en camelCase tal como los devuelven lib/leads/ai/{enrich,analyze}.ts — son blobs opacos, no columnas que Postgres filtre. */
export async function getLeadIntel(leadId: string): Promise<LeadIntelRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lead_intel").select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return data;
}

export type LeadSignalRow = Database["public"]["Tables"]["lead_signals"]["Row"];

export async function listLeadSignals(leadId: string): Promise<LeadSignalRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_signals")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Conteo de aperturas por ángulo en los últimos 30 días (Plan §1.11, SPA §6) — el antisesgo se calcula en SQL. */
export async function getLeadAngleCounts30d(): Promise<Partial<Record<Database["public"]["Enums"]["lead_sales_angle"], number>>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_angle_counts_30d");
  if (error) throw error;
  const counts: Partial<Record<Database["public"]["Enums"]["lead_sales_angle"], number>> = {};
  for (const row of data ?? []) counts[row.angle] = Number(row.message_count);
  return counts;
}

export type LeadMessageRow = Database["public"]["Tables"]["lead_messages"]["Row"];

export async function listLeadMessages(leadId: string): Promise<LeadMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface CommandPaletteResults {
  leads: { id: string; name: string; status: LeadStatus }[];
  lists: { id: string; name: string }[];
}

const EMPTY_PALETTE_RESULTS: CommandPaletteResults = { leads: [], lists: [] };

/** Resultados del ⌘K (Sidebar §01.B): leads y listas por nombre, 5 de cada uno. RLS filtra por owner_id como siempre. */
export async function searchCommandPalette(query: string): Promise<CommandPaletteResults> {
  const term = query.trim().replace(/[%,]/g, "");
  if (!term) return EMPTY_PALETTE_RESULTS;

  const supabase = await createClient();
  const [leadsResult, listsResult] = await Promise.all([
    supabase.from("leads").select("id, name, status").ilike("name", `%${term}%`).order("name").limit(5),
    supabase.from("lead_lists").select("id, name").ilike("name", `%${term}%`).order("name").limit(5),
  ]);
  if (leadsResult.error) throw leadsResult.error;
  if (listsResult.error) throw listsResult.error;

  return { leads: leadsResult.data ?? [], lists: listsResult.data ?? [] };
}

/** IDs de una lista en orden de creación, para "anterior/siguiente lead" (K/J) y el indicador "12 / 30" de la ficha. */
export async function listLeadIdsForNav(leadListId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("lead_list_id", leadListId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

/** Turnos futuros no cancelados, para la exportación .ics. */
export async function listAppointmentsForIcs() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, title, notes, starts_at, ends_at, meeting_url, status, leads(name)")
    .neq("status", "CANCELADA")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}
