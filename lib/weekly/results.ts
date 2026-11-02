import type { ChangeResultMetric, ReportedUnit, StoredWeeklyReport, WeeklyChange, WeeklyChangeStatus } from "@/lib/weekly/types";
import { formatWeekRange } from "@/lib/weekly/weeks";

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const SAMPLE = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Argentina no tiene horario de verano: el rótulo es siempre UTC-3. */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

const PRIOR_STATUSES = new Set<WeeklyChangeStatus>(["aprobado", "en_prueba", "medido"]);

export interface PriorChangeResults {
  weekStart: string;
  weekLabel: string;
  changes: WeeklyChange[];
}

/** Cambios de la semana anterior que la página nueva puede mostrar. */
export function priorChangeResults(report: StoredWeeklyReport | null | undefined): PriorChangeResults | null {
  if (!report) return null;
  const changes = report.changes.filter((change) => PRIOR_STATUSES.has(change.status) && change.result);
  if (changes.length === 0) return null;
  return {
    weekStart: report.weekStart,
    weekLabel: formatWeekRange(report.weekStart),
    changes,
  };
}

/** Sugerencia que todavía no es el estado guardado. */
export function visibleSuggestion(change: WeeklyChange): WeeklyChangeStatus | null {
  if (!change.suggestedStatus || change.suggestedStatus === change.status) return null;
  return change.suggestedStatus;
}

/** «Automático · mr-pou · dom 01/11 21:00 (UTC-3)» o «Editado a mano». */
export function formatResultOrigin(change: Pick<WeeklyChange, "resultSource" | "resultAgent" | "resultAt">): string | null {
  if (change.resultSource === "manual") return "Editado a mano";
  if (change.resultSource !== "agente") return null;
  const who = change.resultAgent?.trim() || "agente";
  const when = change.resultAt ? formatResultAt(change.resultAt) : null;
  return when ? `Automático · ${who} · ${when}` : `Automático · ${who}`;
}

/** «dom 01/11 21:00 (UTC-3)». Null si la fecha no se puede leer. */
export function formatResultAt(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time - 3 * 60 * 60 * 1000);
  const weekday = WEEKDAYS[shifted.getUTCDay()];
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${weekday} ${day}/${month} ${hour}:${minute} (UTC-3)`;
}

/** «Tasa humana: 8% (26/10) → 12% (02/11), n 25/25». */
export function formatResultMetricLine(metric: ChangeResultMetric): string {
  const before = formatMeasureNumber(metric.before, metric.unit);
  const after = formatMeasureNumber(metric.after, metric.unit);
  let line = `${metric.label}: ${before} (${formatDayMonth(metric.weekBefore)}) → ${after} (${formatDayMonth(metric.weekAfter)})`;
  if (metric.nBefore != null || metric.nAfter != null) {
    const nBefore = metric.nBefore == null ? "—" : SAMPLE.format(metric.nBefore);
    const nAfter = metric.nAfter == null ? "—" : SAMPLE.format(metric.nAfter);
    line += `, n ${nBefore}/${nAfter}`;
  }
  return line;
}

export function formatMeasureNumber(value: number | null, unit: ReportedUnit): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = NUMBER.format(value);
  if (unit === "percent") return `${formatted}%`;
  if (unit === "days") return `${formatted} días`;
  return formatted;
}

export function formatDayMonth(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}`;
}
