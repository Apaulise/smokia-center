/**
 * Aritmética de calendario para /leads/agenda. Todo el negocio corre en
 * horario de Argentina (UTC-3, sin horario de verano) — igual que el resto
 * de la UI, que ya formatea fechas con la locale "es-AR" a mano.
 *
 * Las fechas de grilla viajan como "YYYY-MM-DD" (fecha calendario, sin hora)
 * por los searchParams y se resuelven a un instante UTC sólo al armar el
 * rango para la consulta a Supabase.
 */

const TZ = "America/Argentina/Buenos_Aires";
const TZ_OFFSET = "-03:00";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Argentina, como "YYYY-MM-DD". `now` existe para poder fijar el día en un test. */
export function todayIso(now = new Date()): string {
  return isoDateFormatter.format(now);
}

/** A qué día calendario (Argentina) corresponde un timestamptz. */
export function isoDateOf(timestamptz: string): string {
  return isoDateFormatter.format(new Date(timestamptz));
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Hora local (Argentina) de un timestamptz, como "HH:mm". */
export function timeOfDay(timestamptz: string): string {
  return timeFormatter.format(new Date(timestamptz));
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function addMonthsIso(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return formatIsoDate(d);
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Lunes de la semana (Argentina) que contiene `iso`. */
export function startOfWeekIso(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d.getUTCDay(); // 0=domingo..6=sábado
  const diff = (dow + 6) % 7; // días desde el lunes
  d.setUTCDate(d.getUTCDate() - diff);
  return formatIsoDate(d);
}

/** Instante UTC de la medianoche local (Argentina) de esa fecha — para el `.gte`/`.lt` de la query. */
export function isoDateToUtcInstant(iso: string): string {
  return new Date(`${iso}T00:00:00${TZ_OFFSET}`).toISOString();
}

/** Los 42 días (6 semanas, lunes a domingo) de la grilla mensual que contiene `monthStartIso`. */
export function monthGridDays(monthStartIso: string): string[] {
  const gridStart = startOfWeekIso(monthStartIso);
  return Array.from({ length: 42 }, (_, i) => addDaysIso(gridStart, i));
}

/** Los 7 días (lunes a domingo) de la semana que contiene `anchorIso`. */
export function weekDays(anchorIso: string): string[] {
  const start = startOfWeekIso(anchorIso);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
}

const DAY_LABELS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function dayLabelShort(iso: string): string {
  const d = parseIsoDate(iso);
  return DAY_LABELS_SHORT[(d.getUTCDay() + 6) % 7];
}

export function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

/** "6 al 12 de mar 2026" para el encabezado de la vista semana. */
export function weekLabel(days: string[]): string {
  const first = parseIsoDate(days[0]);
  const last = parseIsoDate(days[days.length - 1]);
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  const firstLabel = `${first.getUTCDate()}`;
  const lastLabel = sameMonth
    ? `${last.getUTCDate()} de ${MONTH_LABELS[last.getUTCMonth()].toLowerCase()}`
    : `${last.getUTCDate()} de ${MONTH_LABELS[last.getUTCMonth()].toLowerCase()}`;
  const prefix = sameMonth ? firstLabel : `${firstLabel} de ${MONTH_LABELS[first.getUTCMonth()].toLowerCase()}`;
  return `${prefix} al ${lastLabel} de ${last.getUTCFullYear()}`;
}
