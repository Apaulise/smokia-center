import type { Json } from "@/lib/supabase/database.types";

import { isWeeklyArea } from "@/lib/weekly/areas";
import {
  CHANGE_MEASURE_DIRECTIONS,
  CHANGE_MEASURE_SOURCES,
  REPORTED_UNITS,
  WEEKLY_CHANGE_STATUSES,
  WEEKLY_RESULT_SOURCES,
  type ChangeMeasure,
  type ChangeResultMetric,
  type ReportedMetric,
  type ReportedMessageStat,
  type ReportedPoint,
  type StoredWeeklyReport,
  type WeeklyChange,
  type WeeklyChangeStatus,
  type WeeklyResultSource,
} from "@/lib/weekly/types";
import { parseWeekStart } from "@/lib/weekly/weeks";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_KEY = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

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
    changes.push(
      storedChange({
        key: row.key,
        title: row.title,
        detail: typeof row.detail === "string" ? row.detail : "",
        status: asStatus(row.status),
        result: typeof row.result === "string" && row.result.trim() ? row.result.trim() : null,
        measure: parseMeasure(row.measure),
        resultSource: asResultSource(row.resultSource),
        resultAgent: asAgent(row.resultAgent),
        resultAt: asInstant(row.resultAt),
        resultMetrics: parseResultMetrics(row.resultMetrics),
        suggestedStatus: asOptionalStatus(row.suggestedStatus),
      }),
    );
  }
  return changes;
}

/** Misma forma al leer y al escribir, para que un campo nuevo no se pierda ni cambie de orden. */
export function storedChange(change: WeeklyChange): WeeklyChange {
  const stored: WeeklyChange = {
    key: change.key,
    title: change.title,
    detail: change.detail,
    status: change.status,
    result: change.result,
  };
  if (change.measure) stored.measure = storedMeasure(change.measure);
  if (change.resultSource) stored.resultSource = change.resultSource;
  if (change.resultAgent) stored.resultAgent = change.resultAgent;
  if (change.resultAt) stored.resultAt = change.resultAt;
  if (change.resultMetrics && change.resultMetrics.length > 0) {
    stored.resultMetrics = change.resultMetrics.map(storedResultMetric);
  }
  if (change.suggestedStatus) stored.suggestedStatus = change.suggestedStatus;
  return stored;
}

export function storedMeasure(measure: ChangeMeasure): ChangeMeasure {
  const stored: ChangeMeasure = {
    metric: measure.metric,
    label: measure.label,
    unit: measure.unit,
    direction: measure.direction,
    baseline: measure.baseline,
    baselineWeek: measure.baselineWeek,
    startWeek: measure.startWeek,
    weeks: measure.weeks,
    source: measure.source,
  };
  if (measure.target) stored.target = measure.target;
  if (measure.baselineN != null) stored.baselineN = measure.baselineN;
  if (measure.segment) stored.segment = measure.segment;
  return stored;
}

export function storedResultMetric(metric: ChangeResultMetric): ChangeResultMetric {
  const stored: ChangeResultMetric = {
    metric: metric.metric,
    label: metric.label,
    unit: metric.unit,
    before: metric.before,
    after: metric.after,
    weekBefore: metric.weekBefore,
    weekAfter: metric.weekAfter,
  };
  if (metric.nBefore != null) stored.nBefore = metric.nBefore;
  if (metric.nAfter != null) stored.nAfter = metric.nAfter;
  return stored;
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

function parseMeasure(value: unknown): ChangeMeasure | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const metric = typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const baselineWeek = typeof row.baselineWeek === "string" ? row.baselineWeek : "";
  const startWeek = typeof row.startWeek === "string" ? row.startWeek : "";
  const weeks = row.weeks;
  const baseline = row.baseline;
  if (!METRIC_KEY.test(metric) || !label || label.length > 80) return undefined;
  if (!isUnit(row.unit) || !isDirection(row.direction) || !isMeasureSource(row.source)) return undefined;
  if (!isMonday(baselineWeek) || !isMonday(startWeek)) return undefined;
  if (typeof weeks !== "number" || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) return undefined;
  if (baseline !== null && (typeof baseline !== "number" || !Number.isFinite(baseline))) return undefined;
  if (outOfPercent(row.unit, baseline)) return undefined;
  const measure: ChangeMeasure = {
    metric,
    label,
    unit: row.unit,
    direction: row.direction,
    baseline,
    baselineWeek,
    startWeek,
    weeks,
    source: row.source,
  };
  if (typeof row.target === "string" && row.target.trim()) measure.target = row.target.trim().slice(0, 80);
  if (typeof row.baselineN === "number" && Number.isInteger(row.baselineN) && row.baselineN >= 0 && row.baselineN <= 1_000_000) {
    measure.baselineN = row.baselineN;
  }
  if (typeof row.segment === "string" && row.segment.trim()) measure.segment = row.segment.trim().slice(0, 120);
  return measure;
}

