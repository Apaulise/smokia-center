import { addDaysIso, isoDateToUtcInstant } from "@/lib/leads/calendar";
import { isMissingSchema } from "@/lib/ops/schema";
import { createClient } from "@/lib/supabase/server";

import { isWeeklyArea, weeklyArea, type WeeklyAreaId } from "./areas";
import { computeBrand, computeFollowUps, computeProspecting, type CrmMessage, type FollowUpRow } from "./compute";
import { asWeekly } from "./db";
import { parseStoredReport } from "./parse";
import { presentWeekly } from "./present";
import type { StoredWeeklyReport, WeeklyPageModel } from "./types";
import { currentWeekStart, isPublishableWeek, parseWeekStart, weekOptions, weekWindow } from "./weeks";

const ROW_LIMIT = 4000;
const WEEK_CHOICES = 12;

const CRM_ERROR = "No se pudieron leer los números del CRM.";
const REPORT_ERROR = "No se pudo leer el análisis.";

/**
 * Pantalla de un área y una semana. Si la semana no viene, usa el reporte
 * más reciente de esa área y, si no hay, la semana en curso.
 */
export async function loadWeeklyPage(params: { area?: string; week?: string }, now = new Date()): Promise<WeeklyPageModel> {
  const area = isWeeklyArea(params.area ?? "") ? weeklyArea(params.area as WeeklyAreaId) : weeklyArea("whatsapp");
  const reports = await loadAreaReports(area.id);
  const requested = params.week ? parseWeekStart(params.week) : null;
  const weekStart =
    requested && isPublishableWeek(requested, now)
      ? requested
      : (reports.weeks[0] ?? currentWeekStart(now));
  const choices = weekOptions(WEEK_CHOICES, reports.weeks, now);
  if (!choices.includes(weekStart)) choices.push(weekStart);
  choices.sort((a, b) => (a < b ? 1 : -1));

  const current = reports.byWeek.get(weekStart) ?? null;
  const previousStart = addDaysIso(weekStart, -7);
  const previousMetrics = reports.byWeek.get(previousStart)?.metrics ?? [];

  const crm = await loadCrm(area, weekStart, previousStart);

  return presentWeekly({
    area,
    weekStart,
    weeks: choices,
    schemaReady: reports.schemaReady,
    reportError: reports.error,
    crmError: crm.error,
    truncated: crm.truncated,
    brandConnected: crm.brandConnected,
    prospecting: crm.prospecting,
    followups: crm.followups,
    brand: crm.brand,
    report: current,
    previousMetrics,
  });
}

interface ReportRead {
  schemaReady: boolean;
  error: string | null;
  weeks: string[];
  byWeek: Map<string, StoredWeeklyReport>;
}

async function loadAreaReports(area: WeeklyAreaId): Promise<ReportRead> {
  const supabase = asWeekly(await createClient());
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id, area, week_start, conclusions, conclusion_status, conclusion_result, metrics, message_stats, series, changes, agent, published_at")
    .eq("area", area)
    .order("week_start", { ascending: false })
    .limit(52);

  if (error) {
    if (isMissingSchema(error)) return { schemaReady: false, error: null, weeks: [], byWeek: new Map() };
    console.error("weekly_reports: no se pudo leer", error.code);
    return { schemaReady: true, error: REPORT_ERROR, weeks: [], byWeek: new Map() };
  }

  const byWeek = new Map<string, StoredWeeklyReport>();
  for (const row of data ?? []) {
    const parsed = parseStoredReport(row);
    if (parsed) byWeek.set(parsed.weekStart, parsed);
  }
  return { schemaReady: true, error: null, weeks: [...byWeek.keys()], byWeek };
}

interface CrmRead {
  error: string | null;
  truncated: boolean;
  brandConnected: boolean | null;
  prospecting: { current: ReturnType<typeof computeProspecting>; previous: ReturnType<typeof computeProspecting> } | null;
  followups: { current: ReturnType<typeof computeFollowUps>; previous: ReturnType<typeof computeFollowUps> } | null;
  brand: { current: ReturnType<typeof computeBrand>; previous: ReturnType<typeof computeBrand> } | null;
}

