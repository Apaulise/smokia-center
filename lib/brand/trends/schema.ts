import { z } from "zod";

import { resultsLimitField } from "@/lib/brand/competitors/schema";
import type { Database } from "@/lib/supabase/database.types";

export type TrendSearch = Database["public"]["Tables"]["brand_trend_searches"]["Row"];
export type TrendPost = Database["public"]["Tables"]["brand_trend_posts"]["Row"];

/**
 * NO es el actor de §3.8 (Plans/03 §3.15): se probó primero reusar
 * `apify/instagram-scraper` con `directUrls` a la página del hashtag —el plan
 * lo dejaba como opción principal—, y una corrida real mostró que ese actor
 * devuelve el feed "reciente" del hashtag tal cual, dominado por imágenes y
 * carruseles (24 resultados de #ai, cero reels). `apify/instagram-hashtag-scraper`
 * —el mismo que ya usa Leads en lib/providers/instagram.ts— sí distingue
 * `resultsType: "reels"`, así que el filtro queda del lado del actor y no
 * dependiendo de encontrar un reel de casualidad en el muestreo.
 *
 * Se evaluó cambiar a `apify/instagram-search-scraper` con
 * `searchType: "popular"` (apunta a `instagram.com/popular/<hashtag>`, el feed
 * de lo que ya está pegando fuerte) para resolver que este actor sólo trae
 * contenido reciente. Se descartó: dos corridas reales de prueba fallaron con
 * "blocked by Instagram / zero public details" — ese searchType no es viable
 * hoy. Se vuelve a este actor; el ajuste real quedó del lado del piso de
 * `TREND_MIN_VIEWS`, no del actor.
 */
export const TREND_ACTOR_ID = "apify/instagram-hashtag-scraper";

/** Cuántos hashtags entran en una misma búsqueda. Un tope bajo mantiene la búsqueda enfocada en el nicho. */
export const MAX_TREND_HASHTAGS = 3;

export const DEFAULT_TREND_RESULTS_LIMIT = 30;

/** Cuánto puede tardar una búsqueda antes de darla por perdida. Igual que RUN_TIMEOUT_MINUTES de competidores. */
export const TREND_RUN_TIMEOUT_MINUTES = 60;

/** Una búsqueda vigente no se relanza sola: RUN_IN_FLIGHT_MINUTES de competidores, mismo criterio. */
export const TREND_RUN_IN_FLIGHT_MINUTES = 30;

/**
 * De la cadena que escribe el usuario a una lista de hashtags limpios. Mismo
 * espíritu que el parseo de `lib/providers/instagram.ts` (separado por coma,
 * sin `#`, en minúsculas) y que `parseInstagramUsername` de competitors/schema.ts.
 */
export function parseHashtags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/^#/, "").toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

const hashtagsField = z
  .string()
  .trim()
  .min(1, "Ingresá al menos un hashtag.")
  .transform((value, ctx) => {
    const tags = parseHashtags(value);
    if (tags.length === 0) {
      ctx.addIssue({ code: "custom", message: "Ingresá al menos un hashtag." });
      return z.NEVER;
    }
    if (tags.length > MAX_TREND_HASHTAGS) {
      ctx.addIssue({ code: "custom", message: `Máximo ${MAX_TREND_HASHTAGS} hashtags por búsqueda.` });
      return z.NEVER;
    }
    return tags;
  });

export const SearchTrendsInput = z.object({
  hashtags: hashtagsField,
  resultsLimit: resultsLimitField.default(DEFAULT_TREND_RESULTS_LIMIT),
});

export type SearchTrendsInput = z.input<typeof SearchTrendsInput>;

// ── API oficial de Meta (Plans/03 §3.17) ──────────────────────────────────

/** De dónde salió un reel/post descubierto. Es el enum `trend_source` de la base. */
export type TrendSource = Database["public"]["Enums"]["trend_source"];

/** Tope de Meta: hashtags ÚNICOS que una cuenta puede consultar en 7 días móviles. */
export const META_HASHTAGS_PER_WEEK = 30;

/**
 * Cuántos trae `top_media` por hashtag. La documentación habla de hasta 50, pero
 * en la práctica el endpoint es lento (~1 s por pieza) y rechaza los pedidos
 * grandes: con 50 se pasa del timeout, y con 25 y estos campos Meta contesta
 * "Please reduce the amount of data you're asking for". 10 es lo único que se
 * probó a mano con éxito (Explorer, 2026-10-10). Como `top_media` ya viene
 * ordenado por popularidad, las primeras 10 son lo que importa.
 */
export const META_RESULTS_PER_HASHTAG = 10;

/** Timeout de `top_media`, bastante más holgado que el de una consulta común de la Graph API. */
export const META_TOP_MEDIA_TIMEOUT_MS = 40_000;

/** Cuántos hashtags se consultan a la vez: cada uno son dos llamadas y Meta tarda varios segundos. */
export const META_CONCURRENCY = 3;

export const SearchMetaTrendsInput = z.object({ hashtags: hashtagsField });

export type SearchMetaTrendsInput = z.input<typeof SearchMetaTrendsInput>;
