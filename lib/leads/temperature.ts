import type { BadgeTone } from "@/components/ui/badge";

/**
 * La temperatura (SPA §10) no es una columna (Plan §1.9): se deriva de
 * `interest_level` en TypeScript. Un valor derivado que se persiste es un
 * valor que tarde o temprano queda desincronizado del que lo origina.
 * Los cortes siguen la escala del SPA §11.
 */
export type LeadTemperature = "FRIO" | "TIBIO" | "CALIENTE" | "MUY_CALIENTE";

export const TEMPERATURE_LABEL: Record<LeadTemperature, string> = {
  FRIO: "Frío",
  TIBIO: "Tibio",
  CALIENTE: "Caliente",
  MUY_CALIENTE: "Muy caliente",
};

export const TEMPERATURE_TONE: Record<LeadTemperature, BadgeTone> = {
  FRIO: "neutral",
  TIBIO: "cyan",
  CALIENTE: "violet",
  MUY_CALIENTE: "positive",
};

export function leadTemperature(interestLevel: number | null): LeadTemperature | null {
  if (interestLevel === null) return null;
  if (interestLevel <= 2) return "FRIO";
  if (interestLevel <= 6) return "TIBIO";
  if (interestLevel <= 8) return "CALIENTE";
  return "MUY_CALIENTE";
}
