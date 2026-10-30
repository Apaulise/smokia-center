/**
 * Áreas del análisis semanal. Para sumar una:
 * 1. Un valor nuevo del enum `weekly_area`, en una migración propia.
 * 2. Una entrada acá. `source` dice de dónde salen los números del CRM.
 *    `report` no tiene CRM: sólo se muestra lo que publica el agente.
 */

export const WEEKLY_AREA_IDS = ["whatsapp", "email", "seguimientos", "instagram", "youtube", "x_threads"] as const;

export type WeeklyAreaId = (typeof WEEKLY_AREA_IDS)[number];

export type WeeklyAreaSource = "messages" | "followups" | "brand" | "report";

export interface WeeklyArea {
  id: WeeklyAreaId;
  label: string;
  source: WeeklyAreaSource;
  /** Canal de `lead_messages` cuando `source` es `messages`. */
  channel?: "WHATSAPP" | "EMAIL";
  /** Plataforma de Marca cuando `source` es `brand`. */
  platform?: "INSTAGRAM" | "YOUTUBE";
}

export const WEEKLY_AREAS: readonly WeeklyArea[] = [
  { id: "whatsapp", label: "Prospección WhatsApp", source: "messages", channel: "WHATSAPP" },
  { id: "email", label: "Prospección por email", source: "messages", channel: "EMAIL" },
  { id: "seguimientos", label: "Seguimientos", source: "followups" },
  { id: "instagram", label: "Instagram", source: "brand", platform: "INSTAGRAM" },
  { id: "youtube", label: "YouTube", source: "brand", platform: "YOUTUBE" },
  { id: "x_threads", label: "X/Threads", source: "report" },
];

const BY_ID = new Map(WEEKLY_AREAS.map((area) => [area.id, area]));

export function isWeeklyArea(value: string): value is WeeklyAreaId {
  return BY_ID.has(value as WeeklyAreaId);
}

export function weeklyArea(id: WeeklyAreaId): WeeklyArea {
  const area = BY_ID.get(id);
  if (!area) throw new Error(`Área semanal desconocida: ${id}`);
  return area;
}
