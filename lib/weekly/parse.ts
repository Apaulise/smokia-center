import type { Json } from "@/lib/supabase/database.types";

import { isWeeklyArea } from "@/lib/weekly/areas";
import { REPORTED_UNITS, WEEKLY_CHANGE_STATUSES, type ReportedMetric, type ReportedMessageStat, type ReportedPoint, type StoredWeeklyReport, type WeeklyChange, type WeeklyChangeStatus } from "@/lib/weekly/types";

/** Lee el JSON guardado sin tirar la pantalla si una clave vino rara. */
export function parseStoredReport(row: {
  id: string;
  area: string;
  week_start: string;
  conclusions: string;
  conclusion_status: string;
  conclusion_result: string | null;
  metrics: Json;
  message_stats: Json;
  series: Json;
  changes: Json;
  agent: string;
  published_at: string;
}): StoredWeeklyReport | null {
  if (!isWeeklyArea(row.area)) return null;
  return {
    id: row.id,
    area: row.area,
    weekStart: row.week_start.slice(0, 10),
    conclusions: row.conclusions ?? "",
    conclusionStatus: asStatus(row.conclusion_status),
    conclusionResult: row.conclusion_result?.trim() ? row.conclusion_result.trim() : null,
    metrics: parseMetrics(row.metrics),
    messageStats: parseStats(row.message_stats),
    series: parseSeries(row.series),
    changes: parseChanges(row.changes),
    agent: row.agent,
    publishedAt: row.published_at,
  };
}

export function parseChanges(value: unknown): WeeklyChange[] {
  if (!Array.isArray(value)) return [];
  const changes: WeeklyChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.title !== "string") continue;
    changes.push({
      key: row.key,
      title: row.title,
      detail: typeof row.detail === "string" ? row.detail : "",
      status: asStatus(row.status),
      result: typeof row.result === "string" && row.result.trim() ? row.result.trim() : null,
    });
  }
  return changes;
}

function parseMetrics(value: unknown): ReportedMetric[] {
  if (!Array.isArray(value)) return [];
  const metrics: ReportedMetric[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.label !== "string") continue;
    metrics.push({
      key: row.key,
      label: row.label,
      value: typeof row.value === "number" && Number.isFinite(row.value) ? row.value : null,
      unit: isUnit(row.unit) ? row.unit : "count",
      note: typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
    });
  }
  return metrics;
}

function parseStats(value: unknown): ReportedMessageStat[] {
  if (!Array.isArray(value)) return [];
  const stats: ReportedMessageStat[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.type !== "string" || typeof row.sent !== "number") continue;
    stats.push({
      type: row.type,
      variant: row.variant == null ? null : String(row.variant),
      sent: row.sent,
      realReplies: optionalCount(row.realReplies),
      autoReplies: optionalCount(row.autoReplies),
      positive: optionalCount(row.positive),
    });
  }
  return stats;
}

function parseSeries(value: unknown): ReportedPoint[] {
  if (!Array.isArray(value)) return [];
  const points: ReportedPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.day !== "string") continue;
    points.push({
      day: row.day,
      sent: optionalCount(row.sent),
      realReplies: optionalCount(row.realReplies),
    });
  }
  return points;
}

function optionalCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStatus(value: unknown): WeeklyChangeStatus {
  return WEEKLY_CHANGE_STATUSES.includes(value as WeeklyChangeStatus) ? (value as WeeklyChangeStatus) : "pendiente";
}

function isUnit(value: unknown): value is ReportedMetric["unit"] {
  return REPORTED_UNITS.includes(value as ReportedMetric["unit"]);
}
