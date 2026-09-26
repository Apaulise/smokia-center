import type { Database } from "@/lib/supabase/database.types";

/**
 * Los nueve ángulos comerciales (Plan §1.11, SPA §7), en TypeScript y no en el
 * prompt: el modelo recibe el ángulo ya elegido y el porqué, no la tabla
 * entera para que elija — una tabla de nueve opciones en el prompt es nueve
 * veces la oportunidad de elegir la cómoda.
 */
export type SalesAngle = Database["public"]["Enums"]["lead_sales_angle"];

export const SALES_ANGLES: SalesAngle[] = [
  "FOLLOWUP",
  "BOOKING",
  "NOSHOW",
  "REBOOKING",
  "REACTIVATION",
  "RESPONSE_TIME",
  "OPERATIONS",
  "CRM",
  "REVIEWS",
];

export const ANGLE_LABEL: Record<SalesAngle, string> = {
  FOLLOWUP: "Seguimiento de consultas",
  BOOKING: "Gestión de turnos",
  NOSHOW: "Ausencias a turnos",
  REBOOKING: "Próxima sesión",
  REACTIVATION: "Reactivación de clientes",
  RESPONSE_TIME: "Velocidad de respuesta",
  OPERATIONS: "Carga operativa",
  CRM: "Información desordenada",
  REVIEWS: "Reputación y reseñas",
};

/** La regla de uso de cada ángulo, tal como la fija el SPA §7: por dónde empezar a preguntar, no qué vender. */
export const ANGLE_RULE: Record<SalesAngle, string> = {
  FOLLOWUP: "Consultas que llegan y preguntan, pero nunca reservan — seguimiento manual de interesados.",
  BOOKING: "Gestión de turnos: cómo se agenda, confirma y reprograma hoy.",
  NOSHOW: "Ausencias a turnos ya reservados y la capacidad que se pierde por eso.",
  REBOOKING: "Tratamientos o servicios recurrentes: cómo se agenda la próxima sesión.",
  REACTIVATION: "Clientes o pacientes históricos que no vuelven hace tiempo.",
  RESPONSE_TIME: "Cuánto tardan en contestar una consulta nueva.",
  OPERATIONS: "Carga administrativa del dueño: tareas repetitivas que le comen el día.",
  CRM: "Información de clientes repartida entre chats y planillas, sin un solo lugar.",
  REVIEWS: "Reputación online: reseñas, cómo se piden y cómo se responden.",
};

export function isSalesAngle(value: string): value is SalesAngle {
  return (SALES_ANGLES as string[]).includes(value);
}
