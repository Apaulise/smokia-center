import { isoDateOf } from "@/lib/leads/calendar";

import type { PlannerItem } from "./schema";

/** El día del calendario (Argentina) en que cae una pieza: el de la publicación si ya salió, si no el planificado. */
export function plannerDayOf(item: Pick<PlannerItem, "published_at" | "scheduled_for">): string | null {
  const instant = item.published_at ?? item.scheduled_for;
  return instant ? isoDateOf(instant) : null;
}

export interface WeekSummary {
  /** Reels y videos de la semana, publicados o planificados: lo que se compara contra la cadencia base. */
  reels: number;
  /** Todas las piezas de la semana, de cualquier tipo. */
  total: number;
  /** Piezas que descienden de un ganador (`parent_item_id`): explotación. */
  variants: number;
  /** Piezas sin linaje: experimentos nuevos, exploración. */
  experiments: number;
}

/**
 * La cuenta de la semana y su mezcla exploración / explotación (SOC §19). Se
 * calcula sobre las piezas ya cargadas para el calendario, sin otra consulta.
 * Una pieza cuenta con su fecha planificada aunque siga en IDEA: el punto de
 * verlo en la grilla es notar el hueco ANTES de que la semana pase.
 */
export function summarizeWeek(
  items: Pick<PlannerItem, "published_at" | "scheduled_for" | "kind" | "parent_item_id">[],
  weekDays: string[],
): WeekSummary {
  const inWeek = new Set(weekDays);
  const summary: WeekSummary = { reels: 0, total: 0, variants: 0, experiments: 0 };

  for (const item of items) {
    const day = plannerDayOf(item);
    if (!day || !inWeek.has(day)) continue;
    summary.total += 1;
    if (item.kind === "REEL" || item.kind === "VIDEO") summary.reels += 1;
    if (item.parent_item_id) summary.variants += 1;
    else summary.experiments += 1;
  }

  return summary;
}
