import { addDaysIso, isoDateToUtcInstant, startOfWeekIso, todayIso, weekDays } from "@/lib/leads/calendar";

const MONDAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

/** Lunes de la semana en curso, en el calendario de Argentina. */
export function currentWeekStart(now = new Date()): string {
  return startOfWeekIso(todayIso(now));
}

/**
 * Acepta el lunes (`2026-10-26`) o una semana ISO (`2026-W44`).
 * Cualquier otro día del calendario no es una semana: devuelve null.
 */
export function parseWeekStart(input: string): string | null {
  const value = input.trim();
  const iso = ISO_WEEK.exec(value);
  if (iso) {
    const year = Number(iso[1]);
    const week = Number(iso[2]);
    if (week < 1 || week > 53) return null;
    const monday = mondayOfIsoWeek(year, week);
    if (isoWeekYear(monday) !== year) return null;
    return monday;
  }
  if (!MONDAY.test(value)) return null;
  if (startOfWeekIso(value) !== value) return null;
  return value;
}

/** No se publica una semana que todavía no empezó. */
export function isPublishableWeek(weekStart: string, now = new Date()): boolean {
  return weekStart <= currentWeekStart(now);
}

export interface WeekWindow {
  start: string;
  /** Lunes siguiente, exclusivo. */
  end: string;
  startMs: number;
  endMs: number;
  days: string[];
}

export function weekWindow(weekStart: string): WeekWindow {
  const end = addDaysIso(weekStart, 7);
  return {
    start: weekStart,
    end,
    startMs: Date.parse(isoDateToUtcInstant(weekStart)),
    endMs: Date.parse(isoDateToUtcInstant(end)),
    days: weekDays(weekStart),
  };
}

export function instantInWeek(iso: string, window: WeekWindow): boolean {
  const time = Date.parse(iso);
  return !Number.isNaN(time) && time >= window.startMs && time < window.endMs;
}

/** "27 oct – 2 nov 2026", en el calendario de Argentina (las fechas ya son días locales). */
export function formatWeekRange(weekStart: string): string {
  const end = addDaysIso(weekStart, 6);
  const startLabel = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const endLabel = new Date(`${end}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${stripDot(startLabel)} – ${stripDot(endLabel)}`;
}

/** Semanas hacia atrás, la actual primero. `extra` suma lunes que tengan un reporte y queden afuera del rango. */
export function weekOptions(count: number, extra: readonly string[], now = new Date()): string[] {
  const current = currentWeekStart(now);
  const generated = Array.from({ length: count }, (_, index) => addDaysIso(current, -7 * index));
  const seen = new Set(generated);
  const older = extra.filter((week) => parseWeekStart(week) === week && !seen.has(week) && week <= current);
  older.sort((a, b) => (a < b ? 1 : -1));
  return [...generated, ...older];
}

function stripDot(value: string): string {
  return value.replace(/\./g, "");
}

/** Lunes de la semana ISO. El 4 de enero siempre cae en la semana 1. */
function mondayOfIsoWeek(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Dow + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function isoWeekYear(monday: string): number {
  const thursday = new Date(`${monday}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  return thursday.getUTCFullYear();
}
