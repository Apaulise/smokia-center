import type { WeeklyArea } from "@/lib/weekly/areas";
import type { BrandWeek, FollowUpWeek, MessageTypeRow, ProspectingWeek } from "@/lib/weekly/compute";
import { SMALL_SAMPLE_N, type ReportedMetric, type ReportedMessageStat, type StoredWeeklyReport, type WeeklyChart, type WeeklyKpi, type WeeklyPageModel, type WeeklyTable } from "@/lib/weekly/types";
import { formatWeekRange, weekWindow } from "@/lib/weekly/weeks";

const COUNT = new Intl.NumberFormat("es-AR");
const PERCENT = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
const DAYS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const INK = "var(--color-lm-ink)";
const SIGNAL = "var(--color-lm-signal)";
const INFO = "var(--color-lm-info)";

const CHANNEL_LABEL = { WHATSAPP: "WhatsApp", EMAIL: "Email", INSTAGRAM: "Instagram" } as const;

const PROSPECTING_DEFINITION =
  "Enviados: aperturas confirmadas. Real: el prospecto escribió y el análisis la marcó humana. Automática: autorespuesta. Positiva: humana, sin descalificar, con interés 7 o más o con pedido de reunión. La tasa es reales dividido enviados. La tabla reparte las respuestas que llegaron en la misma semana.";

const FOLLOWUP_DEFINITION =
  "Enviados: seguimientos confirmados. La respuesta cuenta si llegó en la semana, después de ese mensaje y antes del próximo. Agendó y cerró ocurrieron en esa ventana: es lo que pasó después, no la prueba de que el mensaje lo causó. Positiva usa la misma regla que en prospección.";

const BRAND_DEFINITION =
  "Publicados: piezas con fecha en la semana. Seguidores: el último snapshot de esa semana; sin sync no hay número. Alcance e interacciones suman sólo los días que tienen snapshot. En la tabla, el alcance de cada tipo es el acumulado de la pieza al último sync de la semana.";

export interface PresentInput {
  area: WeeklyArea;
  weekStart: string;
  weeks: string[];
  schemaReady: boolean;
  reportError: string | null;
  crmError: string | null;
  truncated: boolean;
  brandConnected: boolean | null;
  prospecting: { current: ProspectingWeek; previous: ProspectingWeek } | null;
  followups: { current: FollowUpWeek; previous: FollowUpWeek } | null;
  brand: { current: BrandWeek; previous: BrandWeek } | null;
  report: StoredWeeklyReport | null;
  previousMetrics: ReportedMetric[];
}

export function presentWeekly(input: PresentInput): WeeklyPageModel {
  const crm = crmBlocks(input);
  const reportedAreMain = input.area.source === "report" && !input.crmError;
  const kpis = reportedAreMain ? reportedKpis(input.report?.metrics ?? [], input.previousMetrics) : crm.kpis;
  const table = crm.table ?? (input.report && input.report.messageStats.length > 0 ? reportedTable(input.report.messageStats) : null);
  const charts = reportedAreMain ? reportedCharts(input.weekStart, input.report) : crm.charts;
  const reportHasText = Boolean(
    input.report &&
      (input.report.conclusions.trim() ||
        input.report.changes.length > 0 ||
        input.report.metrics.length > 0 ||
        input.report.messageStats.length > 0 ||
        input.report.series.length > 0),
  );
  const crmVisible = crm.kpis.length > 0 || crm.table != null || crm.charts.length > 0;

  return {
    area: input.area.id,
    areaLabel: input.area.label,
    weekStart: input.weekStart,
    weekLabel: formatWeekRange(input.weekStart),
    weeks: input.weeks.map((value) => ({ value, label: formatWeekRange(value) })),
    schemaReady: input.schemaReady,
    reportError: input.reportError,
    crmError: input.crmError,
    brandConnected: input.brandConnected,
    truncated: input.truncated,
    definition: input.crmError ? null : definitionFor(input.area),
    kpis,
    charts,
    table,
    unattributedNote: crm.unattributedNote,
    reportedKpis: reportedAreMain ? [] : reportedKpis(input.report?.metrics ?? [], input.previousMetrics),
    report: input.report,
    empty: !input.crmError && !crmVisible && !reportHasText && input.brandConnected !== false,
  };
}

function definitionFor(area: WeeklyArea): string | null {
  if (area.source === "messages") return PROSPECTING_DEFINITION;
  if (area.source === "followups") return FOLLOWUP_DEFINITION;
  if (area.source === "brand") return BRAND_DEFINITION;
  return null;
}

