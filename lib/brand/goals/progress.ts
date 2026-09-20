import { addDays, daysBetween } from "./days";

/*
 * Avance hacia la meta de seguidores (Plans/03 §3.13). Pura y sin base: recibe
 * las fotos diarias y devuelve lo que la tarjeta muestra. Los números se
 * calculan acá y no se le piden al modelo.
 *
 * El ritmo sale de las fotos diarias de `brand_account_metrics.followers_count`
 * porque Windsor sólo da el conteo de HOY, y `follower_count_1d` (nuevos por
 * día) llega null mientras la cuenta tenga pocos seguidores.
 */

/** Con menos días de historial no se muestra ritmo: antes que una proyección inventada, un "todavía no". */
export const MIN_HISTORY_DAYS = 14;

/** El ritmo se mide sobre las últimas semanas, no sobre toda la historia: una cuenta que cambió de velocidad tiene que verse. */
export const PACE_WINDOW_DAYS = 28;

/** Más allá de esto la fecha proyectada no informa nada (a este ritmo, "nunca"). */
export const PROJECTION_HORIZON_DAYS = 3650;

/** Una foto del conteo de seguidores. `day` es la fecha UTC (`captured_on`). */
export interface FollowerSnapshot {
  day: string;
  followers: number;
}

export interface GoalDefinition {
  targetFollowers: number;
  baselineFollowers: number;
  /** Fecha UTC de la foto con la que se definió la meta. */
  baselineDate: string;
  /** "YYYY-MM-DD" en horario de Argentina, o null si no tiene plazo. */
  deadline: string | null;
}

export type Projection =
  /** Al ritmo real de las últimas semanas, se llega en esta fecha. */
  | { kind: "FECHA"; date: string }
  /** El ritmo real es cero o negativo: no se llega. */
  | { kind: "ESTANCADO" }
  /** El ritmo es positivo pero llegar llevaría más de PROJECTION_HORIZON_DAYS. */
  | { kind: "LEJOS" };

export interface GoalProgress {
  target: number;
  baseline: number;
  /** Último conteo conocido; null si todavía no hay ninguna foto. */
  current: number | null;
  currentDay: string | null;
  /** Ganados desde que se definió la meta (puede ser negativo). */
  gained: number | null;
  /** Cuánto falta, nunca menos que 0. */
  remaining: number | null;
  /** current / target, acotado a [0, 1]. Es lo que llena el medidor. */
  fraction: number;
  /** current / target en porcentaje, sin acotar por arriba (100+ = meta pasada). */
  percent: number;
  achieved: boolean;

  deadline: string | null;
  /** Días que quedan hasta el plazo; ≤ 0 si ya venció. null sin plazo. */
  daysLeft: number | null;
  /** Seguidores por día que hacen falta para llegar al plazo. null sin plazo, vencido o cumplida. */
  neededPerDay: number | null;

  /** Días entre la primera y la última foto: lo que hay de historial, contando los huecos. */
  historyDays: number;
  /** null hasta juntar MIN_HISTORY_DAYS de historial. */
  pace: { perDay: number; fromDay: string; toDay: string } | null;
  /** null sin ritmo medido, o si no hay nada que proyectar (cumplida). */
  projection: Projection | null;
  /** Ritmo real ≥ ritmo necesario. null si falta alguno de los dos. */
  onTrack: boolean | null;
}

function dedupeByDay(snapshots: FollowerSnapshot[]): FollowerSnapshot[] {
  const byDay = new Map<string, FollowerSnapshot>();
  for (const snapshot of snapshots) byDay.set(snapshot.day, snapshot);
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Ritmo real en seguidores por día. Usa la distancia REAL en días entre las dos
 * fotos y no la cantidad de fotos: si un día no hubo sincronización hay un hueco,
 * y dividir por "n fotos" inflaría el ritmo.
 */
function measurePace(sorted: FollowerSnapshot[]): GoalProgress["pace"] {
  const last = sorted[sorted.length - 1];
  const windowStart = addDays(last.day, -PACE_WINDOW_DAYS);
  const earlier = sorted.slice(0, -1);
  // La foto más reciente que quede a la altura del inicio de la ventana; si toda la
  // historia es más corta que la ventana, la más vieja que haya.
  const from = [...earlier].reverse().find((s) => s.day <= windowStart) ?? earlier[0];
  const span = daysBetween(from.day, last.day);
  if (span <= 0) return null;
  return { perDay: (last.followers - from.followers) / span, fromDay: from.day, toDay: last.day };
}

export function computeGoalProgress(params: {
  goal: GoalDefinition;
  snapshots: FollowerSnapshot[];
  /** El día de hoy en horario de Argentina, para el plazo. */
  today: string;
}): GoalProgress {
  const { goal, today } = params;
  const sorted = dedupeByDay(params.snapshots);
  const latest = sorted.at(-1) ?? null;

  const target = goal.targetFollowers;
  const current = latest?.followers ?? null;
  const achieved = current !== null && current >= target;
  const remaining = current === null ? null : Math.max(target - current, 0);
  const percent = current === null ? 0 : (current / target) * 100;

  const daysLeft = goal.deadline ? daysBetween(today, goal.deadline) : null;
  const neededPerDay =
    remaining !== null && remaining > 0 && daysLeft !== null && daysLeft > 0 ? remaining / daysLeft : null;

  const historyDays = sorted.length >= 2 ? daysBetween(sorted[0].day, sorted[sorted.length - 1].day) : 0;
  const pace = historyDays >= MIN_HISTORY_DAYS ? measurePace(sorted) : null;

  let projection: Projection | null = null;
  if (pace && latest && remaining !== null && remaining > 0) {
    if (pace.perDay <= 0) {
      projection = { kind: "ESTANCADO" };
    } else {
      const daysToGo = Math.ceil(remaining / pace.perDay);
      projection = daysToGo > PROJECTION_HORIZON_DAYS ? { kind: "LEJOS" } : { kind: "FECHA", date: addDays(latest.day, daysToGo) };
    }
  }

  return {
    target,
    baseline: goal.baselineFollowers,
    current,
    currentDay: latest?.day ?? null,
    gained: current === null ? null : current - goal.baselineFollowers,
    remaining,
    fraction: Math.min(Math.max(percent / 100, 0), 1),
    percent,
    achieved,
    deadline: goal.deadline,
    daysLeft,
    neededPerDay,
    historyDays,
    pace,
    projection,
    onTrack: pace && neededPerDay !== null ? pace.perDay >= neededPerDay : null,
  };
}

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "10.000" */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** "0,5 %" — con un decimal, y sin decimal cuando es entero. */
export function formatPercent(percent: number): string {
  return `${oneDecimal.format(percent)} %`;
}

/** "49 de 10.000 · 0,5 %": el número siempre al lado del medidor. */
export function formatProgressLine(current: number, target: number): string {
  return `${formatCount(current)} de ${formatCount(target)} · ${formatPercent((current / target) * 100)}`;
}

/** Seguidores por día: dos decimales por debajo de 10 ("0,07/día"), enteros por encima. */
export function formatPerDay(value: number): string {
  return `${Math.abs(value) < 10 ? twoDecimals.format(value) : oneDecimal.format(value)}/día`;
}

/** "2026-12-31" → "31/12/2026". Sin pasar por Date: correría el día por zona horaria. */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}
