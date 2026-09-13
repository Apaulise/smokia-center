import type { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type LeadSource = Database["public"]["Enums"]["lead_source"];

/** Lead normalizado que produce cualquier proveedor, antes de mapearlo a la fila de `leads`. */
export interface NormalizedLead {
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  sourceUrl?: string | null;
  externalId?: string | null;
  /** Payload original del item, tal cual lo devolvió el proveedor. */
  raw: unknown;
}

export type CriteriaFieldType = "text" | "number" | "textarea";

/** Describe un campo del formulario de /leads/generar. Sumarlo acá alcanza para que aparezca. */
export interface CriteriaField {
  name: string;
  label: string;
  type: CriteriaFieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  defaultValue?: string | number;
}

/**
 * Una fuente de leads corrida como actor de Apify.
 *
 * CSV/manual queda afuera de esta interfaz a propósito: no lanza una corrida
 * de Apify, así que `buildInput`/`mapItem` no le calzan. Vive en
 * lib/providers/csv.ts con su propia forma.
 */
export interface LeadSourceProvider<Criteria> {
  id: LeadSource;
  label: string;
  description: string;
  /** Puede ser "" cuando no hay un actor por default razonable (ej. LinkedIn). */
  defaultActorId: string;
  criteriaSchema: z.ZodType<Criteria>;
  fields: CriteriaField[];
  buildInput(criteria: Criteria): Record<string, unknown>;
  mapItem(item: unknown): NormalizedLead | null;
  estimateCost(criteria: Criteria): number;
}

/**
 * Forma erasada para listas heterogéneas de proveedores (registry, UI). Cada
 * proveedor concreto sigue siendo `LeadSourceProvider<SuCriteria>`; esto sólo
 * evita que TS pida invarianza exacta al mezclarlos en un mismo array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyLeadSourceProvider = LeadSourceProvider<any>;
