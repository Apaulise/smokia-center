import { z } from "zod";

import type { CriteriaField, LeadSourceProvider } from "./types";
import { asRecord, firstString } from "./utils";

const criteriaSchema = z.object({
  companyUrls: z.string().trim().min(5, "Pegá al menos una URL de empresa de LinkedIn."),
});

type Criteria = z.infer<typeof criteriaSchema>;

const fields: CriteriaField[] = [
  {
    name: "companyUrls",
    label: "URLs de empresas",
    type: "textarea",
    placeholder: "https://www.linkedin.com/company/...\nhttps://www.linkedin.com/company/...",
    helpText:
      "Una por línea. La mayoría de los actores de LinkedIn buscan por URL de empresa, no por zona.",
    required: true,
  },
];

// Muy variable según el actor configurado. Estimado grosero por URL cargada.
const COST_PER_URL = 0.03;

function parseUrls(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export const linkedinProvider: LeadSourceProvider<Criteria> = {
  id: "LINKEDIN",
  label: "LinkedIn",
  description:
    "El más frágil y caro: la mayoría de los actores piden URLs de empresa, no búsqueda por zona. El actor se configura en Configuración porque cambia seguido.",
  // Sin default razonable: se configura por usuario en /configuracion.
  defaultActorId: "",
  criteriaSchema,
  fields,

  buildInput(criteria) {
    return { startUrls: parseUrls(criteria.companyUrls).map((url) => ({ url })) };
  },

  mapItem(raw) {
    const item = asRecord(raw);
    if (!item) return null;

    const name = firstString(item, ["companyName", "name", "title"]);
    if (!name) return null;

    return {
      name,
      phone: null,
      email: null,
      website: firstString(item, ["website"]),
      address: firstString(item, ["address"]),
      city: firstString(item, ["city"]),
      region: null,
      country: firstString(item, ["country"]),
      latitude: null,
      longitude: null,
      rating: null,
      reviewsCount: null,
      instagramUrl: null,
      linkedinUrl: firstString(item, ["url", "linkedinUrl"]),
      sourceUrl: firstString(item, ["url"]),
      externalId: firstString(item, ["companyId"]),
      raw: item,
    };
  },

  estimateCost(criteria) {
    return parseUrls(criteria.companyUrls).length * COST_PER_URL;
  },
};
