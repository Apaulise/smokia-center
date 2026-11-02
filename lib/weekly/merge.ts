import { storedChange } from "@/lib/weekly/parse";
import type { ChangeResultMetric, WeeklyChange, WeeklyChangeStatus, ReportedMetric, ReportedMessageStat, ReportedPoint } from "@/lib/weekly/types";

/**
 * Republicar la misma semana actualiza el texto y no duplica la fila.
 * El estado que ya decidió una persona (cualquier cosa distinta de pendiente)
 * no vuelve atrás aunque el agente mande otro. Publicar tampoco saca un
 * cambio de pendiente: el status que manda el agente se ignora. Un cambio
 * pendiente que el agente ya no manda se borra; uno decidido se conserva.
 *
 * `measure` se puede completar si faltaba, y corregir mientras el cambio
 * sigue pendiente o aprobado. En prueba, medido o descartado no se reescribe:
 * el arco de la prueba ya quedó fijo. `result` y el resto de `result*` se
 * conservan. Un resultado escrito a mano no se pisa ni en un pendiente.
 */

/** Una vez que la prueba empezó o terminó, la definición de la métrica queda. */
const MEASURE_LOCK = new Set<WeeklyChangeStatus>(["en_prueba", "medido", "descartado"]);

export interface ReportBody {
  conclusions: string;
  conclusionStatus: WeeklyChangeStatus;
  conclusionResult: string | null;
  metrics: ReportedMetric[];
  messageStats: ReportedMessageStat[];
  series: ReportedPoint[];
  changes: WeeklyChange[];
}

export interface IncomingChange {
  key: string;
  title: string;
  detail: string;
  status?: WeeklyChangeStatus;
  result?: string | null;
  measure?: WeeklyChange["measure"];
}

export interface IncomingReport {
  conclusions: string;
  conclusionStatus?: WeeklyChangeStatus;
  conclusionResult?: string | null;
  metrics: ReportedMetric[];
  messageStats: ReportedMessageStat[];
  series: ReportedPoint[];
  changes: IncomingChange[];
}

export interface MergeResult {
  next: ReportBody;
  /** Decisiones ya tomadas que esta publicación no pisó. */
  preservedDecisions: number;
}

export function mergeReport(existing: ReportBody | null, incoming: IncomingReport): MergeResult {
  let preservedDecisions = 0;

  let conclusionStatus: WeeklyChangeStatus = incoming.conclusionStatus ?? existing?.conclusionStatus ?? "pendiente";
  let conclusionResult = cleanResult(incoming.conclusionResult);
  if (conclusionResult === undefined) conclusionResult = existing?.conclusionResult ?? null;
  if (existing && existing.conclusionStatus !== "pendiente") {
    conclusionStatus = existing.conclusionStatus;
    conclusionResult = existing.conclusionResult;
    preservedDecisions += 1;
  }

  const previous = new Map((existing?.changes ?? []).map((change) => [change.key, change]));
  const changes: WeeklyChange[] = [];
  for (const item of incoming.changes) {
    const prior = previous.get(item.key);
    previous.delete(item.key);
    const merged = mergeChange(prior, item);
    if (merged.preserved) preservedDecisions += 1;
    changes.push(merged.change);
  }
  for (const leftover of previous.values()) {
    if (leftover.status === "pendiente") continue;
    preservedDecisions += 1;
    changes.push(storedChange(leftover));
  }

  return {
    next: {
      conclusions: incoming.conclusions,
      conclusionStatus,
      conclusionResult,
      metrics: incoming.metrics,
      messageStats: incoming.messageStats,
      series: incoming.series,
      changes,
    },
    preservedDecisions,
  };
}