function crmBlocks(input: PresentInput): { kpis: WeeklyKpi[]; charts: WeeklyChart[]; table: WeeklyTable | null; unattributedNote: string | null } {
  if (input.crmError || input.brandConnected === false) {
    return { kpis: [], charts: [], table: null, unattributedNote: null };
  }
  if (input.prospecting) return prospectingBlocks(input.prospecting.current, input.prospecting.previous);
  if (input.followups) return followUpBlocks(input.followups.current, input.followups.previous);
  if (input.brand && input.brandConnected) return brandBlocks(input.area, input.brand.current, input.brand.previous);
  return { kpis: [], charts: [], table: null, unattributedNote: null };
}

function prospectingBlocks(current: ProspectingWeek, previous: ProspectingWeek) {
  const kpis = messageKpis(current.totals, previous.totals);
  const table = messageTable(current.byType, "crm", "De los enviados esta semana. La tasa es respuestas reales sobre n.", true);
  return {
    kpis,
    charts: [activityChart("Por día", "Aperturas confirmadas y respuestas reales que llegaron ese día.", current.daily)],
    table,
    unattributedNote: unattributed(current.unattributedReplies),
  };
}

function followUpBlocks(current: FollowUpWeek, previous: FollowUpWeek) {
  const kpis = messageKpis(current.totals, previous.totals);
  kpis.push(
    countKpi("booked", "Agendaron", current.booked, previous.booked, false),
    countKpi("won", "Cerraron", current.won, previous.won, false),
    daysKpi("median", "Días hasta responder", current.medianDaysToReply, previous.medianDaysToReply, "sin respuestas"),
  );
  if (current.byChannel.length > 1) {
    for (const item of current.byChannel) {
      const before = previous.byChannel.find((row) => row.channel === item.channel)?.sent ?? 0;
      kpis.push(countKpi(`channel-${item.channel}`, CHANNEL_LABEL[item.channel], item.sent, before, false));
    }
  }
  return {
    kpis,
    charts: [activityChart("Por día", "Seguimientos confirmados y respuestas reales que llegaron ese día.", current.daily)],
    table: messageTable(current.byType, "crm", "Por número de seguimiento. La tasa es respuestas reales sobre n.", false),
    unattributedNote: null,
  };
}

function brandBlocks(area: WeeklyArea, current: BrandWeek, previous: BrandWeek) {
  const youtube = area.platform === "YOUTUBE";
  const kpis: WeeklyKpi[] = [
    countKpi("published", "Publicados", current.published, previous.published, true),
    countKpi("followers", "Seguidores", current.followers, previous.followers, false),
    countKpi("new-followers", "Nuevos seguidores", current.newFollowers, previous.newFollowers, false),
    countKpi("reach", "Alcance", current.reach, previous.reach, false),
    countKpi("interactions", "Interacciones", current.interactions, previous.interactions, false),
  ];
  const charts: WeeklyChart[] = [
    {
      title: "Publicados",
      description: "Piezas con fecha en cada día.",
      source: "crm",
      points: current.dailyPublished.map((day) => ({ day: day.day, values: { sent: day.sent } })),
      series: [{ key: "sent", label: "Publicados", color: INK }],
    },
  ];
  if (current.dailyReach.some((day) => day.reach != null)) {
    charts.push({
      title: "Alcance de la cuenta",
      description: "Snapshot del día. Un día sin sync no se dibuja en cero.",
      source: "crm",
      points: current.dailyReach.map((day) => ({ day: day.day, values: { reach: day.reach } })),
      series: [{ key: "reach", label: "Alcance", color: INFO }],
    });
  }
  return {
    kpis,
    charts,
    table: brandTable(current, youtube),
    unattributedNote: null,
  };
}

function messageKpis(current: ProspectingWeek["totals"], previous: ProspectingWeek["totals"]): WeeklyKpi[] {
  const kpis: WeeklyKpi[] = [
    countKpi("sent", "Enviados", current.sent, previous.sent, true),
    countKpi("real", "Respuestas reales", current.realReplies, previous.realReplies, true),
    countKpi("auto", "Automáticas", current.autoReplies, previous.autoReplies, true),
    rateKpi("rate", "Tasa de respuesta", rate(current.realReplies, current.sent), rate(previous.realReplies, previous.sent), current.sent === 0 ? "sin enviados" : "sin dato", true),
    countKpi("positive", "Positivas", current.positive, previous.positive, true),
    rateKpi(
      "positive-rate",
      "Tasa positivas",
      rate(current.positive, current.realReplies),
      rate(previous.positive, previous.realReplies),
      current.realReplies === 0 ? "sin respuestas reales" : "sin dato",
      false,
    ),
  ];
  if (current.unclassifiedReplies > 0 || previous.unclassifiedReplies > 0) {
    kpis.splice(3, 0, countKpi("unknown", "Sin clasificar", current.unclassifiedReplies, previous.unclassifiedReplies, true));
  }
  return kpis;
}