function parseResultMetrics(value: unknown): ChangeResultMetric[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const metrics: ChangeResultMetric[] = [];
  for (const item of value) {
    if (metrics.length >= 5) break;
    const metric = parseResultMetric(item);
    if (metric) metrics.push(metric);
  }
  return metrics.length > 0 ? metrics : undefined;
}

function parseResultMetric(value: unknown): ChangeResultMetric | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const metric = typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const weekBefore = typeof row.weekBefore === "string" ? row.weekBefore : "";
  const weekAfter = typeof row.weekAfter === "string" ? row.weekAfter : "";
  if (!METRIC_KEY.test(metric) || !label || label.length > 80) return undefined;
  if (!isUnit(row.unit) || !isMonday(weekBefore) || !isMonday(weekAfter)) return undefined;
  const before = optionalFinite(row.before);
  const after = optionalFinite(row.after);
  if (before === undefined || after === undefined) return undefined;
  if (outOfPercent(row.unit, before) || outOfPercent(row.unit, after)) return undefined;
  const parsed: ChangeResultMetric = {
    metric,
    label,
    unit: row.unit,
    before,
    after,
    weekBefore,
    weekAfter,
  };
  const nBefore = optionalSample(row.nBefore);
  const nAfter = optionalSample(row.nAfter);
  if (nBefore != null) parsed.nBefore = nBefore;
  if (nAfter != null) parsed.nAfter = nAfter;
  return parsed;
}

function optionalFinite(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function optionalSample(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) return undefined;
  return value;
}

function outOfPercent(unit: unknown, value: number | null): boolean {
  return unit === "percent" && value != null && (value < 0 || value > 100);
}

function isMonday(value: string): boolean {
  return DAY.test(value) && parseWeekStart(value) === value;
}

function asStatus(value: unknown): WeeklyChangeStatus {
  return WEEKLY_CHANGE_STATUSES.includes(value as WeeklyChangeStatus) ? (value as WeeklyChangeStatus) : "pendiente";
}

function asOptionalStatus(value: unknown): WeeklyChangeStatus | undefined {
  return WEEKLY_CHANGE_STATUSES.includes(value as WeeklyChangeStatus) ? (value as WeeklyChangeStatus) : undefined;
}

function asResultSource(value: unknown): WeeklyResultSource | undefined {
  return WEEKLY_RESULT_SOURCES.includes(value as WeeklyResultSource) ? (value as WeeklyResultSource) : undefined;
}

function asAgent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const agent = value.trim().toLowerCase();
  return AGENT_ID.test(agent) ? agent : undefined;
}

function asInstant(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return undefined;
  return value.trim();
}

function isDirection(value: unknown): value is ChangeMeasure["direction"] {
  return CHANGE_MEASURE_DIRECTIONS.includes(value as ChangeMeasure["direction"]);
}

function isMeasureSource(value: unknown): value is ChangeMeasure["source"] {
  return CHANGE_MEASURE_SOURCES.includes(value as ChangeMeasure["source"]);
}

function isUnit(value: unknown): value is ReportedMetric["unit"] {
  return REPORTED_UNITS.includes(value as ReportedMetric["unit"]);
}
