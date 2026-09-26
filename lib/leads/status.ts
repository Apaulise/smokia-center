import type { BadgeTone } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type LeadActivityType = Database["public"]["Enums"]["lead_activity_type"];

/**
 * Orden del pipeline de 17 estados (Plan §1.8, SPA §17). Kanban (agrupado en
 * STAGE_GROUP) y los `<select>` de la tabla y la ficha usan este orden.
 * AUTORESPUESTA nunca cuenta como respuesta humana; AHORA_NO no es
 * CERRADO_PERDIDO (SPA §16).
 */
export const LEAD_STATUSES: LeadStatus[] = [
  "NUEVO",
  "LISTO",
  "CONTACTADO",
  "AUTORESPUESTA",
  "RESPONDIO",
  "DIAGNOSTICO",
  "CALIFICADO",
  "INTERESADO",
  "REUNION_PROPUESTA",
  "REUNION_AGENDADA",
  "REUNION_REALIZADA",
  "PROPUESTA_ENVIADA",
  "CERRADO_GANADO",
  "AHORA_NO",
  "SEGUIMIENTO",
  "CERRADO_PERDIDO",
  "DESCARTADO",
];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NUEVO: "Nuevo",
  LISTO: "Listo para contactar",
  CONTACTADO: "Contactado",
  AUTORESPUESTA: "Autorespuesta",
  RESPONDIO: "Respondió",
  DIAGNOSTICO: "Diagnóstico",
  CALIFICADO: "Calificado",
  INTERESADO: "Interesado",
  REUNION_PROPUESTA: "Reunión propuesta",
  REUNION_AGENDADA: "Reunión agendada",
  REUNION_REALIZADA: "Reunión realizada",
  PROPUESTA_ENVIADA: "Propuesta enviada",
  CERRADO_GANADO: "Cerrado ganado",
  AHORA_NO: "Ahora no",
  SEGUIMIENTO: "En seguimiento",
  CERRADO_PERDIDO: "Cerrado perdido",
  DESCARTADO: "Descartado",
};

export const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  NUEVO: "neutral",
  LISTO: "neutral",
  CONTACTADO: "cyan",
  AUTORESPUESTA: "cyan",
  RESPONDIO: "cyan",
  DIAGNOSTICO: "violet",
  CALIFICADO: "violet",
  INTERESADO: "violet",
  REUNION_PROPUESTA: "violet",
  REUNION_AGENDADA: "violet",
  REUNION_REALIZADA: "violet",
  PROPUESTA_ENVIADA: "violet",
  CERRADO_GANADO: "positive",
  AHORA_NO: "warning",
  SEGUIMIENTO: "warning",
  CERRADO_PERDIDO: "danger",
  DESCARTADO: "danger",
};

export const ACTIVITY_LABEL: Record<LeadActivityType, string> = {
  NOTA: "Nota",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LLAMADA: "Llamada",
  CAMBIO_ESTADO: "Cambio de estado",
  REUNION: "Reunión",
};

/**
 * Agrupación gruesa para el Kanban (Plan §1.8): 17 columnas son inusables
 * para arrastrar. El estado fino (los 17) sigue siendo el que usan el modelo
 * y las métricas; esto es sólo para la vista de tablero.
 *
 * AHORA_NO va en "En conversación" y no en "Cierre": SPA §16 es explícito en
 * que no es un lead perdido, así que agruparlo con los estados terminales
 * mentiría visualmente sobre su naturaleza. PROPUESTA_ENVIADA va con
 * "Reunión": es la continuación natural de una reunión ya sucedida, no un
 * estado terminal como los de "Cierre".
 */
export const STAGE_GROUPS = [
  "Sin contactar",
  "Contactado",
  "En conversación",
  "Calificado",
  "Reunión",
  "Cierre",
] as const;

export type StageGroup = (typeof STAGE_GROUPS)[number];

export const STAGE_GROUP: Record<StageGroup, LeadStatus[]> = {
  "Sin contactar": ["NUEVO", "LISTO"],
  Contactado: ["CONTACTADO", "AUTORESPUESTA"],
  "En conversación": ["RESPONDIO", "DIAGNOSTICO", "INTERESADO", "SEGUIMIENTO", "AHORA_NO"],
  Calificado: ["CALIFICADO"],
  Reunión: ["REUNION_PROPUESTA", "REUNION_AGENDADA", "REUNION_REALIZADA", "PROPUESTA_ENVIADA"],
  Cierre: ["CERRADO_GANADO", "CERRADO_PERDIDO", "DESCARTADO"],
};

export function stageGroupOf(status: LeadStatus): StageGroup {
  for (const group of STAGE_GROUPS) {
    if (STAGE_GROUP[group].includes(status)) return group;
  }
  return "Sin contactar";
}
