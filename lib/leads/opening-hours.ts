import type { Json } from "@/lib/supabase/database.types";

export interface OpeningHoursEntry {
  day: string;
  hours: string;
}

const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
const DAY_INDEX = new Map<string, number>(DAYS.map((day, index) => [day, index]));

/** Ordena y valida los horarios publicados; nunca completa días u horas faltantes. */
export function normalizeOpeningHours(value: unknown): OpeningHoursEntry[] {
  if (!Array.isArray(value)) return [];

  const byDay = new Map<string, string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { day, hours } = entry as Record<string, unknown>;
    if (typeof day !== "string" || typeof hours !== "string") continue;
    const normalizedDay = day.trim().toLocaleLowerCase("es-AR");
    const normalizedHours = hours.trim().replace(/\u202f/g, " ").replace(/\s+to\s+/gi, " a ");
    if (!DAY_INDEX.has(normalizedDay) || !normalizedHours || normalizedHours.length > 120) continue;
    if (!byDay.has(normalizedDay)) byDay.set(normalizedDay, normalizedHours);
  }

  return [...byDay].sort(([a], [b]) => DAY_INDEX.get(a)! - DAY_INDEX.get(b)!)
    .map(([day, hours]) => ({ day, hours }));
}

/** Google Maps/Apify guarda `openingHours` dentro del payload original del lead. */
export function openingHoursFromRaw(raw: Json | null): OpeningHoursEntry[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return normalizeOpeningHours(raw.openingHours);
}