export function sameReport(a: ReportBody, b: ReportBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cleanResult(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  const text = value.trim();
  return text ? text : null;
}

function mergeChange(prior: WeeklyChange | undefined, item: IncomingChange): { change: WeeklyChange; preserved: boolean } {
  if (prior && prior.status !== "pendiente") {
    const measure = prior.measure && MEASURE_LOCK.has(prior.status) ? prior.measure : (item.measure ?? prior.measure);
    return {
      preserved: true,
      change: storedChange({ ...prior, title: item.title, detail: item.detail, measure }),
    };
  }

  const manual = prior?.resultSource === "manual";
  const incomingResult = cleanResult(item.result);
  const result = manual ? (prior?.result ?? null) : incomingResult !== undefined ? incomingResult : (prior?.result ?? null);
  const keepProvenance = Boolean(prior) && (manual || result === prior?.result);
  return {
    preserved: false,
    change: storedChange({
      key: item.key,
      title: item.title,
      detail: item.detail,
      status: "pendiente",
      result,
      measure: item.measure ?? prior?.measure,
      resultSource: keepProvenance ? prior?.resultSource : undefined,
      resultAgent: keepProvenance ? prior?.resultAgent : undefined,
      resultAt: keepProvenance ? prior?.resultAt : undefined,
      resultMetrics: keepProvenance ? prior?.resultMetrics : undefined,
      suggestedStatus: keepProvenance ? prior?.suggestedStatus : undefined,
    }),
  };
}

export interface AgentResultInput {
  resultText: string;
  resultMetrics?: ChangeResultMetric[];
  suggestedStatus?: WeeklyChangeStatus | null;
  agent: string;
  at: string;
}

export type ApplyAgentResult =
  | { ok: true; change: WeeklyChange; unchanged: boolean }
  | { ok: false; code: "not_measurable" | "manual_result" };

/**
 * Escribe el resultado medido. No cambia `status`: sólo `suggestedStatus`.
 * Un resultado manual no se pisa. Los mismos valores devuelven `unchanged`
 * y no mueven `resultAt`.
 */
export function applyAgentResult(change: WeeklyChange, input: AgentResultInput): ApplyAgentResult {
  if (change.status !== "aprobado" && change.status !== "en_prueba" && change.status !== "medido") {
    return { ok: false, code: "not_measurable" };
  }
  if (change.resultSource === "manual") return { ok: false, code: "manual_result" };

  const text = input.resultText.trim();
  const next = storedChange({
    key: change.key,
    title: change.title,
    detail: change.detail,
    status: change.status,
    result: text ? text : null,
    measure: change.measure,
    resultSource: "agente",
    resultAgent: input.agent,
    resultAt: input.at,
    resultMetrics: input.resultMetrics === undefined ? change.resultMetrics : input.resultMetrics,
    suggestedStatus: input.suggestedStatus === undefined ? (change.suggestedStatus ?? null) : input.suggestedStatus,
  });

  if (sameResultBody(change, next)) return { ok: true, change: storedChange(change), unchanged: true };
  return { ok: true, change: next, unchanged: false };
}

/** Lo que guarda la pantalla. Conserva las métricas y, si acepta la sugerencia, la borra. */
export function applyManualReview(
  change: WeeklyChange,
  input: { status: WeeklyChangeStatus; result: string | null; at: string },
): WeeklyChange {
  const accepted = change.suggestedStatus != null && change.suggestedStatus === input.status;
  return storedChange({
    key: change.key,
    title: change.title,
    detail: change.detail,
    status: input.status,
    result: input.result,
    measure: change.measure,
    resultSource: "manual",
    resultAt: input.at,
    resultMetrics: change.resultMetrics,
    suggestedStatus: accepted ? null : (change.suggestedStatus ?? null),
  });
}

/** Ya estaba escrito a mano y ni el estado, ni el texto, ni las métricas, ni la sugerencia cambiaron. */
export function isSameManualReview(current: WeeklyChange, next: WeeklyChange): boolean {
  if (current.resultSource !== "manual") return false;
  return sameResultBody(current, next);
}

function sameResultBody(current: WeeklyChange, next: WeeklyChange): boolean {
  const before = storedChange(current);
  const after = storedChange(next);
  delete before.resultAt;
  delete after.resultAt;
  return JSON.stringify(before) === JSON.stringify(after);
}
