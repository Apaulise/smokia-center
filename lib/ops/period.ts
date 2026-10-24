import { addDaysIso } from "@/lib/leads/calendar";

import type { OpsPeriod } from "./types";

export function periodDays(period: OpsPeriod): number {
  return period === "7d" ? 7 : 30;
}

/** Ventana inclusive de `days` días calendario que termina en `endInclusive` (YYYY-MM-DD). */
export function rollingWindow(endInclusive: string, days: number): { from: string; to: string } {
  return { from: addDaysIso(endInclusive, -(days - 1)), to: endInclusive };
}

export function sumContacts(series: { day: string; contacts: number }[], from: string, to: string): number {
  return series.filter((point) => point.day >= from && point.day <= to).reduce((sum, point) => sum + point.contacts, 0);
}

/**
 * Objetivo de contactos de la ventana. `contactsPerDay` ya es por día hábil.
 * En 7 días se usa la semana del objetivo; en 30, las semanas hábiles que entran.
 */
export function contactTarget(
  chain: { contactsPerDay: number; contactsPerWeek: number },
  workingDaysPerWeek: number,
  days: number,
): number {
  if (days <= 7) return Math.max(1, chain.contactsPerWeek);
  const weeks = days / 7;
  return Math.max(1, Math.round(chain.contactsPerDay * workingDaysPerWeek * weeks));
}

export function periodDelta(current: number, previous: number, period: OpsPeriod): { text: string; trend: "up" | "down" | "neutral" } {
  const comparedTo = period === "7d" ? "la semana ant." : "el período ant.";
  const diff = current - previous;
  if (diff === 0) return { text: `igual que ${comparedTo}`, trend: "neutral" };
  const arrow = diff > 0 ? "↑" : "↓";
  return { text: `${arrow} ${Math.abs(diff)} vs. ${comparedTo}`, trend: diff > 0 ? "up" : "down" };
}