function reportedKpis(metrics: ReportedMetric[], previous: ReportedMetric[]): WeeklyKpi[] {
  return metrics.map((metric, index) => {
    const before = previous.find((item) => item.key === metric.key) ?? null;
    const pair =
      metric.unit === "percent"
        ? rateKpi(metric.key, metric.label, metric.value == null ? null : metric.value / 100, before?.value == null ? null : before.value / 100, "sin dato", index === 0)
        : metric.unit === "days"
          ? daysKpi(metric.key, metric.label, metric.value, before?.value ?? null)
          : countKpi(metric.key, metric.label, metric.value, before?.value ?? null, false);
    const kpi: WeeklyKpi = { ...pair, key: metric.key, label: metric.label, source: "reporte", signal: index === 0 && pair.display !== "—" };
    if (metric.note) return { ...kpi, delta: metric.note, trend: "neutral" };
    return kpi;
  });
}

function reportedCharts(weekStart: string, report: StoredWeeklyReport | null): WeeklyChart[] {
  if (!report || report.series.length === 0) return [];
  const byDay = new Map(report.series.map((point) => [point.day, point]));
  const points = weekWindow(weekStart).days.map((day) => {
    const point = byDay.get(day);
    return { day, values: { sent: point?.sent ?? null, realReplies: point?.realReplies ?? null } };
  });
  const hasSent = points.some((point) => point.values.sent != null);
  const hasReplies = points.some((point) => point.values.realReplies != null);
  const series = [
    hasSent ? { key: "sent", label: "Enviados", color: INK } : null,
    hasReplies ? { key: "realReplies", label: "Respuestas reales", color: SIGNAL, dashed: true } : null,
  ].filter((item): item is WeeklyChart["series"][number] => item != null);
  if (series.length === 0) return [];
  return [
    {
      title: "Por día",
      description: "Lo que informó el agente. Un día que no mandó no se dibuja en cero.",
      source: "reporte",
      points,
      series,
    },
  ];
}

function activityChart(title: string, description: string, daily: { day: string; sent: number; realReplies: number }[]): WeeklyChart {
  return {
    title,
    description,
    source: "crm",
    points: daily.map((day) => ({ day: day.day, values: { sent: day.sent, realReplies: day.realReplies } })),
    series: [
      { key: "sent", label: "Enviados", color: INK },
      { key: "realReplies", label: "Respuestas reales", color: SIGNAL, dashed: true },
    ],
  };
}

function messageTable(rows: MessageTypeRow[], source: "crm" | "reporte", caption: string, withVariant: boolean): WeeklyTable | null {
  if (rows.length === 0) return null;
  const columns = [
    { key: "type", label: "Tipo" },
    withVariant ? { key: "variant", label: "Variante" } : null,
    { key: "n", label: "n", numeric: true },
    { key: "real", label: "Reales", numeric: true },
    { key: "auto", label: "Automáticas", numeric: true },
    { key: "positive", label: "Positivas", numeric: true },
    { key: "rate", label: "Tasa", numeric: true },
  ].filter((column): column is WeeklyTable["columns"][number] => column != null);
  return {
    source,
    caption,
    columns,
    rows: rows.map((row) => ({
      key: row.key,
      sampleNote: sampleNote(row.sent),
      cells: {
        type: row.typeLabel,
        variant: row.variantLabel ?? "—",
        n: formatCount(row.sent),
        real: formatCount(row.realReplies),
        auto: formatCount(row.autoReplies),
        positive: formatCount(row.positive),
        rate: formatRate(rate(row.realReplies, row.sent)),
      },
    })),
  };
}

function reportedTable(rows: ReportedMessageStat[]): WeeklyTable {
  return {
    source: "reporte",
    caption: "Informado por el agente. No sale del CRM.",
    columns: [
      { key: "type", label: "Tipo" },
      { key: "variant", label: "Variante" },
      { key: "n", label: "n", numeric: true },
      { key: "real", label: "Reales", numeric: true },
      { key: "auto", label: "Automáticas", numeric: true },
      { key: "positive", label: "Positivas", numeric: true },
      { key: "rate", label: "Tasa", numeric: true },
    ],
    rows: rows.map((row, index) => ({
      key: `${row.type}:${row.variant ?? index}`,
      sampleNote: sampleNote(row.sent),
      cells: {
        type: row.type,
        variant: row.variant ?? "—",
        n: formatCount(row.sent),
        real: row.realReplies == null ? "—" : formatCount(row.realReplies),
        auto: row.autoReplies == null ? "—" : formatCount(row.autoReplies),
        positive: row.positive == null ? "—" : formatCount(row.positive),
        rate: row.realReplies == null ? "—" : formatRate(rate(row.realReplies, row.sent)),
      },
    })),
  };
}

