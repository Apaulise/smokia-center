// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito
// (CLAUDE.md §4). Publica el análisis semanal y lee lo ya guardado.
// No envía mensajes. El estado que una persona ya decidió no se pisa.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";
import { isMissingSchema } from "@/lib/ops/schema";
import type { WeeklyAreaId } from "@/lib/weekly/areas";
import { asWeekly } from "@/lib/weekly/db";
import { applyAgentResult, mergeReport, sameReport, type ReportBody } from "@/lib/weekly/merge";
import { parseStoredReport } from "@/lib/weekly/parse";
import type { ChangeResultPayload, WeeklyPublishPayload } from "@/lib/weekly/schema";
import type { StoredWeeklyReport, WeeklyChange } from "@/lib/weekly/types";

const REPORT_COLUMNS =
  "id, area, week_start, conclusions, conclusion_status, conclusion_result, metrics, message_stats, series, changes, agent, published_at, updated_at";

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
  const existing = await readOwned(ops, ownerId, payload.area, payload.weekStart);
  if (existing.error) return schemaOrGeneric(existing.error, "leer");

  const incoming = toIncoming(payload);
  const current = existing.data ? parseStoredReport(existing.data) : null;
  const merged = mergeReport(current ? toBody(current) : null, incoming);

  if (current && sameReport(toBody(current), merged.next)) {
    return { ok: true, id: current.id, area: payload.area, week: payload.weekStart, unchanged: true, preservedDecisions: merged.preservedDecisions };
  }

  const fields = bodyFields(merged.next, agent);

  if (current && existing.data) {
    const wrote = await writeIfCurrent(ops, ownerId, current.id, existing.data.updated_at, fields);
    if (wrote.kind === "error") return schemaOrGeneric(wrote.error, "actualizar");
    if (wrote.kind === "ok") {
      return { ok: true, id: current.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: merged.preservedDecisions };
    }
    const raced = await readOwned(ops, ownerId, payload.area, payload.weekStart);
    if (raced.error || !raced.data) return schemaOrGeneric(raced.error, "leer");
    const racedReport = parseStoredReport(raced.data);
    if (!racedReport) return { ok: false, status: 500, error: "No se pudo leer el análisis." };
    const again = mergeReport(toBody(racedReport), incoming);
    if (sameReport(toBody(racedReport), again.next)) {
      return { ok: true, id: raced.data.id, area: payload.area, week: payload.weekStart, unchanged: true, preservedDecisions: again.preservedDecisions };
    }
    const retry = await writeIfCurrent(ops, ownerId, raced.data.id, raced.data.updated_at, bodyFields(again.next, agent));
    if (retry.kind === "error") return schemaOrGeneric(retry.error, "actualizar");
    if (retry.kind === "conflict") return { ok: false, status: 409, error: "El análisis cambió mientras se guardaba." };
    return { ok: true, id: raced.data.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: again.preservedDecisions };
  }

  const inserted = await ops
    .from("weekly_reports")
    .insert({ ...fields, owner_id: ownerId, area: payload.area, week_start: payload.weekStart })
    .select("id")
    .single();

  if (inserted.error?.code === "23505") {
    const raced = await readOwned(ops, ownerId, payload.area, payload.weekStart);
    if (raced.error || !raced.data) return schemaOrGeneric(raced.error ?? inserted.error, "leer");
    const racedReport = parseStoredReport(raced.data);
    if (!racedReport) return { ok: false, status: 500, error: "No se pudo leer el análisis." };
    const again = mergeReport(toBody(racedReport), incoming);
    const retry = await writeIfCurrent(ops, ownerId, raced.data.id, raced.data.updated_at, bodyFields(again.next, agent));
    if (retry.kind === "error") return schemaOrGeneric(retry.error, "actualizar");
    if (retry.kind === "conflict") return { ok: false, status: 409, error: "El análisis cambió mientras se guardaba." };
    return { ok: true, id: raced.data.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: again.preservedDecisions };
  }
  if (inserted.error || !inserted.data) return schemaOrGeneric(inserted.error, "insertar");
  return { ok: true, id: inserted.data.id, area: payload.area, week: payload.weekStart, unchanged: false, preservedDecisions: merged.preservedDecisions };
}

export type WriteChangeResult =
  | { ok: true; id: string; area: string; week: string; key: string; unchanged: boolean }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Escribe el resultado de un cambio. No toca `status` ni el resto de la fila.
 * Si la fila se movió entre la lectura y el update, reintenta una vez.
 */
