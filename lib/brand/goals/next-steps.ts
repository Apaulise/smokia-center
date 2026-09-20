import { MATURATION_DAYS, MIN_BASELINE_SAMPLE } from "@/lib/brand/insights/baseline";
import { WEEKLY_REELS_MAX, WEEKLY_REELS_MIN } from "@/lib/brand/planner/schema";

import { formatIsoDate, formatPerDay, MIN_HISTORY_DAYS, type GoalProgress } from "./progress";

/*
 * "Próximos pasos" (Plans/03 §3.13). Cada paso se CALCULA del estado real y
 * lleva el número que lo justifica: no es una opinión ni un consejo genérico.
 * Si el estado está en orden no aparece nada, y la tarjeta lo dice.
 */

export const MAX_STEPS = 6;

/** Más viejo que esto, el contador de seguidores puede estar desactualizado. */
export const STALE_SYNC_HOURS = 24;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface StepItem {
  id: string;
  title: string;
  kind: string;
  status: string;
  hypothesis: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  postId: string | null;
}

export interface NextStepsInput {
  now: Date;
  goal: GoalProgress | null;
  /** La cuenta de la semana en curso, la misma que muestra el planificador (`summarizeWeek`). */
  week: { reels: number; total: number; variants: number; experiments: number };
  hasWinners: boolean;
  items: StepItem[];
  /** Posts que ya tienen al menos una nota en la base de conocimiento: una conclusión escrita. */
  concludedPostIds: ReadonlySet<string>;
  reelBaseline: { hasBaseline: boolean; matureReels: number };
  competitorOutliers: number;
  /** Piezas que dicen haber salido de una nota de RADAR (`knowledge_id`). */
  piecesFromRadar: number;
  /** `finished_at` de la última sincronización completada. */
  lastSyncAt: string | null;
}

export interface NextStep {
  id: string;
  title: string;
  /** El número o el hecho que lo justifica. */
  detail: string;
  href: string;
  cta: string;
}

