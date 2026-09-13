import { googleMapsProvider } from "./google-maps";
import { instagramProvider } from "./instagram";
import { linkedinProvider } from "./linkedin";
import type { AnyLeadSourceProvider, LeadSource } from "./types";

/**
 * Fuentes que corren como actor de Apify, en orden de implementación (ver
 * CLAUDE.md §9). Sumar una fuente nueva = un archivo acá + una línea abajo.
 * CSV/manual no entra: no lanza una corrida (ver lib/providers/csv.ts).
 */
export const PROVIDERS: AnyLeadSourceProvider[] = [googleMapsProvider, instagramProvider, linkedinProvider];

const REGISTRY = new Map<LeadSource, AnyLeadSourceProvider>(PROVIDERS.map((provider) => [provider.id, provider]));

export function getProvider(source: LeadSource): AnyLeadSourceProvider | null {
  return REGISTRY.get(source) ?? null;
}

export { CSV_PROVIDER_META } from "./csv";
export type { AnyLeadSourceProvider, CriteriaField, LeadSource, LeadSourceProvider, NormalizedLead } from "./types";
