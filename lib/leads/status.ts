import type { BadgeTone } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type LeadActivityType = Database["public"]["Enums"]["lead_activity_type"];

/** Orden del pipeline (Plan §1.1). Kanban y selects de estado usan este orden. */
export const LEAD_STATUSES: LeadStatus[] = [
  "NUEVO",
  "CONTACTADO",
  "RESPONDIO",
  "AGENDADO",
  "PROPUESTA_ENVIADA",
  "CERRADO_GANADO",
  "CERRADO_PERDIDO",
  "DESCARTADO",
];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  RESPONDIO: "Respondió",
  AGENDADO: "Agendado",
  PROPUESTA_ENVIADA: "Propuesta enviada",
  CERRADO_GANADO: "Cerrado ganado",
  CERRADO_PERDIDO: "Cerrado perdido",
  DESCARTADO: "Descartado",
};

export const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  NUEVO: "neutral",
  CONTACTADO: "cyan",
  RESPONDIO: "cyan",
  AGENDADO: "violet",
  PROPUESTA_ENVIADA: "violet",
  CERRADO_GANADO: "positive",
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
