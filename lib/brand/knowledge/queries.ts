import { KNOWLEDGE_COLLECTIONS, type KnowledgeCollection } from "@/lib/brand/knowledge/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type KnowledgeRow = Omit<Database["public"]["Tables"]["brand_knowledge"]["Row"], "search" | "owner_id">;

/** `search` (el tsvector generado) no le sirve a nadie del lado de la app y sólo engorda la respuesta. */
export const KNOWLEDGE_COLUMNS =
  "id, collection, title, body, data, origin, status, post_id, content_item_id, tags, created_at, updated_at";

export const KNOWLEDGE_MAX_ROWS = 200;

/**
 * Lee la base de conocimiento como el usuario logueado (RLS filtra por dueño).
 * `text` va por búsqueda de texto completo en español sobre título y cuerpo,
 * sin distinguir tildes (config `spanish_unaccent`, migración 20260919130000):
 * el agente la usa para no traerse la tabla entera (Plans/03 §3.12).
 */
export async function searchKnowledge(params: {
  collection?: KnowledgeCollection;
  text?: string;
  limit?: number;
}): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  let query = supabase.from("brand_knowledge").select(KNOWLEDGE_COLUMNS).order("created_at", { ascending: false });

  if (params.collection) query = query.eq("collection", params.collection);
  const text = params.text?.trim();
  if (text) query = query.textSearch("search", text, { config: "spanish_unaccent", type: "websearch" });

  const { data, error } = await query.limit(Math.min(params.limit ?? KNOWLEDGE_MAX_ROWS, KNOWLEDGE_MAX_ROWS));
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

/**
 * Cuántas notas hay en cada colección. Una sola consulta que trae sólo la
 * columna `collection` y cuenta acá: son nueve pestañas y el bloque de estado
 * del chat, y nueve `count` por request serían nueve viajes a la base.
 * PostgREST corta en 1.000 filas — para una base de notas de una persona
 * sobra, y si algún día no, el número se satura en vez de romperse.
 */
export async function getKnowledgeCounts(): Promise<Record<KnowledgeCollection, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_knowledge").select("collection");
  if (error) throw error;

  const counts = Object.fromEntries(KNOWLEDGE_COLLECTIONS.map((c) => [c, 0])) as Record<KnowledgeCollection, number>;
  for (const row of data ?? []) counts[row.collection] += 1;
  return counts;
}

/** Los experimentos que todavía no se cerraron — parte del bloque de estado del chat (§3.10). */
export async function getOpenExperiments(limit = 10): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_knowledge")
    .select(KNOWLEDGE_COLUMNS)
    .eq("collection", "EXPERIMENTOS")
    .in("status", ["PENDIENTE", "ACTIVO"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

/** Lo que se aprendió de una pieza puntual — el "por qué ganó" que §3.11 deja para acá. */
export async function getKnowledgeForPost(postId: string): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_knowledge")
    .select(KNOWLEDGE_COLUMNS)
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

/** Total de notas de la base de conocimiento, para el badge del sidebar — sin traer filas. */
export async function countKnowledgeNotes(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("brand_knowledge").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}
