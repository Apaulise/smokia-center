import type { WeeklyAreaId } from "@/lib/weekly/areas";

export const WEEKLY_CHANGE_STATUSES = ["pendiente", "aprobado", "en_prueba", "descartado", "medido"] as const;
export type WeeklyChangeStatus = (typeof WEEKLY_CHANGE_STATUSES)[number];

export const REPORTED_UNITS = ["count", "percent", "days"] as const;
export type ReportedUnit = (typeof REPORTED_UNITS)[number];

/** Por debajo de esto la tasa se muestra con el aviso de muestra chica. */
export const SMALL_SAMPLE_N = 8;

/**
 * Una respuesta humana es positiva si pide reunión o el interés es al menos
 * este valor (escala 0–10 del análisis), y no quedó descalificada.
 */
export const POSITIVE_INTEREST = 7;

export interface ReportedMetric {
  key: string;
  label: string;
  value: number | null;
  unit: ReportedUnit;
  note: string | null;
}

export interface ReportedMessageStat {
  type: string;
  variant: string | null;
  sent: number;
  realReplies: number | null;
  autoReplies: number | null;
  positive: number | null;
}

export interface ReportedPoint {
  day: string;
  sent: number | null;
  realReplies: number | null;
}

export interface WeeklyChange {
  key: string;
  title: string;
  detail: string;
  status: WeeklyChangeStatus;
  result: string | null;
}

export interface StoredWeeklyReport {
  id: string;
  area: WeeklyAreaId;
  weekStart: string;
  conclusions: string;
  conclusionStatus: WeeklyChangeStatus;
  conclusionResult: string | null;
  metrics: ReportedMetric[];
  messageStats: ReportedMessageStat[];
  series: ReportedPoint[];
  changes: WeeklyChange[];
  agent: string;
  publishedAt: string;
}

export type WeeklySource = "crm" | "reporte";

export interface WeeklyKpi {
  key: string;
  label: string;
  /** Texto ya formateado. "—" cuando no hay dato: no es un cero. */
  display: string;
  delta: string | null;
  trend: "up" | "down" | "neutral";
  muted: boolean;
  signal: boolean;
  source: WeeklySource;
}

export interface WeeklyChartSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface WeeklyChart {
  title: string;
  description: string;
  source: WeeklySource;
  points: { day: string; values: Record<string, number | null> }[];
  series: WeeklyChartSeries[];
}

export interface WeeklyTableColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface WeeklyTableRow {
  key: string;
  cells: Record<string, string>;
  /** Aviso junto al n. Null si la muestra alcanza. */
  sampleNote: string | null;
}

export interface WeeklyTable {
  source: WeeklySource;
  caption: string;
  columns: WeeklyTableColumn[];
  rows: WeeklyTableRow[];
}

export interface WeeklyPageModel {
  area: WeeklyAreaId;
  areaLabel: string;
  weekStart: string;
  weekLabel: string;
  weeks: { value: string; label: string }[];
  schemaReady: boolean;
  /** La lectura del reporte falló por algo distinto a "falta la migración". */
  reportError: string | null;
  /** La lectura del CRM falló. En ese caso no se muestran ceros. */
  crmError: string | null;
  /** Hay cuenta de Marca conectada. Null si el área no usa Marca. */
  brandConnected: boolean | null;
  truncated: boolean;
  definition: string | null;
  kpis: WeeklyKpi[];
  charts: WeeklyChart[];
  table: WeeklyTable | null;
  /** Respuestas de la semana que no se pudieron atar a un envío de esa semana. */
  unattributedNote: string | null;
  /** Métricas que informó el agente, aparte de las del CRM. */
  reportedKpis: WeeklyKpi[];
  report: StoredWeeklyReport | null;
  /** No hay números medidos ni texto publicado. */
  empty: boolean;
}