function brandTable(current: BrandWeek, youtube: boolean): WeeklyTable | null {
  if (current.byKind.length === 0) return null;
  const columns = youtube
    ? [
        { key: "type", label: "Tipo" },
        { key: "n", label: "n", numeric: true },
        { key: "views", label: "Vistas", numeric: true },
        { key: "likes", label: "Me gusta", numeric: true },
        { key: "comments", label: "Comentarios", numeric: true },
      ]
    : [
        { key: "type", label: "Tipo" },
        { key: "n", label: "n", numeric: true },
        { key: "reach", label: "Alcance", numeric: true },
        { key: "likes", label: "Me gusta", numeric: true },
        { key: "comments", label: "Comentarios", numeric: true },
        { key: "saved", label: "Guardados", numeric: true },
      ];
  return {
    source: "crm",
    caption: "Acumulado al último sync dentro de la semana. Si a una pieza le falta el snapshot, el total lo aclara.",
    columns,
    rows: current.byKind.map((row) => ({
      key: row.key,
      sampleNote: sampleNote(row.sent),
      cells: {
        type: row.typeLabel,
        n: formatCount(row.sent),
        reach: metricCell(row.reach, row.measured, row.sent),
        views: metricCell(row.views, row.measured, row.sent),
        likes: metricCell(row.likes, row.measured, row.sent),
        comments: metricCell(row.comments, row.measured, row.sent),
        saved: metricCell(row.saved, row.measured, row.sent),
      },
    })),
  };
}

function metricCell(value: number | null, measured: number, total: number): string {
  if (value == null) return "—";
  const formatted = formatCount(value);
  if (measured < total) return `${formatted} · ${measured}/${total}`;
  return formatted;
}

function sampleNote(n: number): string | null {
  if (n <= 0 || n >= SMALL_SAMPLE_N) return null;
  return `Muestra chica (n = ${formatCount(n)})`;
}

function unattributed(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "1 respuesta de la semana no se ata a un envío de estos días.";
  return `${formatCount(count)} respuestas de la semana no se atan a un envío de estos días.`;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function formatCount(value: number): string {
  return COUNT.format(value);
}

function formatRate(value: number | null): string {
  if (value == null) return "—";
  return PERCENT.format(value);
}

interface Pair {
  display: string;
  delta: string | null;
  trend: "up" | "down" | "neutral";
  muted: boolean;
  signal: boolean;
}

function countKpi(key: string, label: string, current: number | null, previous: number | null, muteZero: boolean): WeeklyKpi {
  const pair = countPair(current, previous, muteZero);
  return { key, label, source: "crm", ...pair };
}

function countPair(current: number | null, previous: number | null, muteZero: boolean): Pair {
  if (current == null) return { display: "—", delta: "sin dato", trend: "neutral", muted: true, signal: false };
  return {
    display: formatCount(current),
    ...signedDelta(current - (previous ?? current), previous == null, (diff) => `${formatCount(Math.abs(diff))}`),
    muted: muteZero && current === 0,
    signal: false,
  };
}

function rateKpi(key: string, label: string, current: number | null, previous: number | null, missing: string, signal: boolean): WeeklyKpi {
  if (current == null) {
    return { key, label, source: "crm", display: "—", delta: missing, trend: "neutral", muted: true, signal: false };
  }
  const diff = previous == null ? null : (current - previous) * 100;
  const delta =
    diff == null
      ? { delta: "sin semana anterior", trend: "neutral" as const }
      : diff === 0
        ? { delta: "igual que la semana anterior", trend: "neutral" as const }
        : {
            delta: `${diff > 0 ? "+" : "−"}${DAYS.format(Math.abs(diff))} pp vs la semana anterior`,
            trend: diff > 0 ? ("up" as const) : ("down" as const),
          };
  return { key, label, source: "crm", display: formatRate(current), ...delta, muted: false, signal };
}

function daysKpi(key: string, label: string, current: number | null, previous: number | null, missing = "sin dato"): WeeklyKpi {
  if (current == null) {
    return { key, label, source: "crm", display: "—", delta: missing, trend: "neutral", muted: true, signal: false };
  }
  return {
    key,
    label,
    source: "crm",
    display: DAYS.format(current),
    ...signedDelta(previous == null ? 0 : current - previous, previous == null, (diff) => DAYS.format(Math.abs(diff))),
    muted: false,
    signal: false,
  };
}

function signedDelta(diff: number, missingPrevious: boolean, formatAbs: (value: number) => string): Pick<Pair, "delta" | "trend"> {
  if (missingPrevious) return { delta: "sin semana anterior", trend: "neutral" };
  if (diff === 0) return { delta: "igual que la semana anterior", trend: "neutral" };
  return {
    delta: `${diff > 0 ? "+" : "−"}${formatAbs(diff)} vs la semana anterior`,
    trend: diff > 0 ? "up" : "down",
  };
}
