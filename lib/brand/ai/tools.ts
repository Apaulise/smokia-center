import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { insertKnowledge, updateKnowledge } from "@/lib/brand/knowledge/mutations";
import { searchKnowledge, type KnowledgeRow } from "@/lib/brand/knowledge/queries";
import {
  COLLECTION_HINT,
  KNOWLEDGE_COLLECTIONS,
  KNOWLEDGE_ORIGINS,
  KNOWLEDGE_STATUSES,
  KnowledgePatchInput,
  NewKnowledgeInput,
} from "@/lib/brand/knowledge/schema";
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

const KNOWLEDGE_SEARCH_DEFAULT = 8;
const KNOWLEDGE_SEARCH_MAX = 15;
/** Una nota puede tener hasta 8.000 caracteres; 15 así de largas serían ~30k tokens en un solo tool_result. */
const KNOWLEDGE_BODY_PREVIEW = 1500;

const BuscarConocimientoInput = z.object({
  collection: z.enum(KNOWLEDGE_COLLECTIONS).optional(),
  texto: z.string().trim().max(200).optional(),
  limite: z.number().int().min(1).max(KNOWLEDGE_SEARCH_MAX).optional(),
});

const ActualizarConocimientoInput = KnowledgePatchInput.extend({ id: z.string().uuid() });

const COLLECTION_GUIDE = KNOWLEDGE_COLLECTIONS.map((c) => `${c}: ${COLLECTION_HINT[c]}`).join(" ");

/**
 * Las tools propias del chat. Las dos primeras (Plans/03 §3.6): buscar
 * contenido real y ver cómo evolucionó una pieza puntual, para que el modelo
 * funde una idea en un post concreto en vez de inventar. Las tres de memoria
 * (§3.12): buscar, guardar y corregir notas de la base de conocimiento —
 * no hay una de borrado, a propósito (SOC §26: "nunca borrar resultados
 * negativos"). El server tool de búsqueda web se agrega aparte, en
 * lib/brand/ai/chat.ts, junto al resto de `tools`.
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
  {
    name: "buscar_conocimiento",
    description: `Lee la base de conocimiento persistente: lo que se aprendió en conversaciones anteriores. Es la primera llamada de cualquier turno que pida ideas (SOC §27), antes de proponer nada. Colecciones — ${COLLECTION_GUIDE} Cada resultado trae su "origin": PROPIO salió de métricas de Agus, MERCADO se vio afuera, HIPOTESIS todavía no se probó. Pesan distinto (SOC §18): no presentes una nota MERCADO o HIPOTESIS como un hecho establecido. Si no devuelve nada, la base puede estar vacía todavía; eso no es evidencia de que algo no funcione.`,
    input_schema: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          enum: KNOWLEDGE_COLLECTIONS,
          description: "Limita la búsqueda a una colección. Omitir para buscar en todas.",
        },
        texto: {
          type: "string",
          description:
            "Palabras a buscar en título y cuerpo. Usá una a tres palabras clave, no una oración: todas tienen que aparecer. Omitir para traer las más recientes.",
        },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: KNOWLEDGE_SEARCH_MAX,
          description: `Cuántas notas devolver, como máximo ${KNOWLEDGE_SEARCH_MAX}. Default ${KNOWLEDGE_SEARCH_DEFAULT}.`,
        },
      },
      required: [],
    },
  },
  {
    name: "guardar_conocimiento",
    description:
      "Guarda una nota en la base de conocimiento para que sobreviva a esta conversación. Guardá sólo lo que valga la pena recordar el mes que viene — una conclusión, un ganador, un experimento con su hipótesis, una idea externa para testear —, no cada respuesta. Poné lo esencial en `body`: es lo que se busca por texto. `data` es para campos estructurados propios de la colección (por ejemplo en RADAR: creador, link, plataforma, views, hook, ángulo, formato, estructura, payoff, emoción, núcleo transferible, qué no copiar). `origin` es obligatorio y tiene que ser honesto: PROPIO sólo si sale de métricas de Agus; si es una conclusión que todavía no se probó, HIPOTESIS. `status` se usa sólo en EXPERIMENTOS (arranca PENDIENTE). Si la nota es sobre una pieza publicada, pasá su `post_id`. Las notas no se pueden borrar.",
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: KNOWLEDGE_COLLECTIONS },
        title: { type: "string", description: "Un título corto y buscable." },
        body: { type: "string", description: "La nota en prosa: qué se aprendió o qué se vio, y por qué importa." },
        origin: { type: "string", enum: KNOWLEDGE_ORIGINS },
        data: { type: "object", additionalProperties: true, description: "Campos estructurados propios de la colección." },
        status: { type: "string", enum: KNOWLEDGE_STATUSES, description: "Sólo para EXPERIMENTOS." },
        tags: { type: "array", items: { type: "string" }, description: "Etiquetas cortas, hasta 12." },
        post_id: {
          type: "string",
          description: "El id de la pieza propia a la que se refiere, tal como lo devolvió buscar_mis_posts.",
        },
        content_item_id: { type: "string", description: "El id de la idea guardada a la que se refiere." },
      },
      required: ["collection", "title", "origin"],
    },
  },
  {
    name: "actualizar_conocimiento",
    description:
      "Corrige una nota existente o cierra un experimento (status CONCLUIDO, con la conclusión en `body` o `data`). Sólo se mandan los campos que cambian; `data` se mezcla con lo que ya había en vez de reemplazarlo. La colección no se puede cambiar. No existe forma de borrar una nota: un resultado negativo se conserva, y si algo quedó mal se corrige acá.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "El id de la nota, tal como lo devolvió buscar_conocimiento." },
        title: { type: "string" },
        body: { type: "string" },
        origin: { type: "string", enum: KNOWLEDGE_ORIGINS },
        data: { type: "object", additionalProperties: true },
        status: { type: "string", enum: KNOWLEDGE_STATUSES, description: "Sólo para notas de EXPERIMENTOS." },
        tags: { type: "array", items: { type: "string" } },
        post_id: { type: "string" },
        content_item_id: { type: "string" },
      },
      required: ["id"],
    },
  },
];

function summarizeKnowledge(row: KnowledgeRow) {
  return {
    id: row.id,
    collection: row.collection,
    title: row.title,
    body:
      row.body && row.body.length > KNOWLEDGE_BODY_PREVIEW ? `${row.body.slice(0, KNOWLEDGE_BODY_PREVIEW)}… (recortado)` : row.body,
    origin: row.origin,
    status: row.status,
    data: row.data,
    tags: row.tags,
    post_id: row.post_id,
    content_item_id: row.content_item_id,
    created_at: row.created_at,
  };
}

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

export interface BrandChatToolContext {
  platform: BrandPlatform;
  /** Dueño de lo que la tool escriba. Viene de la sesión que disparó el turno, nunca del modelo. */
  ownerId: string;
}

