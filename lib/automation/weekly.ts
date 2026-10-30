// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito
// (CLAUDE.md §4). Publica el análisis semanal y lee lo ya guardado.
// No envía mensajes. El estado que una persona ya decidió no se pisa.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { isMissingSchema } from "@/lib/ops/schema";
import { asWeekly } from "@/lib/weekly/db";
import { mergeReport, sameReport, type ReportBody } from "@/lib/weekly/merge";
import { parseStoredReport } from "@/lib/weekly/parse";
import type { WeeklyPublishPayload } from "@/lib/weekly/schema";
import type { StoredWeeklyReport } from "@/lib/weekly/types";

type Admin = SupabaseClient<Database>;

export type PublishWeeklyResult =
  | { ok: true; id: string; area: string; week: string; unchanged: boolean; preservedDecisions: number }
  | { ok: false; status: number; error: string };

export async function publishWeeklyReport(
  admin: Admin,
  ownerId: string,
  agent: string,
  payload: WeeklyPublishPayload,
): Promise<PublishWeeklyResult> {
  const ops = asWeekly(admin);
  const existing = await ops
    .from("weekly_reports")
    .select("id, area, week_start, conclusions, conclusion_status, conclusion_result, metrics, message_stats, series, changes, agent, published_at")
    .eq("owner_id", ownerId)
    .eq("area", payload.area)
    .eq("week_start", payload.weekStart)
    .maybeSingle();

  if (existing.error) return schemaOrGeneric(existing.error, "leer");
  const current = existing.data ? parseStoredReport(existing.data) : null;
  const merged = mergeReport(current ? toBody(current) : null, {
    conclusions: payload.conclusions,
    conclusionStatus: payload.conclusionStatus,
    conclusionResult: payload.conclusionResult,
    metrics: payload.metrics,
    messageStats: payload.messageStats,
    series: payload.series,
    changes: payload.changes,
  });

  if (current && sameReport(toBody(current), merged.next)) {
    return { ok: true, id: current.id, area: payload.area, week: payload.weekStart, unchanged: true, preservedDecisions: merged.preservedDecisions };
  }

  const fields = bodyFields(merged.next, agent);

  if (current) {
    const { error } = await ops.from("weekly_reports").update(fields).eq("id", current.id).eq("owner_id", ownerId);
    if (error) return schemaOrGeneric(error, "actualizar");
    return { ok: true, id: current.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: merged.preservedDecisions };
  }

  const inserted = await ops
    .from("weekly_reports")
    .insert({ ...fields, owner_id: ownerId, area: payload.area, week_start: payload.weekStart })
    .select("id")
    .single();

  if (inserted.error?.code === "23505") {
    const raced = await ops
      .from("weekly_reports")
      .select("id, area, week_start, conclusions, conclusion_status, conclusion_result, metrics, message_stats, series, changes, agent, published_at")
      .eq("owner_id", ownerId)
      .eq("area", payload.area)
      .eq("week_start", payload.weekStart)
      .maybeSingle();
    if (raced.error || !raced.data) return schemaOrGeneric(raced.error ?? inserted.error, "leer");
    const racedReport = parseStoredReport(raced.data);
    const again = mergeReport(racedReport ? toBody(racedReport) : null, {
      conclusions: payload.conclusions,
      conclusionStatus: payload.conclusionStatus,
      conclusionResult: payload.conclusionResult,
      metrics: payload.metrics,
      messageStats: payload.messageStats,
      series: payload.series,
      changes: payload.changes,
    });
    const retry = await ops.from("weekly_reports").update(bodyFields(again.next, agent)).eq("id", raced.data.id).eq("owner_id", ownerId);
    if (retry.error) return schemaOrGeneric(retry.error, "actualizar");
    return { ok: true, id: raced.data.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: again.preservedDecisions };
  }
  if (inserted.error || !inserted.data) return schemaOrGeneric(inserted.error, "insertar");
  return { ok: true, id: inserted.data.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: merged.preservedDecisions };
}

export type ReadWeeklyResult =
  | { ok: true; reports: WeeklyReportResponse[] }
  | { ok: false; status: number; error: string };

export interface WeeklyReportResponse {
  id: string;
  area: string;
  week: string;
  conclusions: string;
  conclusionStatus: string;
  conclusionResult: string | null;
  metrics: StoredWeeklyReport["metrics"];
  messageStats: StoredWeeklyReport["messageStats"];
  series: StoredWeeklyReport["series"];
  changes: StoredWeeklyReport["changes"];
  agent: string;
  publishedAt: string;
}

export async function readWeeklyReports(
  admin: Admin,
  ownerId: string,
  query: { area?: WeeklyPublishPayload["area"]; week?: string; limit: number },
): Promise<ReadWeeklyResult> {
  const ops = asWeekly(admin);
  let request = ops
    .from("weekly_reports")
    .select("id, area, week_start, conclusions, conclusion_status, conclusion_result, metrics, message_stats, series, changes, agent, published_at")
    .eq("owner_id", ownerId)
    .order("week_start", { ascending: false })
    .limit(query.limit);
  if (query.area) request = request.eq("area", query.area);
  if (query.week) request = request.eq("week_start", query.week);

  const { data, error } = await request;
  if (error) return schemaOrGeneric(error, "leer");
  const reports = (data ?? []).flatMap((row) => {
    const parsed = parseStoredReport(row);
    return parsed ? [toResponse(parsed)] : [];
  });
  return { ok: true, reports };
}

function bodyFields(body: ReportBody, agent: string) {
  return {
    conclusions: body.conclusions,
    conclusion_status: body.conclusionStatus,
    conclusion_result: body.conclusionResult,
    metrics: asJson(body.metrics),
    message_stats: asJson(body.messageStats),
    series: asJson(body.series),
    changes: asJson(body.changes),
    agent,
    published_at: new Date().toISOString(),
  };
}

function toBody(report: StoredWeeklyReport): ReportBody {
  return {
    conclusions: report.conclusions,
    conclusionStatus: report.conclusionStatus,
    conclusionResult: report.conclusionResult,
    metrics: report.metrics,
    messageStats: report.messageStats,
    series: report.series,
    changes: report.changes,
  };
}

function toResponse(report: StoredWeeklyReport): WeeklyReportResponse {
  return {
    id: report.id,
    area: report.area,
    week: report.weekStart,
    conclusions: report.conclusions,
    conclusionStatus: report.conclusionStatus,
    conclusionResult: report.conclusionResult,
    metrics: report.metrics,
    messageStats: report.messageStats,
    series: report.series,
    changes: report.changes,
    agent: report.agent,
    publishedAt: report.publishedAt,
  };
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function schemaOrGeneric(error: { code?: string; message?: string } | null, action: string): { ok: false; status: number; error: string } {
  if (isMissingSchema(error)) return { ok: false, status: 503, error: "Falta aplicar la migración del análisis semanal." };
  console.error(`weekly ${action}:`, error?.code);
  if (error?.code === "23514") return { ok: false, status: 400, error: "El análisis no cumple las reglas de la tabla." };
  const fallback = action === "leer" ? "No se pudo leer el análisis." : "No se pudo guardar el análisis.";
  return { ok: false, status: 500, error: fallback };
}
