/**
 * Aritmética de días para el objetivo de seguidores (Plans/03 §3.13). Todo
 * trabaja con fechas "YYYY-MM-DD" y días UTC, que es como `captured_on` guarda
 * las fotos diarias: mezclar acá días de Argentina con días UTC correría en un
 * día las ventanas de atribución. La única excepción es el "hoy" que se le pasa
 * a `computeGoalProgress` para el plazo, que sí es el día local del usuario.
 */

const DAY_MS = 86_400_000;

function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** Días completos entre dos fechas; negativo si `to` es anterior a `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(toDayNumber(to) - toDayNumber(from));
}

export function addDays(iso: string, days: number): string {
  return new Date((toDayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** El día UTC de un instante (`timestamptz` de la base o `Date`). */
export function utcDayOf(instant: string | Date): string {
  return new Date(instant).toISOString().slice(0, 10);
}
