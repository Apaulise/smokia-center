import { z } from "zod";

import type { CriteriaField, LeadSourceProvider } from "./types";
import { asRecord, firstString } from "./utils";

const criteriaSchema = z.object({
  hashtags: z.string().trim().min(2, "Ingresá al menos un hashtag."),
  maxResults: z.coerce
    .number()
    .int("Tiene que ser un número entero.")
    .min(1, "Mínimo 1 resultado.")
    .max(200, "Máximo 200 por corrida."),
});

type Criteria = z.infer<typeof criteriaSchema>;

const fields: CriteriaField[] = [
  {
    name: "hashtags",
    label: "Hashtags",
    type: "text",
    placeholder: "peluqueriapalermo, barberiapalermo",
    helpText: "Separados por coma. Aproxima el rubro+zona: Instagram no busca por eso directamente.",
    required: true,
  },
  { name: "maxResults", label: "Cantidad máxima", type: "number", defaultValue: 20, required: true },
];

// apify/instagram-hashtag-scraper: estimado, varía según el actor configurado.
const COST_PER_1000 = 2.3;

export const instagramProvider: LeadSourceProvider<Criteria> = {
  id: "INSTAGRAM",
  label: "Instagram",
  description: "Busca por hashtag o ubicación. Aporta perfiles, no fichas de negocio como Google Maps.",
  defaultActorId: "apify/instagram-hashtag-scraper",
  criteriaSchema,
  fields,

  buildInput(criteria) {
    const hashtags = criteria.hashtags
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean);

    return { hashtags, resultsLimit: criteria.maxResults };
  },

  mapItem(raw) {
    const item = asRecord(raw);
    if (!item) return null;

    const username = firstString(item, ["ownerUsername", "username"]);
    const name = firstString(item, ["ownerFullName", "fullName"]) ?? username;
    if (!name) return null;

    const url = firstString(item, ["url"]) ?? (username ? `https://www.instagram.com/${username}/` : null);

    return {
      name,
      phone: null,
      email: null,
      website: null,
      address: null,
      city: null,
      region: null,
      country: null,
      latitude: null,
      longitude: null,
      rating: null,
      reviewsCount: null,
      instagramUrl: url,
      linkedinUrl: null,
      sourceUrl: url,
      externalId: username,
      raw: item,
    };
  },

  estimateCost(criteria) {
    return (criteria.maxResults / 1000) * COST_PER_1000;
  },
};
