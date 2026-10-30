import { z } from "zod";

import { WEEKLY_AREA_IDS } from "@/lib/weekly/areas";
import { automationAgentIdSchema } from "@/lib/automation/agents";
import { REPORTED_UNITS, WEEKLY_CHANGE_STATUSES } from "@/lib/weekly/types";
import { isPublishableWeek, parseWeekStart, weekWindow } from "@/lib/weekly/weeks";

const CHANGE_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const METRIC_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const count = z.number().int().min(0).max(1_000_000);
const status = z.enum(WEEKLY_CHANGE_STATUSES);

const reportedMetric = z.object({
  key: z.string().trim().toLowerCase().regex(METRIC_KEY, "Clave de métrica inválida."),
  label: z.string().trim().min(1).max(80),
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable(),
  unit: z.enum(REPORTED_UNITS).default("count"),
  note: z.string().trim().max(200).nullish().transform((value) => value || null),
});

const reportedStat = z.object({
  type: z.string().trim().min(1).max(80),
  variant: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => {
      if (value == null) return null;
      const text = String(value).trim();
      return text ? text.slice(0, 40) : null;
    }),
  sent: count,
  realReplies: count.nullish().transform((value) => value ?? null),
  autoReplies: count.nullish().transform((value) => value ?? null),
  positive: count.nullish().transform((value) => value ?? null),
});

const reportedPoint = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Día inválido."),
  sent: count.nullish().transform((value) => value ?? null),
  realReplies: count.nullish().transform((value) => value ?? null),
});

const incomingChange = z.object({
  key: z.string().trim().toLowerCase().regex(CHANGE_KEY, "Clave de cambio inválida."),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(2000).default(""),
    status: status.optional(),
    // Ausente no es "borrar": lo resuelve el merge si el cambio ya existía.
    result: z.string().trim().max(2000).nullish(),
  });

export const weeklyPublishPayload = z
  .object({
    agent: automationAgentIdSchema.optional(),
    area: z.enum(WEEKLY_AREA_IDS),
    week: z.string().trim().min(1).max(20),
    conclusions: z.string().trim().max(8000).default(""),
    conclusionStatus: status.optional(),
    conclusionResult: z.string().trim().max(2000).nullish(),
    metrics: z.array(reportedMetric).max(40).default([]),
    messageStats: z.array(reportedStat).max(40).default([]),
    series: z.array(reportedPoint).max(7).default([]),
    changes: z.array(incomingChange).max(30).default([]),
  })
  .superRefine((value, context) => {
    const weekStart = parseWeekStart(value.week);
    if (!weekStart) {
      context.addIssue({ code: "custom", path: ["week"], message: "La semana tiene que ser un lunes (2026-10-26) o una semana ISO (2026-W44)." });
      return;
    }
    if (!isPublishableWeek(weekStart)) {
      context.addIssue({ code: "custom", path: ["week"], message: "Esa semana todavía no empezó." });
    }
    const days = new Set(weekWindow(weekStart).days);
    value.series.forEach((point, index) => {
      if (!days.has(point.day)) {
        context.addIssue({ code: "custom", path: ["series", index, "day"], message: "Ese día no cae en la semana." });
      }
    });
    const metricKeys = new Set<string>();
    value.metrics.forEach((metric, index) => {
      if (metricKeys.has(metric.key)) {
        context.addIssue({ code: "custom", path: ["metrics", index, "key"], message: "Clave de métrica repetida." });
      }
      metricKeys.add(metric.key);
      if (metric.unit === "percent" && metric.value != null && (metric.value < 0 || metric.value > 100)) {
        context.addIssue({ code: "custom", path: ["metrics", index, "value"], message: "Un porcentaje va de 0 a 100." });
      }
    });
    const changeKeys = new Set<string>();
    value.changes.forEach((change, index) => {
      if (changeKeys.has(change.key)) {
        context.addIssue({ code: "custom", path: ["changes", index, "key"], message: "Clave de cambio repetida." });
      }
      changeKeys.add(change.key);
    });
    const hasContent =
      value.conclusions.length > 0 ||
      value.metrics.length > 0 ||
      value.messageStats.length > 0 ||
      value.series.length > 0 ||
      value.changes.length > 0;
    if (!hasContent) {
      context.addIssue({ code: "custom", message: "El análisis no trae texto ni números." });
    }
  })
  .transform((value) => ({
    ...value,
    weekStart: parseWeekStart(value.week) as string,
  }));

export type WeeklyPublishPayload = z.infer<typeof weeklyPublishPayload>;

const listArea = z.enum(WEEKLY_AREA_IDS).optional();

export const weeklyListQuery = z.object({
  area: listArea,
  week: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** camelCase o snake_case, también adentro de las listas. */
export function camelizeWeekly(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(camelizeWeekly);
  if (!input || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camel] = camelizeWeekly(value);
  }
  return out;
}
