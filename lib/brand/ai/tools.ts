import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getBrandContentLibrary, getBrandPostMetricsHistory, type ContentSortField } from "@/lib/brand/queries";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const SORT_FIELDS = [
  "published_at",
  "views",
  "reel_avg_watch_time_ms",
  "reel_skip_rate",
  "saved",
  "shares",
  "new_followers",
] as const satisfies readonly ContentSortField[];

const POST_KINDS = ["REEL", "POST", "CARRUSEL", "HISTORIA", "VIDEO", "SHORT"] as const;

const BuscarMisPostsInput = z.object({
  kind: z.enum(POST_KINDS).optional(),
  ordenar_por: z.enum(SORT_FIELDS).optional(),
  ascendente: z.boolean().optional(),
  limite: z.number().int().min(1).max(15).optional(),
});

const MetricasDePostInput = z.object({
  post_id: z.string().uuid(),
});

/**
 * Las dos tools propias del chat (Plans/03 §3.6): buscar contenido real y
 * ver cómo evolucionó una pieza puntual, para que el modelo funde una idea
 * en un post concreto en vez de inventar. El server tool de búsqueda web se
 * agrega aparte, en lib/brand/ai/chat.ts, junto al resto de `tools`.
 */
export const BRAND_CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_mis_posts",
    description:
      "Busca contenido ya publicado en la cuenta conectada, para fundamentar una idea en un post o reel concreto en vez de inventar. Devuelve como máximo 15 piezas.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: POST_KINDS, description: "Filtra por tipo de pieza. Omitir para no filtrar." },
        ordenar_por: { type: "string", enum: SORT_FIELDS, description: "Métrica por la que ordenar los resultados." },
        ascendente: {
          type: "boolean",
          description: "true para orden ascendente (útil en reel_skip_rate, donde más bajo es mejor). Default false.",
        },
        limite: { type: "integer", minimum: 1, maximum: 15, description: "Cuántas piezas devolver, como máximo 15." },
      },
      required: [],
    },
  },
  {
    name: "metricas_de_post",
    description: "Trae la evolución día a día de las métricas de una pieza puntual, desde que se publicó hasta hoy.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "El id de la pieza, tal como lo devolvió buscar_mis_posts." },
      },
      required: ["post_id"],
    },
  },
];

function summarizePost(row: Awaited<ReturnType<typeof getBrandContentLibrary>>[number]) {
  return {
    post_id: row.post_id,
    kind: row.kind,
    caption: row.caption ? row.caption.slice(0, 200) : null,
    permalink: row.permalink,
    published_at: row.published_at,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    saved: row.saved,
    shares: row.shares,
    new_followers: row.new_followers,
    reel_avg_watch_time_ms: row.reel_avg_watch_time_ms,
    reel_skip_rate: row.reel_skip_rate,
  };
}

export interface BrandChatToolResult {
  content: string;
  isError: boolean;
}

/** Ejecuta una tool propia por nombre. Nunca lanza: un error vuelve como tool_result con is_error. */
export async function runBrandChatTool(name: string, rawInput: unknown, platform: BrandPlatform): Promise<BrandChatToolResult> {
  try {
    if (name === "buscar_mis_posts") {
      const input = BuscarMisPostsInput.parse(rawInput ?? {});
      const rows = await getBrandContentLibrary(platform, {
        sort: input.ordenar_por,
        ascending: input.ascendente,
        kind: input.kind,
      });
      const limited = rows.slice(0, input.limite ?? 15).map(summarizePost);
      return { content: JSON.stringify(limited), isError: false };
    }

    if (name === "metricas_de_post") {
      const input = MetricasDePostInput.parse(rawInput);
      const history = await getBrandPostMetricsHistory(input.post_id);
      if (history.length === 0) {
        return { content: "No se encontraron métricas para ese post_id (¿es tuyo y existe?).", isError: true };
      }
      const rows = history.map((row) => ({
        captured_on: row.captured_on,
        reach: row.reach,
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        saved: row.saved,
        reel_avg_watch_time_ms: row.reel_avg_watch_time_ms,
        reel_skip_rate: row.reel_skip_rate,
      }));
      return { content: JSON.stringify(rows), isError: false };
    }

    return { content: `Herramienta desconocida: ${name}`, isError: true };
  } catch (error) {
    const message = error instanceof z.ZodError ? "El input de la herramienta no tiene el formato esperado." : error instanceof Error ? error.message : "Error ejecutando la herramienta.";
    return { content: message, isError: true };
  }
}
