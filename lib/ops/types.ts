/** Áreas que reportan tareas. Auditor y Operaciones sólo aparecen en hallazgos. */
export const OPS_WORK_AREAS = ["prospeccion", "ventas", "instagram", "youtube"] as const;
export type OpsWorkArea = (typeof OPS_WORK_AREAS)[number];

export const OPS_AREAS = [...OPS_WORK_AREAS, "operaciones", "auditor"] as const;
export type OpsArea = (typeof OPS_AREAS)[number];

export const OPS_ESTADOS = ["hecho", "pendiente", "bloqueo"] as const;
export type OpsEstado = (typeof OPS_ESTADOS)[number];

export const OPS_DECISIONS = ["pending", "approved", "edited", "skipped"] as const;
export type OpsDecision = (typeof OPS_DECISIONS)[number];

export const OPS_IMPROVEMENT_STATUSES = ["abierta", "aplicada", "descartada"] as const;
export type OpsImprovementStatus = (typeof OPS_IMPROVEMENT_STATUSES)[number];

export const OPS_IMPACTS = ["alto", "medio", "bajo"] as const;
export type OpsImpact = (typeof OPS_IMPACTS)[number];

export const OPS_CHANNELS = ["whatsapp", "email", "instagram"] as const;
export type OpsChannel = (typeof OPS_CHANNELS)[number];

export const OPS_PERIODS = ["7d", "30d"] as const;
export type OpsPeriod = (typeof OPS_PERIODS)[number];

export const AREA_FILTERS = ["todas", ...OPS_WORK_AREAS] as const;
export type OpsAreaFilter = (typeof AREA_FILTERS)[number];

export const ESTADO_FILTERS = ["todo", ...OPS_ESTADOS] as const;
export type OpsEstadoFilter = (typeof ESTADO_FILTERS)[number];

export interface OpsStatusItem {
  id: string;
  area: OpsWorkArea;
  areaLabel: string;
  agent: string;
  title: string;
  detail: string;
  estado: OpsEstado;
  needsOk: boolean;
  at: string;
}

export interface OpsAreaSummary {
  area: OpsWorkArea;
  label: string;
  agents: string;
  done: number;
  pending: number;
  blocked: number;
  percent: number;
}

export interface OpsApprovalView {
  id: string;
  leadId: string | null;
  lead: string;
  channel: OpsChannel;
  channelLabel: string;
  agent: string;
  why: string;
  /** Texto original que mandó el agente. */
  body: string;
  /** Lo que queda a la vista: el texto aprobado, o el borrador si todavía no se decidió. */
  displayBody: string;
  decision: OpsDecision;
  at: string;
}

export interface OpsImprovementItem {
  id: string;
  areaLabel: string;
  title: string;
  body: string;
  impactLabel: string;
  percent: number;
  status: OpsImprovementStatus;
}

export interface OpsRecords {
  schemaReady: boolean;
  readError: string | null;
  items: OpsStatusItem[];
  approvals: OpsApprovalView[];
  /** Hasta tres hallazgos abiertos, los de más impacto primero. */
  openImprovements: OpsImprovementItem[];
  historyImprovements: OpsImprovementItem[];
  pendingCount: number;
  weekLabel: string;
  /** ISO del reporte más reciente, o null si no hay filas. */
  updatedAtIso: string | null;
}

export interface OpsKpiModel {
  contacted: number;
  contactedPrevious: number;
  /** null si todavía no hay un objetivo de contactos. */
  contactedTarget: number | null;
  replies: number;
  meetings: number;
  instagramQueue: number;
  youtubeQueue: number;
  period: OpsPeriod;
  periodDays: number;
}
