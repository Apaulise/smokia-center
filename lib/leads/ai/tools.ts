import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { insertKnowledge, updateKnowledge } from "@/lib/leads/knowledge/mutations";
import { searchKnowledge, type KnowledgeRow } from "@/lib/leads/knowledge/queries";
import { COLLECTION_HINT, KNOWLEDGE_COLLECTIONS, KNOWLEDGE_ORIGINS, KnowledgePatchInput, NewKnowledgeInput } from "@/lib/leads/knowledge/schema";

/**
 * Las tres tools de memoria global (Plan §1.18) — calco de
 * `lib/brand/ai/tools.ts`, mismos topes (preview de `body` a 1.500
 * caracteres, máximo 15 notas por resultado). Sin herramienta de borrado.
 *
 * **No están conectadas a ninguna llamada todavía.** `analyzeLeadResponse()`
 * (§1.12) es una sola corrida de salida estructurada, sin la conversación
 * visible turno a turno que tiene el chat de Marca (`lib/brand/ai/chat.ts`) —
 * el SPA §22 pide un panel que renderiza la memoria, no un chat, así que acá
 * no hay dónde el usuario vea en vivo qué buscó o guardó el modelo. Mientras
 * tanto, "guardar en memoria global" es una decisión humana desde la ficha
 * (`components/leads/copilot/save-signal-button.tsx`). Este archivo queda
 * listo para conectarse el día que haya una interfaz de tool-use visible.
 */

const KNOWLEDGE_SEARCH_DEFAULT = 8;
const KNOWLEDGE_SEARCH_MAX = 15;
const KNOWLEDGE_BODY_PREVIEW = 1500;

const BuscarConocimientoInput = z.object({
  collection: z.enum(KNOWLEDGE_COLLECTIONS).optional(),
  texto: z.string().trim().max(200).optional(),
  limite: z.number().int().min(1).max(KNOWLEDGE_SEARCH_MAX).optional(),
});

const ActualizarConocimientoInput = KnowledgePatchInput.extend({ id: z.string().uuid() });

const COLLECTION_GUIDE = KNOWLEDGE_COLLECTIONS.map((c) => `${c}: ${COLLECTION_HINT[c]}`).join(" ");

export const SALES_KNOWLEDGE_TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_conocimiento",
    description: `Lee la memoria global de ventas: lo que se aprendió en leads anteriores (SPA §20). Colecciones — ${COLLECTION_GUIDE} Cada resultado trae su "origin": PROPIO salió de un lead real, MERCADO se vio afuera, HIPOTESIS todavía no se probó — no presentes una nota MERCADO o HIPOTESIS como un hecho establecido. Si no devuelve nada, la memoria puede estar vacía todavía; eso no es evidencia de que algo no funcione.`,
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: KNOWLEDGE_COLLECTIONS, description: "Limita la búsqueda a una colección. Omitir para buscar en todas." },
        texto: {
          type: "string",
          description: "Palabras a buscar en título y cuerpo. Usá una a tres palabras clave, no una oración: todas tienen que aparecer.",
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
      'Guarda una nota en la memoria global para que sobreviva a este lead — una objeción que se repite, un ángulo que funciona en un rubro, una frase que abre conversaciones (SPA §20). No guardes cada respuesta, sólo lo que valga la pena releer en tres semanas. `origin` es obligatorio y tiene que ser honesto: PROPIO sólo si salió de un lead real, HIPOTESIS si todavía no se probó. Pasá `lead_id` cuando la nota nace de un lead puntual. Las notas no se pueden borrar.',
    input_schema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: KNOWLEDGE_COLLECTIONS },
        title: { type: "string", description: "Un título corto y buscable." },
        body: { type: "string", description: "La nota en prosa: qué se aprendió, y por qué importa." },
        origin: { type: "string", enum: KNOWLEDGE_ORIGINS },
        data: { type: "object", additionalProperties: true, description: "Campos estructurados propios de la colección." },
        tags: { type: "array", items: { type: "string" }, description: "Etiquetas cortas, hasta 12." },
        lead_id: { type: "string", description: "El id del lead del que salió la nota, si corresponde." },
      },
      required: ["collection", "title", "origin"],
    },
  },
  {
    name: "actualizar_conocimiento",
    description:
      "Corrige una nota existente. Sólo se mandan los campos que cambian; `data` se mezcla con lo que ya había en vez de reemplazarlo. La colección no se puede cambiar. No existe forma de borrar una nota: un resultado negativo se conserva, y si algo quedó mal se corrige acá.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "El id de la nota, tal como lo devolvió buscar_conocimiento." },
        title: { type: "string" },
        body: { type: "string" },
        origin: { type: "string", enum: KNOWLEDGE_ORIGINS },
        data: { type: "object", additionalProperties: true },
        tags: { type: "array", items: { type: "string" } },
        lead_id: { type: "string" },
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
    body: row.body && row.body.length > KNOWLEDGE_BODY_PREVIEW ? `${row.body.slice(0, KNOWLEDGE_BODY_PREVIEW)}… (recortado)` : row.body,
    origin: row.origin,
    data: row.data,
    tags: row.tags,
    lead_id: row.lead_id,
    created_at: row.created_at,
  };
}

export interface SalesKnowledgeToolResult {
  content: string;
  isError: boolean;
}

export interface SalesKnowledgeToolContext {
  /** Dueño de lo que la tool escriba. Viene de la sesión que disparó el turno, nunca del modelo. */
  ownerId: string;
}

/** Ejecuta una tool de memoria global por nombre. Nunca lanza: un error vuelve como tool_result con is_error. */
export async function runSalesKnowledgeTool(name: string, rawInput: unknown, ctx: SalesKnowledgeToolContext): Promise<SalesKnowledgeToolResult> {
  try {
    if (name === "buscar_conocimiento") {
      const input = BuscarConocimientoInput.parse(rawInput ?? {});
      const rows = await searchKnowledge({ collection: input.collection, text: input.texto, limit: input.limite ?? KNOWLEDGE_SEARCH_DEFAULT });
      if (rows.length === 0) {
        return {
          content: "No hay notas guardadas que coincidan. La memoria puede estar vacía todavía: no lo tomes como evidencia de que algo no funciona.",
          isError: false,
        };
      }
      return { content: JSON.stringify(rows.map(summarizeKnowledge)), isError: false };
    }

    if (name === "guardar_conocimiento") {
      const input = NewKnowledgeInput.parse(rawInput);
      const result = await insertKnowledge(ctx.ownerId, input);
      if (!result.ok) return { content: result.message, isError: true };
      return { content: JSON.stringify({ guardado: true, id: result.value.id, collection: result.value.collection }), isError: false };
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
