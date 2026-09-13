import type { LeadSource } from "@/lib/providers/types";

/** Clave en `settings` para el token de Apify. Compartida por queries y actions. */
export const APIFY_KEY_SETTING = "apify_api_key";

/**
 * Clave en `settings` para el actor de Apify configurado por el usuario para
 * una fuente puntual. Sobreescribe el `defaultActorId` del proveedor
 * (lib/providers/*) — necesario en LinkedIn, donde no hay un actor por default.
 */
export function actorOverrideKey(source: LeadSource): string {
  return `apify_actor_${source}`;
}

/**
 * Rubros comunes para sembrar el catálogo de un usuario nuevo. Colores
 * alternan cyan/violeta (manual §9) para que la lista no salga monocroma.
 */
export const DEFAULT_INDUSTRIES: Array<{ name: string; color: string }> = [
  { name: "Gastronomía", color: "#18D6E8" },
  { name: "Salud y belleza", color: "#7C3AED" },
  { name: "Retail", color: "#18D6E8" },
  { name: "Construcción y reformas", color: "#7C3AED" },
  { name: "Profesionales y servicios", color: "#18D6E8" },
  { name: "Inmobiliarias", color: "#7C3AED" },
  { name: "Educación", color: "#18D6E8" },
  { name: "Fitness y deporte", color: "#7C3AED" },
  { name: "Automotriz", color: "#18D6E8" },
  { name: "Turismo y hotelería", color: "#7C3AED" },
];
