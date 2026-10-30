import type { StatusTemperatureGroup } from "@/lib/leads/status";

import type { WeeklyChangeStatus } from "./types";

export const WEEKLY_STATUS_LABEL: Record<WeeklyChangeStatus, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  en_prueba: "En prueba",
  descartado: "Descartado",
  medido: "Medido",
};

export const WEEKLY_STATUS_GROUP: Record<WeeklyChangeStatus, StatusTemperatureGroup> = {
  pendiente: "caliente",
  aprobado: "curso",
  en_prueba: "curso",
  descartado: "salida",
  medido: "ganado",
};
