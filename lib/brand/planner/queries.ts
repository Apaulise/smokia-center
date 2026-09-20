import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/server";

import { parseItemMedia, type ContentItem, type PlannerItem } from "./schema";

function withMedia(row: ContentItem): PlannerItem {
  return { ...row, media: parseItemMedia(row.media) };
}

/**
 * Las piezas que caen en el rango del calendario: las planificadas para esos
 * días y las ya publicadas en ellos. Una publicada se muestra en el día en que
 * salió, no en el que se había planificado.
 */
export async function getPlannerItemsInRange(platform: BrandPlatform, fromInstant: string, toInstant: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("*")
    .eq("platform", platform)
    .or(
      `and(published_at.gte.${fromInstant},published_at.lt.${toInstant}),and(published_at.is.null,scheduled_for.gte.${fromInstant},scheduled_for.lt.${toInstant})`,
    )
    .order("scheduled_for", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(withMedia);
}

/** Las piezas sin fecha (ideas del chat incluidas): la bandeja desde donde se arrastran al calendario. */
export async function getUnscheduledItems(platform: BrandPlatform) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("*")
    .eq("platform", platform)
    .is("scheduled_for", null)
    .is("published_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(withMedia);
}

/** Lo justo para los selectores "desciende de…" y "salió de…" del diálogo. */
export async function getItemChoices(platform: BrandPlatform) {
  const supabase = await createClient();
  const [items, notes] = await Promise.all([
    supabase
      .from("brand_content_items")
      .select("id, title, kind, status")
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("brand_knowledge")
      .select("id, title, collection")
      .in("collection", ["RADAR", "WINNERS"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (items.error) throw items.error;
  if (notes.error) throw notes.error;
  return { items: items.data ?? [], notes: notes.data ?? [] };
}

export type PlannerItemChoice = Awaited<ReturnType<typeof getItemChoices>>["items"][number];
export type PlannerNoteChoice = Awaited<ReturnType<typeof getItemChoices>>["notes"][number];

/** La pieza planificada detrás de una publicación — para mostrar su hipótesis en la ficha del post. */
export async function getContentItemForPost(postId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brand_content_items").select("*").eq("post_id", postId).maybeSingle();
  if (error) throw error;
  return data ? withMedia(data) : null;
}

export type PublishedHypothesis = Awaited<ReturnType<typeof getPublishedHypotheses>>[number];

/**
 * Las piezas publicadas que salieron con una hipótesis escrita, la más nueva
 * primero. Es la materia prima para cerrar el ciclo del SOC §12: comparar lo
 * que pasó contra lo que se dijo antes de grabar.
 */
export async function getPublishedHypotheses(platform: BrandPlatform, limit = 15) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand_content_items")
    .select("id, title, kind, objective, hypothesis, hook, angle, post_id, published_at, parent_item_id")
    .eq("platform", platform)
    .eq("status", "PUBLICADO")
    .not("hypothesis", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
