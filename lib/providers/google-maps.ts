import { z } from "zod";

import type { CriteriaField, LeadSourceProvider } from "./types";
import { asRecord, firstNumber, firstString } from "./utils";

const criteriaSchema = z.object({
  rubro: z.string().trim().min(2, "Ingresá el rubro a buscar."),
  zona: z.string().trim().min(2, "Ingresá la zona (ciudad, barrio)."),
  maxResults: z.coerce
    .number()
    .int("Tiene que ser un número entero.")
    .min(1, "Mínimo 1 resultado.")
    .max(500, "Máximo 500 por corrida."),
});

type Criteria = z.infer<typeof criteriaSchema>;

const fields: CriteriaField[] = [
  { name: "rubro", label: "Qué buscar", type: "text", placeholder: "Peluquerías", required: true },
  { name: "zona", label: "Zona", type: "text", placeholder: "Palermo, CABA", required: true },
  {
    name: "maxResults",
    label: "Cantidad máxima",
    type: "number",
    defaultValue: 20,
    helpText: "Apify cobra por resultado. Empezá chico (5–20) para probar.",
    required: true,
  },
];

// compass/crawler-google-places: desde ~US$1.50 cada 1000 lugares.
const COST_PER_1000 = 1.5;

export const googleMapsProvider: LeadSourceProvider<Criteria> = {
  id: "GOOGLE_MAPS",
  label: "Google Maps",
  description:
    "El motor real de \"rubro + zona\". Nombre, dirección, teléfono, web y rating. Es el único que mapea 1:1 con el pedido original.",
  defaultActorId: "compass/crawler-google-places",
  criteriaSchema,
  fields,

  buildInput(criteria) {
    return {
      searchStringsArray: [criteria.rubro],
      locationQuery: criteria.zona,
      maxCrawledPlacesPerSearch: criteria.maxResults,
      language: "es",
      skipClosedPlaces: false,
    };
  },

  mapItem(raw) {
    const item = asRecord(raw);
    if (!item) return null;

    const name = firstString(item, ["title", "name"]);
    if (!name) return null;

    const location = asRecord(item.location);

    return {
      name,
      phone: firstString(item, ["phoneUnformatted", "phone"]),
      email: null,
      website: firstString(item, ["website"]),
      address: firstString(item, ["address"]),
      city: firstString(item, ["city"]),
      region: firstString(item, ["state"]),
      country: firstString(item, ["countryCode", "country"]),
      latitude: location ? firstNumber(location, ["lat"]) : firstNumber(item, ["latitude"]),
      longitude: location ? firstNumber(location, ["lng"]) : firstNumber(item, ["longitude"]),
      rating: firstNumber(item, ["totalScore", "rating"]),
      reviewsCount: firstNumber(item, ["reviewsCount"]),
      instagramUrl: null,
      linkedinUrl: null,
      sourceUrl: firstString(item, ["url", "googleMapsUrl"]),
      externalId: firstString(item, ["placeId"]),
      raw: item,
    };
  },

  estimateCost(criteria) {
    return (criteria.maxResults / 1000) * COST_PER_1000;
  },
};
