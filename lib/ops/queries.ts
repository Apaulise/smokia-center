import { buildChain } from "@/lib/leads/execution/chain";
import { getActiveSalesGoal, getDailyContacts } from "@/lib/leads/execution/queries";
import { isoDateToUtcInstant, addDaysIso, todayIso } from "@/lib/leads/calendar";
import { createClient } from "@/lib/supabase/server";

import { asOps } from "./db";
import { currentIsoWeekLabel, formatOpsAt } from "./format";
import { contactTarget, periodDays, rollingWindow, sumContacts } from "./period";
import { AREA_LABEL, CHANNEL_LABEL, IMPACT_LABEL, impactPercent, isMissingSchema, isWorkArea } from "./schema";
import type { OpsApprovalView, OpsImprovementItem, OpsKpiModel, OpsPeriod, OpsRecords, OpsStatusItem } from "./types";

const STATUS_LIMIT = 200;
const APPROVAL_LIMIT = 100;
const IMPROVEMENT_LIMIT = 50;
const OPEN_LIMIT = 3;

const READ_ERROR = "No se pudo leer el estado de Operaciones.";

interface ReadResult<T> {
  rows: T[];
  missing: boolean;
  failed: boolean;
}

async function readTable<T>(query: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<ReadResult<T>> {
  const { data, error } = await query;
  if (!error) return { rows: data ?? [], missing: false, failed: false };
  if (isMissingSchema(error)) return { rows: [], missing: true, failed: false };
  console.error("ops: no se pudo leer", error.code);
  return { rows: [], missing: false, failed: true };
}

function toStatusItem(row: {
  id: string;
  area: OpsStatusItem["area"];
  agent: string;
  title: string;
  detail: string;
  estado: OpsStatusItem["estado"];
  needs_ok: boolean;
  occurred_at: string;
}): OpsStatusItem {
  return {
    id: row.id,
    area: row.area,
    areaLabel: AREA_LABEL[row.area],
    agent: row.agent,
    title: row.title,
    detail: row.detail,
    estado: row.estado,
    needsOk: row.needs_ok,
    at: formatOpsAt(row.occurred_at),
  };
}

function toApproval(row: {
  id: string;
  lead_id: string | null;
  lead_name: string;
  channel: OpsApprovalView["channel"];
  agent: string;
  reason: string;
  draft_body: string;
  final_body: string | null;
  decision: OpsApprovalView["decision"];
  occurred_at: string;
}): OpsApprovalView {
  const decided = row.decision === "approved" || row.decision === "edited";
  return {
    id: row.id,
    leadId: row.lead_id,
    lead: row.lead_name,
    channel: row.channel,
    channelLabel: CHANNEL_LABEL[row.channel],
    agent: row.agent,
    why: row.reason,
    body: row.draft_body,
    displayBody: decided && row.final_body ? row.final_body : row.draft_body,
    decision: row.decision,
    at: formatOpsAt(row.occurred_at),
  };
}

function toImprovement(row: {
  id: string;
  area: keyof typeof AREA_LABEL;
  title: string;
  body: string;
  impact: "alto" | "medio" | "bajo";
  impact_score: number | null;
  status: OpsImprovementItem["status"];
}): OpsImprovementItem {
  return {
    id: row.id,
    areaLabel: AREA_LABEL[row.area],
    title: row.title,
    body: row.body,
    impactLabel: IMPACT_LABEL[row.impact],
    percent: impactPercent(row.impact, row.impact_score),
    status: row.status,
  };
}

/** Estado, cola y hallazgos. Si falta la migración, vuelve vacío sin tirar la pantalla. */
export async function getOpsRecords(): Promise<OpsRecords> {
  const supabase = asOps(await createClient());
  const [status, approvals, improvements] = await Promise.all([
    readTable(
      supabase
        .from("ops_status")
        .select("id, area, agent, title, detail, estado, needs_ok, occurred_at, updated_at")
        .order("occurred_at", { ascending: false })
        .limit(STATUS_LIMIT),
    ),
    readTable(
      supabase
        .from("ops_approvals")
        .select("id, lead_id, lead_name, channel, agent, reason, draft_body, final_body, decision, occurred_at, updated_at")
        .order("occurred_at", { ascending: false })
        .limit(APPROVAL_LIMIT),
    ),
    readTable(
      supabase
        .from("ops_improvements")
        .select("id, area, title, body, impact, impact_score, status, week_label, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(IMPROVEMENT_LIMIT),
    ),
  ]);

  const missing = status.missing || approvals.missing || improvements.missing;
  const failed = status.failed || approvals.failed || improvements.failed;
  const approvalRows = approvals.rows;
  const pendingFirst = [...approvalRows].sort((a, b) => {
    const rank = (decision: string) => (decision === "pending" ? 0 : 1);
    return rank(a.decision) - rank(b.decision);
  });

  const openRows = improvements.rows
    .filter((row) => row.status === "abierta")
    .sort((a, b) => impactPercent(b.impact, b.impact_score) - impactPercent(a.impact, a.impact_score));
  const historyRows = [
    ...openRows.slice(OPEN_LIMIT),
    ...improvements.rows.filter((row) => row.status !== "abierta"),
  ];

  const stamps = [
    ...status.rows.map((row) => row.updated_at),
    ...approvalRows.map((row) => row.updated_at),
    ...improvements.rows.map((row) => row.updated_at),
  ].filter(Boolean);
  const weekFromOpen = openRows.find((row) => row.week_label)?.week_label;

  return {
    schemaReady: !missing,
    readError: failed ? READ_ERROR : null,
    items: status.rows.filter((row) => isWorkArea(row.area)).map(toStatusItem),
    approvals: pendingFirst.map(toApproval),
    openImprovements: openRows.slice(0, OPEN_LIMIT).map(toImprovement),
    historyImprovements: historyRows.map(toImprovement),
    pendingCount: approvalRows.filter((row) => row.decision === "pending").length,
    weekLabel: (weekFromOpen ?? currentIsoWeekLabel()).toUpperCase(),
    updatedAtIso: stamps.sort().at(-1) ?? null,
  };
}

/**
 * Contador del sidebar. Falla cerrado en 0: una tabla que todavía no existe
 * no puede tirar abajo el resto de la app.
 */
export async function countPendingApprovals(): Promise<number> {
  const supabase = asOps(await createClient());
  const { count, error } = await supabase
    .from("ops_approvals")
    .select("id", { count: "exact", head: true })
    .eq("decision", "pending");
  if (error) {
    if (!isMissingSchema(error)) console.error("ops_approvals: no se pudo contar", error.code);
    return 0;
  }
  return count ?? 0;
}

async function countReplies(fromInstant: string, toInstant: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("lead_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender", "LEAD")
    .gte("occurred_at", fromInstant)
    .lt("occurred_at", toInstant);
  if (error) throw error;
  return count ?? 0;
}

async function countUpcomingMeetings(days: number): Promise<number> {
  const supabase = await createClient();
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000).toISOString();
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .in("status", ["AGENDADA", "CONFIRMADA"])
    .gte("starts_at", now.toISOString())
    .lt("starts_at", until);
  if (error) throw error;
  return count ?? 0;
}

async function countContentQueue(): Promise<{ instagram: number; youtube: number }> {
  const supabase = await createClient();
  const countPlatform = async (platform: "INSTAGRAM" | "YOUTUBE") => {
    const { count, error } = await supabase
      .from("brand_content_items")
      .select("id", { count: "exact", head: true })
      .eq("platform", platform)
      .neq("status", "PUBLICADO");
    if (error) throw error;
    return count ?? 0;
  };
  const [instagram, youtube] = await Promise.all([countPlatform("INSTAGRAM"), countPlatform("YOUTUBE")]);
  return { instagram, youtube };
}

/** KPIs de prospección, reuniones y contenido. Salen de Leads y Marca, no de las tablas de Operaciones. */
export async function getOpsKpis(period: OpsPeriod): Promise<OpsKpiModel> {
  const days = periodDays(period);
  const today = todayIso();
  const current = rollingWindow(today, days);
  const previousEnd = addDaysIso(current.from, -1);
  const previous = rollingWindow(previousEnd, days);

  const [series, goal, replies, meetings, content] = await Promise.all([
    getDailyContacts(previous.from, today),
    getActiveSalesGoal(),
    countReplies(isoDateToUtcInstant(current.from), isoDateToUtcInstant(addDaysIso(current.to, 1))),
    countUpcomingMeetings(days),
    countContentQueue(),
  ]);

  let contactedTarget: number | null = null;
  if (
    goal &&
    goal.avgTicket > 0 &&
    goal.bookingRate > 0 &&
    goal.showRate > 0 &&
    goal.closeRate > 0 &&
    goal.workingDaysPerMonth > 0 &&
    goal.workingDaysPerWeek > 0
  ) {
    contactedTarget = contactTarget(buildChain(goal), goal.workingDaysPerWeek, days);
  }

  return {
    contacted: sumContacts(series, current.from, current.to),
    contactedPrevious: sumContacts(series, previous.from, previous.to),
    contactedTarget,
    replies,
    meetings,
    instagramQueue: content.instagram,
    youtubeQueue: content.youtube,
    period,
    periodDays: days,
  };
}