async function loadCrm(area: ReturnType<typeof weeklyArea>, weekStart: string, previousStart: string): Promise<CrmRead> {
  const empty: CrmRead = { error: null, truncated: false, brandConnected: null, prospecting: null, followups: null, brand: null };
  try {
    if (area.source === "messages" && area.channel) {
      const from = isoDateToUtcInstant(previousStart);
      const to = isoDateToUtcInstant(weekWindow(weekStart).end);
      const loaded = await loadChannelMessages(area.channel, from, to);
      return {
        ...empty,
        truncated: loaded.truncated,
        prospecting: {
          current: computeProspecting(loaded.rows, weekStart, area.channel),
          previous: computeProspecting(loaded.rows, previousStart, area.channel),
        },
      };
    }
    if (area.source === "followups") {
      const from = isoDateToUtcInstant(previousStart);
      const to = isoDateToUtcInstant(weekWindow(weekStart).end);
      const loaded = await loadFollowUpRows(from, to);
      const shared = { followUps: loaded.followUps, replies: loaded.replies, activities: loaded.activities, appointments: loaded.appointments };
      return {
        ...empty,
        truncated: loaded.truncated,
        followups: {
          current: computeFollowUps({ ...shared, weekStart }),
          previous: computeFollowUps({ ...shared, weekStart: previousStart }),
        },
      };
    }
    if (area.source === "brand" && area.platform) {
      const loaded = await loadBrandRows(area.platform, previousStart, weekStart);
      if (!loaded.connected) return { ...empty, brandConnected: false };
      const shared = { posts: loaded.posts, accountMetrics: loaded.accountMetrics, postMetrics: loaded.postMetrics };
      return {
        ...empty,
        brandConnected: true,
        truncated: loaded.truncated,
        brand: {
          current: computeBrand({ ...shared, weekStart }),
          previous: computeBrand({ ...shared, weekStart: previousStart }),
        },
      };
    }
    return empty;
  } catch (error) {
    console.error("weekly crm:", error instanceof Error ? error.message : "error");
    return { ...empty, error: CRM_ERROR };
  }
}

async function loadChannelMessages(channel: "WHATSAPP" | "EMAIL", from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_messages")
    .select("lead_id, sender, channel, kind, angle, variant, analysis, confirmed, occurred_at")
    .eq("channel", channel)
    .gte("occurred_at", from)
    .lt("occurred_at", to)
    .order("occurred_at", { ascending: true })
    .limit(ROW_LIMIT);
  if (error) throw error;
  const rows = (data ?? []).map(toMessage);
  return { rows, truncated: rows.length >= ROW_LIMIT };
}

async function loadFollowUpRows(from: string, to: string) {
  const supabase = await createClient();
  const ranged = await supabase
    .from("lead_messages")
    .select("id, lead_id")
    .eq("sender", "VENDEDOR")
    .eq("kind", "SEGUIMIENTO")
    .eq("confirmed", true)
    .gte("occurred_at", from)
    .lt("occurred_at", to)
    .limit(ROW_LIMIT);
  if (ranged.error) throw ranged.error;
  const leadIds = [...new Set((ranged.data ?? []).map((row) => row.lead_id))];
  if (leadIds.length === 0) {
    return { followUps: [] as FollowUpRow[], replies: [] as CrmMessage[], activities: [], appointments: [], truncated: false };
  }

  const [history, replies, activities, appointments] = await Promise.all([
    supabase
      .from("lead_messages")
      .select("id, lead_id, channel, occurred_at")
      .eq("sender", "VENDEDOR")
      .eq("kind", "SEGUIMIENTO")
      .eq("confirmed", true)
      .in("lead_id", leadIds)
      .lt("occurred_at", to)
      .order("occurred_at", { ascending: true })
      .limit(ROW_LIMIT),
    supabase
      .from("lead_messages")
      .select("lead_id, sender, channel, kind, angle, variant, analysis, confirmed, occurred_at")
      .eq("sender", "LEAD")
      .in("lead_id", leadIds)
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .limit(ROW_LIMIT),
    supabase
      .from("lead_activities")
      .select("lead_id, occurred_at, to_status")
      .eq("type", "CAMBIO_ESTADO")
      .in("lead_id", leadIds)
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .limit(ROW_LIMIT),
    supabase.from("appointments").select("lead_id, created_at").in("lead_id", leadIds).gte("created_at", from).lt("created_at", to).limit(ROW_LIMIT),
  ]);
  if (history.error) throw history.error;
  if (replies.error) throw replies.error;
  if (activities.error) throw activities.error;
  if (appointments.error) throw appointments.error;

  const truncated = [ranged.data, history.data, replies.data, activities.data, appointments.data].some((rows) => (rows?.length ?? 0) >= ROW_LIMIT);
  return {
    followUps: (history.data ?? []).map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      channel: row.channel,
      occurredAt: row.occurred_at,
    })),
    replies: (replies.data ?? []).map(toMessage),
    activities: (activities.data ?? []).flatMap((row) =>
      row.lead_id ? [{ leadId: row.lead_id, occurredAt: row.occurred_at, toStatus: row.to_status }] : [],
    ),
    appointments: (appointments.data ?? []).flatMap((row) => (row.lead_id ? [{ leadId: row.lead_id, createdAt: row.created_at }] : [])),
    truncated,
  };
}