const PLANNER = "/marca/planificador";
const PLANNER_WEEK = `${PLANNER}?view=semana`;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function formatAge(hours: number) {
  return hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} días`;
}

/** Los pasos, del más importante al menos, con tope MAX_STEPS. */
export function buildNextSteps(input: NextStepsInput): NextStep[] {
  const { now, goal, week, items } = input;
  const steps: NextStep[] = [];

  // 1 · Ritmo real contra el necesario. Sin historial no se inventa nada: se dice cuánto falta.
  if (goal && !goal.achieved && goal.current !== null) {
    if (!goal.pace) {
      steps.push({
        id: "pace-unknown",
        title: "Todavía no se puede medir el ritmo de seguidores",
        detail: `Hay ${goal.historyDays} de ${MIN_HISTORY_DAYS} días de historial: hacen falta fotos diarias del contador. Abrí la app seguido hasta juntarlos.`,
        href: "/marca",
        cta: "Ver el contador",
      });
    } else if (goal.onTrack === false && goal.neededPerDay !== null && goal.deadline) {
      steps.push({
        id: "pace-behind",
        title: "El ritmo actual no alcanza para llegar al plazo",
        detail: `Estás en ${formatPerDay(goal.pace.perDay)} y para el ${formatIsoDate(goal.deadline)} hacen falta ${formatPerDay(goal.neededPerDay)}.`,
        href: "/marca/analisis",
        cta: "Ver qué repetir",
      });
    } else if (goal.projection?.kind === "ESTANCADO") {
      steps.push({
        id: "pace-flat",
        title: "Los seguidores no están creciendo",
        detail: `El ritmo de las últimas semanas es ${formatPerDay(goal.pace.perDay)}: a este paso no se llega a la meta.`,
        href: "/marca/analisis",
        cta: "Ver qué repetir",
      });
    }
  }

  // 2 · Un contador viejo falsea todo lo demás.
  if (input.lastSyncAt === null) {
    steps.push({
      id: "sync-never",
      title: "Todavía no hay una sincronización completa",
      detail: "Sin ella el contador y las métricas no reflejan Instagram.",
      href: "/marca",
      cta: "Sincronizar",
    });
  } else {
    const ageHours = (now.getTime() - Date.parse(input.lastSyncAt)) / HOUR_MS;
    if (ageHours > STALE_SYNC_HOURS) {
      steps.push({
        id: "sync-stale",
        title: "La sincronización está vieja",
        detail: `La última fue hace ${formatAge(ageHours)}: el contador de seguidores puede estar desactualizado.`,
        href: "/marca",
        cta: "Sincronizar",
      });
    }
  }

  // 3 · La fecha pasó y la pieza no figura publicada: probablemente ya salió y falta decirlo.
  const overdue = items.filter(
    (item) => item.status !== "PUBLICADO" && item.scheduledFor !== null && Date.parse(item.scheduledFor) < now.getTime(),
  );
  if (overdue.length > 0) {
    steps.push({
      id: "overdue-unlinked",
      title: `${plural(overdue.length, "pieza tiene", "piezas tienen")} la fecha pasada sin marcar como publicada`,
      detail: `Si ya la subiste, usá “Ya la publiqué” para vincularla con su post: sin eso no se mide contra su hipótesis. Ej.: “${overdue[0].title}”.`,
      href: PLANNER,
      cta: "Abrir el planificador",
    });
  }

  // 4 · Publicadas, maduras y con hipótesis, pero sin conclusión escrita: el ciclo del SOC queda abierto.
  const matureUntil = now.getTime() - MATURATION_DAYS * DAY_MS;
  const unconcluded = items.filter(
    (item) =>
      item.status === "PUBLICADO" &&
      item.postId !== null &&
      item.hypothesis !== null &&
      item.publishedAt !== null &&
      Date.parse(item.publishedAt) <= matureUntil &&
      !input.concludedPostIds.has(item.postId),
  );
  if (unconcluded.length > 0) {
    const first = unconcluded[0];
    steps.push({
      id: "no-conclusion",
      title: `${plural(unconcluded.length, "pieza publicada", "piezas publicadas")} sin conclusión`,
      detail: `Ya maduró y salió con hipótesis, pero nadie dijo si se sostuvo. Ej.: “${first.title}”. Pedile al chat que la compare y la guarde.`,
      href: first.postId ? `/marca/contenido/${first.postId}` : "/marca/generar",
      cta: "Ver la pieza",
    });
  }

  // 5 · Cadencia.
  if (week.reels < WEEKLY_REELS_MIN) {
    steps.push({
      id: "cadence-low",
      title: "Faltan reels esta semana",
      detail: `Hay ${week.reels} entre publicados y planificados; la cadencia base es ${WEEKLY_REELS_MIN}–${WEEKLY_REELS_MAX}. Faltan ${WEEKLY_REELS_MIN - week.reels}.`,
      href: PLANNER_WEEK,
      cta: "Planificar la semana",
    });
  }

  // 6 · Exploración y explotación (SOC §19): con la semana vacía no hay nada que balancear.
  if (week.total > 0 && week.experiments === 0) {
    steps.push({
      id: "no-exploration",
      title: "Ninguna pieza de la semana es un experimento nuevo",
      detail: `Las ${week.total} piezas son variantes: la exploración no puede llegar a cero (SOC §19).`,
      href: PLANNER_WEEK,
      cta: "Planificar la semana",
    });
  } else if (week.total > 0 && input.hasWinners && week.variants === 0) {
    steps.push({
      id: "no-exploitation",
      title: "Hay ganadores y ninguna variante de uno esta semana",
      detail: `Las ${week.total} piezas son experimentos nuevos: un ganador se repite con variaciones antes de abandonarlo (SOC §19).`,
      href: PLANNER_WEEK,
      cta: "Planificar la semana",
    });
  }

  // 7 · Planificadas sin hipótesis: sin ella el resultado no se puede evaluar después.
  const noHypothesis = items.filter((item) => item.status !== "PUBLICADO" && item.scheduledFor !== null && !item.hypothesis?.trim());
  if (noHypothesis.length > 0) {
    steps.push({
      id: "no-hypothesis",
      title: `${plural(noHypothesis.length, "pieza planificada", "piezas planificadas")} sin hipótesis`,
      detail: `Escribirla antes de grabar es lo que permite decir después si funcionó. Ej.: “${noHypothesis[0].title}”.`,
      href: PLANNER,
      cta: "Abrir el planificador",
    });
  }

  // 8 · Sin baseline de reels no se clasifica ningún resultado.
  if (!input.reelBaseline.hasBaseline) {
    const missing = Math.max(MIN_BASELINE_SAMPLE - input.reelBaseline.matureReels, 1);
    steps.push({
      id: "no-baseline",
      title: "Faltan reels para tener baseline",
      detail: `Hay ${input.reelBaseline.matureReels} con ${MATURATION_DAYS} días o más y hacen falta ${MIN_BASELINE_SAMPLE}: faltan ${missing}. Hasta entonces ningún reel se puede clasificar como ganador o fallido.`,
      href: "/marca/contenido",
      cta: "Ver el contenido",
    });
  }

  // 9 · La competencia encontró algo y nada de lo planificado salió de ahí.
  if (input.competitorOutliers > 0 && input.piecesFromRadar === 0) {
    steps.push({
      id: "outliers-unused",
      title: `${plural(input.competitorOutliers, "outlier de la competencia", "outliers de la competencia")} sin usar`,
      detail: "Ninguna pieza salió de una nota de RADAR. Un outlier ajeno es una hipótesis gratis: mirá qué mecanismo se puede probar.",
      href: "/marca/competencia",
      cta: "Ver la competencia",
    });
  }

  return steps.slice(0, MAX_STEPS);
}

/**
 * Cuántos reels maduros hay: lo que se le pasa a `reelBaseline`. Sólo `REEL` y no
 * `VIDEO`, porque el baseline de §3.11 agrupa por formato exacto.
 */
export function countMatureReels(posts: { kind: string; publishedAt: string | null }[], now: Date): number {
  const matureUntil = now.getTime() - MATURATION_DAYS * DAY_MS;
  return posts.filter((post) => post.kind === "REEL" && post.publishedAt !== null && Date.parse(post.publishedAt) <= matureUntil).length;
}
