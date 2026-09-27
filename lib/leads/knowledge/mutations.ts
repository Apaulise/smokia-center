import { KNOWLEDGE_COLUMNS, type KnowledgeRow } from "@/lib/leads/knowledge/queries";
import type { KnowledgePatch, NewKnowledge } from "@/lib/leads/knowledge/schema";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * Escrituras de la memoria global de ventas (Plan §1.18) — calco de
 * `lib/brand/knowledge/mutations.ts`. Compartidas por las tools del modelo
 * (`lib/leads/ai/tools.ts`) y por la Server Action de la pantalla
 * (`lib/leads/knowledge/actions.ts`): el mismo control sin importar quién
 * escribe. Corren como el usuario logueado — RLS decide qué filas existen
 * para él —, y devuelven un resultado en vez de lanzar.
 *
 * Sin borrado acá a propósito: es una decisión de la pantalla, no del agente.
 */
export type KnowledgeResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Un `lead_id` inventado tiene que rebotar con un mensaje útil, no con una violación de foreign key. */
async function checkLeadLink(leadId: string | undefined): Promise<string | null> {
  if (!leadId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
  return data ? null : "No existe un lead con ese id.";
}

export async function insertKnowledge(ownerId: string, input: NewKnowledge): Promise<KnowledgeResult<KnowledgeRow>> {
  const linkError = await checkLeadLink(input.lead_id);
  if (linkError) return { ok: false, message: linkError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_knowledge")
    .insert({
      owner_id: ownerId,
      collection: input.collection,
      title: input.title,
      body: input.body || null,
      data: (input.data ?? {}) as Json,
      origin: input.origin,
      tags: input.tags ?? [],
      lead_id: input.lead_id ?? null,
    })
    .select(KNOWLEDGE_COLUMNS)
    .single();

  if (error || !data) return { ok: false, message: "No se pudo guardar la nota." };
  return { ok: true, value: data as KnowledgeRow };
}

/** `data` se mezcla con lo que ya había: reemplazarlo entero haría que corregir un campo borre los demás sin querer. */
export async function updateKnowledge(id: string, patch: KnowledgePatch): Promise<KnowledgeResult<KnowledgeRow>> {
  const supabase = await createClient();
  const { data: current } = await supabase.from("sales_knowledge").select("data").eq("id", id).maybeSingle();
  if (!current) return { ok: false, message: "No existe una nota con ese id." };

  const linkError = await checkLeadLink(patch.lead_id);
  if (linkError) return { ok: false, message: linkError };

  const update: Database["public"]["Tables"]["sales_knowledge"]["Update"] = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body || null;
  if (patch.origin !== undefined) update.origin = patch.origin;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.lead_id !== undefined) update.lead_id = patch.lead_id;
  if (patch.data !== undefined) {
    const previous = current.data && typeof current.data === "object" && !Array.isArray(current.data) ? current.data : {};
    update.data = { ...previous, ...patch.data } as Json;
  }

  if (Object.keys(update).length === 0) return { ok: false, message: "No hay ningún campo para actualizar." };

  const { data, error } = await supabase.from("sales_knowledge").update(update).eq("id", id).select(KNOWLEDGE_COLUMNS).single();
  if (error || !data) return { ok: false, message: "No se pudo actualizar la nota." };
  return { ok: true, value: data as KnowledgeRow };
}
