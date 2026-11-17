import type { Database } from "@/lib/supabase/database.types";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

/** Plan §1.5. */
export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "AGENDADA",
  "CONFIRMADA",
  "REALIZADA",
  "NO_ASISTIO",
  "CANCELADA",
];

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  AGENDADA: "Agendada",
  CONFIRMADA: "Confirmada",
  REALIZADA: "Realizada",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada",
};

