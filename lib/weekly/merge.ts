import type { WeeklyChange, WeeklyChangeStatus, ReportedMetric, ReportedMessageStat, ReportedPoint } from "@/lib/weekly/types";

/**
 * Republicar la misma semana actualiza el texto y no duplica la fila.
 * El estado que ya decidió una persona (cualquier cosa distinta de pendiente)
 * no vuelve atrás aunque el agente mande otro. Un cambio pendiente que el
 * agente ya no manda se borra; uno decidido se conserva.
 */

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
    if (prior && prior.status !== "pendiente") {
      preservedDecisions += 1;
      changes.push({ ...item, status: prior.status, result: prior.result });
      continue;
    }
    const result = cleanResult(item.result);
    changes.push({
      key: item.key,
      title: item.title,
      detail: item.detail,
      status: item.status ?? prior?.status ?? "pendiente",
      result: result !== undefined ? result : (prior?.result ?? null),
    });
  }
  for (const leftover of previous.values()) {
    if (leftover.status === "pendiente") continue;
    preservedDecisions += 1;
    changes.push(leftover);
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