async function loadBrandRows(platform: "INSTAGRAM" | "YOUTUBE", previousStart: string, weekStart: string) {
  const supabase = await createClient();
  const accounts = await supabase.from("brand_accounts").select("id").eq("platform", platform).order("created_at", { ascending: true }).limit(1);
  if (accounts.error) throw accounts.error;
  const accountId = accounts.data?.[0]?.id;
  if (!accountId) {
    return { connected: false as const, posts: [], accountMetrics: [], postMetrics: [], truncated: false };
  }

  const from = isoDateToUtcInstant(previousStart);
  const to = isoDateToUtcInstant(weekWindow(weekStart).end);
  const sunday = addDaysIso(weekStart, 6);
  const [posts, metrics] = await Promise.all([
    supabase
      .from("brand_posts")
      .select("id, kind, published_at")
      .eq("account_id", accountId)
      .gte("published_at", from)
      .lt("published_at", to)
      .limit(ROW_LIMIT),
    supabase
      .from("brand_account_metrics")
      .select("captured_on, followers_count, new_followers, reach, total_interactions")
      .eq("account_id", accountId)
      .gte("captured_on", previousStart)
      .lte("captured_on", sunday)
      .limit(40),
  ]);
  if (posts.error) throw posts.error;
  if (metrics.error) throw metrics.error;

  const postIds = (posts.data ?? []).map((post) => post.id);
  let postMetrics: { postId: string; capturedOn: string; reach: number | null; likes: number | null; comments: number | null; saved: number | null; views: number | null }[] = [];
  let metricsTruncated = false;
  if (postIds.length > 0) {
    const snapshots = await supabase
      .from("brand_post_metrics")
      .select("post_id, captured_on, reach, likes, comments, saved, views")
      .in("post_id", postIds)
      .lte("captured_on", sunday)
      .limit(ROW_LIMIT);
    if (snapshots.error) throw snapshots.error;
    metricsTruncated = (snapshots.data?.length ?? 0) >= ROW_LIMIT;
    postMetrics = (snapshots.data ?? []).map((row) => ({
      postId: row.post_id,
      capturedOn: row.captured_on,
      reach: row.reach,
      likes: row.likes,
      comments: row.comments,
      saved: row.saved,
      views: row.views,
    }));
  }

  return {
    connected: true as const,
    posts: (posts.data ?? []).map((post) => ({ id: post.id, kind: post.kind, publishedAt: post.published_at })),
    accountMetrics: (metrics.data ?? []).map((row) => ({
      capturedOn: row.captured_on,
      followersCount: row.followers_count,
      newFollowers: row.new_followers,
      reach: row.reach,
      totalInteractions: row.total_interactions,
    })),
    postMetrics,
    truncated: (posts.data?.length ?? 0) >= ROW_LIMIT || metricsTruncated,
  };
}

function toMessage(row: {
  lead_id: string;
  sender: CrmMessage["sender"];
  channel: CrmMessage["channel"];
  kind: CrmMessage["kind"];
  angle: string | null;
  variant: number | null;
  analysis: unknown;
  confirmed: boolean;
  occurred_at: string;
}): CrmMessage {
  return {
    leadId: row.lead_id,
    sender: row.sender,
    channel: row.channel,
    kind: row.kind,
    angle: row.angle,
    variant: row.variant,
    analysis: row.analysis,
    confirmed: row.confirmed,
    occurredAt: row.occurred_at,
  };
}