export async function writeChangeResult(
  admin: Admin,
  ownerId: string,
  agent: string,
  payload: ChangeResultPayload,
): Promise<WriteChangeResult> {
  const ops = asWeekly(admin);
  const first = await readOwned(ops, ownerId, payload.area, payload.weekStart);
  if (first.error) return schemaOrGeneric(first.error, "leer");
  if (!first.data) return notFoundReport();

  const applied = applyOnRow(first.data, agent, payload);
  if (!applied.ok) return applied;
  if (applied.unchanged) {
    return { ok: true, id: first.data.id, area: payload.area, week: payload.weekStart, key: payload.key, unchanged: true };
  }

  const wrote = await writeIfCurrent(ops, ownerId, first.data.id, first.data.updated_at, { changes: asJson(applied.changes) });
  if (wrote.kind === "error") return schemaOrGeneric(wrote.error, "actualizar");
  if (wrote.kind === "ok") {
    return { ok: true, id: first.data.id, area: payload.area, week: payload.weekStart, key: payload.key, unchanged: false };
  }

  const second = await readOwned(ops, ownerId, payload.area, payload.weekStart);
  if (second.error) return schemaOrGeneric(second.error, "leer");
  if (!second.data) return notFoundReport();
  const again = applyOnRow(second.data, agent, payload);
  if (!again.ok) return again;
  if (again.unchanged) {
    return { ok: true, id: second.data.id, area: payload.area, week: payload.weekStart, key: payload.key, unchanged: true };
  }
  const retry = await writeIfCurrent(ops, ownerId, second.data.id, second.data.updated_at, { changes: asJson(again.changes) });
  if (retry.kind === "error") return schemaOrGeneric(retry.error, "actualizar");
  if (retry.kind === "conflict") {
    return { ok: false, status: 409, error: "El análisis cambió mientras se guardaba.", code: "conflict" };
  }
  return { ok: true, id: second.data.id, area: payload.area, week: payload.weekStart, key: payload.key, unchanged: false };
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
    .select(REPORT_COLUMNS)
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

type WeeklyOps = ReturnType<typeof asWeekly>;
type ReportUpdate = { changes: Json } | ReturnType<typeof bodyFields>;

function toIncoming(payload: WeeklyPublishPayload) {
  return {
    conclusions: payload.conclusions,
    conclusionStatus: payload.conclusionStatus,
    conclusionResult: payload.conclusionResult,
    metrics: payload.metrics,
    messageStats: payload.messageStats,
    series: payload.series,
    changes: payload.changes,
  };
}

async function readOwned(ops: WeeklyOps, ownerId: string, area: WeeklyAreaId, weekStart: string) {
  return ops.from("weekly_reports").select(REPORT_COLUMNS).eq("owner_id", ownerId).eq("area", area).eq("week_start", weekStart).maybeSingle();
}

async function writeIfCurrent(
  ops: WeeklyOps,
  ownerId: string,
  id: string,
  updatedAt: string,
  fields: ReportUpdate,
): Promise<{ kind: "ok" } | { kind: "conflict" } | { kind: "error"; error: { code?: string; message?: string } | null }> {
  const { data, error } = await ops
    .from("weekly_reports")
    .update(fields)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("updated_at", updatedAt)
    .select("id");
  if (error) return { kind: "error", error };
  if (!data || data.length === 0) return { kind: "conflict" };
  return { kind: "ok" };
}

function applyOnRow(
  row: { changes: Json; area: string; week_start: string; id: string; conclusions: string; conclusion_status: string; conclusion_result: string | null; metrics: Json; message_stats: Json; series: Json; agent: string; published_at: string },
  agent: string,
  payload: ChangeResultPayload,
): { ok: true; unchanged: boolean; changes: WeeklyChange[] } | { ok: false; status: number; error: string; code: string } {
  const parsed = parseStoredReport(row);
  if (!parsed) return { ok: false, status: 500, error: "No se pudo leer el análisis.", code: "unreadable" };
  const index = parsed.changes.findIndex((change) => change.key === payload.key);
  if (index < 0) return { ok: false, status: 404, error: "Ese cambio no está en el análisis.", code: "not_found" };
  const applied = applyAgentResult(parsed.changes[index], {
    resultText: payload.resultText,
    resultMetrics: payload.resultMetrics,
    suggestedStatus: payload.suggestedStatus,
    agent,
    at: new Date().toISOString(),
  });
  if (!applied.ok) {
    const manual = applied.code === "manual_result";
    return {
      ok: false,
      status: 409,
      code: applied.code,
      error: manual
        ? "El resultado lo escribió una persona. No se pisa."
        : "Ese cambio no se puede medir: tiene que estar aprobado, en prueba o medido.",
    };
  }
  const changes = parsed.changes.slice();
  changes[index] = applied.change;
  return { ok: true, unchanged: applied.unchanged, changes };
}

function notFoundReport(): { ok: false; status: number; error: string; code: string } {
  return { ok: false, status: 404, error: "No hay un análisis de esa área en esa semana.", code: "not_found" };
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
