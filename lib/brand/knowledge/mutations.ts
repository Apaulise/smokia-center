import { KNOWLEDGE_COLUMNS, type KnowledgeRow } from "@/lib/brand/knowledge/queries";
import type { KnowledgePatch, NewKnowledge } from "@/lib/brand/knowledge/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Escrituras de la base de conocimiento, compartidas por las tools del chat
 * (lib/brand/ai/tools.ts) y por las Server Actions de la pantalla
 * (lib/brand/knowledge/actions.ts): el mismo control sin importar quién escribe.
 *
 * Corren como el usuario logueado — RLS decide qué filas existen para él —, y
 * devuelven un resultado en vez de lanzar: el mensaje de error llega tal cual
 * al modelo o a la UI.
 *
 * No hay borrado acá a propósito: es una decisión de la pantalla, no del
 * agente (SOC §26: "nunca borrar resultados negativos").
 */
export type KnowledgeResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Links = { post_id?: string; content_item_id?: string };

/** Un id inventado por el modelo tiene que rebotar con un mensaje útil, no con una violación de foreign key. */
async function checkLinks(links: Links): Promise<string | null> {
  const supabase = await createClient();

  if (links.post_id) {
    const { data } = await supabase.from("brand_posts").select("id").eq("id", links.post_id).maybeSingle();
    if (!data) return "No existe una pieza publicada con ese post_id. Usá el id que devolvió buscar_mis_posts.";
  }
  if (links.content_item_id) {
    const { data } = await supabase.from("brand_content_items").select("id").eq("id", links.content_item_id).maybeSingle();
    if (!data) return "No existe una idea guardada con ese content_item_id.";
  }
  return null;
}

/** El estado sólo existe en EXPERIMENTOS, y ahí siempre hay uno (lo exige un check en la tabla). */
export async function insertKnowledge(ownerId: string, input: NewKnowledge): Promise<KnowledgeResult<KnowledgeRow>> {
  if (input.collection !== "EXPERIMENTOS" && input.status) {
    return { ok: false, message: "El estado sólo se usa en la colección EXPERIMENTOS." };
  }
  const linkError = await checkLinks(input);
  if (linkError) return { ok: false, message: linkError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_knowledge")
    .insert({
      owner_id: ownerId,
      collection: input.collection,
      title: input.title,
      body: input.body || null,
      data: (input.data ?? {}) as Json,
      origin: input.origin,
      status: input.collection === "EXPERIMENTOS" ? (input.status ?? "PENDIENTE") : null,
      tags: input.tags ?? [],
      post_id: input.post_id ?? null,
      content_item_id: input.content_item_id ?? null,
    })
    .select(KNOWLEDGE_COLUMNS)
    .single();

  if (error || !data) return { ok: false, message: "No se pudo guardar la nota." };
  return { ok: true, value: data as KnowledgeRow };
}

/**
 * `data` se mezcla con lo que ya había (las claves nuevas pisan, el resto queda):
 * reemplazarlo entero haría que corregir un campo borre los demás sin querer.
 */
export async function updateKnowledge(id: string, patch: KnowledgePatch): Promise<KnowledgeResult<KnowledgeRow>> {
  const supabase = await createClient();
  const { data: current } = await supabase.from("brand_knowledge").select("collection, data").eq("id", id).maybeSingle();
  if (!current) return { ok: false, message: "No existe una nota con ese id." };

  if (current.collection !== "EXPERIMENTOS" && patch.status) {
    return { ok: false, message: "El estado sólo se usa en la colección EXPERIMENTOS." };
  }
  const linkError = await checkLinks(patch);
  if (linkError) return { ok: false, message: linkError };

  const update: Database["public"]["Tables"]["brand_knowledge"]["Update"] = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body || null;
  if (patch.origin !== undefined) update.origin = patch.origin;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.post_id !== undefined) update.post_id = patch.post_id;
  if (patch.content_item_id !== undefined) update.content_item_id = patch.content_item_id;
  if (patch.data !== undefined) {
    const previous = current.data && typeof current.data === "object" && !Array.isArray(current.data) ? current.data : {};
    update.data = { ...previous, ...patch.data } as Json;
  }

  if (Object.keys(update).length === 0) return { ok: false, message: "No hay ningún campo para actualizar." };

  const { data, error } = await supabase
    .from("brand_knowledge")
    .update(update)
    .eq("id", id)
    .select(KNOWLEDGE_COLUMNS)
    .single();

  if (error || !data) return { ok: false, message: "No se pudo actualizar la nota." };
  return { ok: true, value: data as KnowledgeRow };
}
