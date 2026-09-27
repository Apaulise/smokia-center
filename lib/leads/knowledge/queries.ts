import { KNOWLEDGE_COLLECTIONS, type KnowledgeCollection } from "@/lib/leads/knowledge/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type KnowledgeRow = Omit<Database["public"]["Tables"]["sales_knowledge"]["Row"], "search" | "owner_id">;

/** `search` (el tsvector generado) no le sirve a nadie del lado de la app. */
export const KNOWLEDGE_COLUMNS = "id, collection, title, body, data, origin, tags, lead_id, created_at, updated_at";

export const KNOWLEDGE_MAX_ROWS = 200;

/**
 * Lee la memoria global de ventas como el usuario logueado (RLS filtra por
 * dueño). `text` va por búsqueda de texto completo en español sobre título y
 * cuerpo (config `spanish_unaccent`, calco de `lib/brand/knowledge/queries.ts`
 * — Plan §1.18).
 */
export async function searchKnowledge(params: { collection?: KnowledgeCollection; text?: string; limit?: number }): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  let query = supabase.from("sales_knowledge").select(KNOWLEDGE_COLUMNS).order("created_at", { ascending: false });

  if (params.collection) query = query.eq("collection", params.collection);
  const text = params.text?.trim();
  if (text) query = query.textSearch("search", text, { config: "spanish_unaccent", type: "websearch" });

  const { data, error } = await query.limit(Math.min(params.limit ?? KNOWLEDGE_MAX_ROWS, KNOWLEDGE_MAX_ROWS));
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

/** Cuántas notas hay en cada colección — para las pestañas de /leads/conocimiento. */
export async function getKnowledgeCounts(): Promise<Record<KnowledgeCollection, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales_knowledge").select("collection");
  if (error) throw error;

  const counts = Object.fromEntries(KNOWLEDGE_COLLECTIONS.map((c) => [c, 0])) as Record<KnowledgeCollection, number>;
  for (const row of data ?? []) counts[row.collection] += 1;
  return counts;
}

/** Lo que se aprendió a partir de un lead puntual — trazabilidad, no ownership (Plan §1.9: `on delete set null`). */
export async function getKnowledgeForLead(leadId: string): Promise<KnowledgeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_knowledge")
    .select(KNOWLEDGE_COLUMNS)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}
