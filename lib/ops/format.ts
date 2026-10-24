const TZ = "America/Argentina/Buenos_Aires";

const updatedAtFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const atFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatUpdatedAt(date = new Date()): string {
  return updatedAtFormatter.format(date);
}

/** "23/10 14:20", en horario de Argentina. */
export function formatOpsAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return atFormatter.format(date).replace(",", "");
}

export function monthLabel(date = new Date()): string {
  return date.toLocaleDateString("es-AR", { month: "long", timeZone: TZ }).toUpperCase();
}

/** Semana ISO del calendario de Argentina, para el eyebrow del Auditor. */
export function currentIsoWeekLabel(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = parts.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `SEMANA ${week}`;
}