/** Ejecuta una tool propia por nombre. Nunca lanza: un error vuelve como tool_result con is_error. */
export async function runBrandChatTool(name: string, rawInput: unknown, ctx: BrandChatToolContext): Promise<BrandChatToolResult> {
  const { platform, ownerId } = ctx;
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

    if (name === "buscar_conocimiento") {
      const input = BuscarConocimientoInput.parse(rawInput ?? {});
      const rows = await searchKnowledge({
        collection: input.collection,
        text: input.texto,
        limit: input.limite ?? KNOWLEDGE_SEARCH_DEFAULT,
      });
      if (rows.length === 0) {
        return {
          content:
            "No hay notas guardadas que coincidan. La base puede estar vacía todavía: no lo tomes como evidencia de que algo no funciona. Si buscaste por texto, probá con menos palabras.",
          isError: false,
        };
      }
      return { content: JSON.stringify(rows.map(summarizeKnowledge)), isError: false };
    }

    if (name === "guardar_conocimiento") {
      const input = NewKnowledgeInput.parse(rawInput);
      const result = await insertKnowledge(ownerId, input);
      if (!result.ok) return { content: result.message, isError: true };
      return {
        content: JSON.stringify({ guardado: true, id: result.value.id, collection: result.value.collection }),
        isError: false,
      };
    }

    if (name === "actualizar_conocimiento") {
      const { id, ...patch } = ActualizarConocimientoInput.parse(rawInput);
      const result = await updateKnowledge(id, patch);
      if (!result.ok) return { content: result.message, isError: true };
      return { content: JSON.stringify({ actualizado: true, nota: summarizeKnowledge(result.value) }), isError: false };
    }

    return { content: `Herramienta desconocida: ${name}`, isError: true };
  } catch (error) {
    const message = error instanceof z.ZodError ? "El input de la herramienta no tiene el formato esperado." : error instanceof Error ? error.message : "Error ejecutando la herramienta.";
    return { content: message, isError: true };
  }
}
