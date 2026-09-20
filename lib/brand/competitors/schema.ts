import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type Competitor = Database["public"]["Tables"]["brand_competitors"]["Row"];
export type CompetitorPost = Database["public"]["Tables"]["brand_competitor_posts"]["Row"];

/**
 * El actor que trae las publicaciones de una cuenta. NO es el que usa Leads
 * (`apify/instagram-hashtag-scraper` busca por hashtag): éste recibe la URL de
 * un perfil y devuelve sus publicaciones recientes con likes, comentarios y
 * views. Es una constante y no una configuración: hay un solo actor válido
 * para lo que se le pide.
 */
export const COMPETITOR_ACTOR_ID = "apify/instagram-scraper";

/**
 * Cuánto cobra Apify por cada resultado (publicación) — Plan Free, el peor caso.
 * Es una estimación para mostrar antes de gastar, no una factura. Vive acá con
 * nombre porque cambia con el plan de la cuenta de Apify.
 */
export const COST_PER_1000_RESULTS_USD = 2.7;

/** Tope de cuentas seguidas: "Actualizar todas" multiplica el gasto por esta cantidad. */
export const MAX_COMPETITORS = 20;

export const DEFAULT_RESULTS_LIMIT = 30;
export const MAX_RESULTS_LIMIT = 100;

/** Cuánto puede tardar una corrida antes de darla por perdida y dejar de esperar. */
export const RUN_TIMEOUT_MINUTES = 60;

/** Lo que ya no se vuelve a lanzar mientras haya una corrida vigente: un doble clic no puede cobrar dos veces. */
export const RUN_IN_FLIGHT_MINUTES = 30;

export function estimateRunCostUsd(resultsLimit: number): number {
  return (resultsLimit / 1000) * COST_PER_1000_RESULTS_USD;
}

/** Rutas de instagram.com que no son perfiles: si aparecen donde va el usuario, el link es de una publicación. */
const RESERVED_PATHS = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "tags", "web"]);

const USERNAME = /^[a-z0-9._]{1,30}$/;

/**
 * Acepta lo que la gente pega: `@usuario`, `usuario`, o el link del perfil
 * (`https://www.instagram.com/usuario/?hl=es`). Devuelve el usuario en minúsculas,
 * o null si no parece uno — el link de un reel, por ejemplo, no es una cuenta.
 */
export function parseInstagramUsername(input: string): string | null {
  let value = input.trim();
  if (!value) return null;

  if (/^(https?:\/\/)?(www\.)?instagram\.com\//i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      const first = url.pathname.split("/").filter(Boolean)[0];
      if (!first || RESERVED_PATHS.has(first.toLowerCase())) return null;
      value = first;
    } catch {
      return null;
    }
  }

  const username = value.replace(/^@+/, "").toLowerCase();
  return USERNAME.test(username) ? username : null;
}

/**
 * Cuántas publicaciones trae una corrida. Se usa al sumar una cuenta y al
 * editarla después (§3.14): un solo lugar donde vive el rango, porque es el
 * número que fija el costo.
 */
export const resultsLimitField = z.coerce
  .number()
  .int("Tiene que ser un número entero.")
  .min(1, "Mínimo 1 publicación.")
  .max(MAX_RESULTS_LIMIT, `Máximo ${MAX_RESULTS_LIMIT} publicaciones por corrida.`);

export const UpdateResultsLimitInput = z.object({
  id: z.string().uuid("La cuenta no es válida."),
  resultsLimit: resultsLimitField,
});

export type UpdateResultsLimitInput = z.input<typeof UpdateResultsLimitInput>;

export const AddCompetitorInput = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Ingresá el usuario o el link del perfil.")
    .transform((value, ctx) => {
      const username = parseInstagramUsername(value);
      if (!username) {
        ctx.addIssue({ code: "custom", message: "No parece un usuario de Instagram. Pegá el @usuario o el link del perfil." });
        return z.NEVER;
      }
      return username;
    }),
  resultsLimit: resultsLimitField.default(DEFAULT_RESULTS_LIMIT),
});

export type AddCompetitorInput = z.input<typeof AddCompetitorInput>;
