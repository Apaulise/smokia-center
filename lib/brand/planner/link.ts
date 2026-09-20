// Empalma cada pieza publicada desde el planificador con su fila de
// `brand_posts` (Plans/03 §3.7: "el círculo se cierra ahí: lo que se
// planificó en la app vuelve a la app medido"). Corre al final de cada
// sincronización, con el cliente admin y el owner_id que resuelve quien
// llama — igual que el resto de lib/brand/sync.ts (CLAUDE.md §4).
//
// Por qué hay dos caminos: la documentación de Windsor sólo garantiza un
// mensaje de texto al publicar, no el id de lo publicado. Cuando el id viene,
// el empalme es exacto. Cuando no, se busca por caption y horario, y sólo se
// enlaza si el candidato es ÚNICO: dos reels con el mismo caption a la misma
// hora es un empate, y un empalme equivocado le pondría a una hipótesis las
// métricas de otra pieza — peor que no empalmar.

import type { createAdminClient } from "@/lib/supabase/admin";

import { composeCaption } from "./schema";

type Admin = ReturnType<typeof createAdminClient>;

/** Cuánto antes de que se apretó "Publicar" puede figurar la pieza en Instagram (relojes, redondeo). */
const WINDOW_BEFORE_MS = 10 * 60_000;
/** Cuánto después: Instagram tarda en procesar un video antes de darle su fecha. */
const WINDOW_AFTER_MS = 2 * 60 * 60_000;

/** Un video simple se publica como Reel en Instagram: para el empalme REEL y VIDEO son lo mismo. */
export function postKindsFor(kind: string): string[] | null {
  switch (kind) {
    case "REEL":
    case "VIDEO":
      return ["REEL", "VIDEO"];
    case "POST":
      return ["POST"];
    case "CARRUSEL":
      return ["CARRUSEL"];
    // Las historias no entran a `brand_posts` (viven en otra familia de campos): no hay a qué empalmar.
    default:
      return null;
  }
}

function normalizeCaption(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function linkPublishedItems(admin: Admin, ownerId: string, platform: "INSTAGRAM" | "YOUTUBE"): Promise<number> {
  const { data: pending } = await admin
    .from("brand_content_items")
    .select("id, kind, caption, hashtags, external_id, published_at")
    .eq("owner_id", ownerId)
    .eq("platform", platform)
    .eq("status", "PUBLICADO")
    .is("post_id", null)
    .not("published_at", "is", null);
  if (!pending || pending.length === 0) return 0;

  const { data: alreadyLinked } = await admin
    .from("brand_content_items")
    .select("post_id")
    .eq("owner_id", ownerId)
    .not("post_id", "is", null);
  const taken = new Set((alreadyLinked ?? []).map((row) => row.post_id).filter((id): id is string => id !== null));

  let linked = 0;

  for (const item of pending) {
    const kinds = postKindsFor(item.kind);
    if (!kinds || !item.published_at) continue;

    let postId: string | null = null;
    let postExternalId: string | null = null;

    if (item.external_id) {
      const { data: post } = await admin
        .from("brand_posts")
        .select("id, external_id")
        .eq("owner_id", ownerId)
        .eq("external_id", item.external_id)
        .maybeSingle();
      if (post && !taken.has(post.id)) {
        postId = post.id;
        postExternalId = post.external_id;
      }
    } else {
      const publishedAt = new Date(item.published_at).getTime();
      const { data: candidates } = await admin
        .from("brand_posts")
        .select("id, external_id, caption")
        .eq("owner_id", ownerId)
        .in("kind", kinds as never[])
        .gte("published_at", new Date(publishedAt - WINDOW_BEFORE_MS).toISOString())
        .lte("published_at", new Date(publishedAt + WINDOW_AFTER_MS).toISOString());

      const free = (candidates ?? []).filter((post) => !taken.has(post.id));
      const expected = normalizeCaption(composeCaption(item.caption, item.hashtags));
      const byCaption = expected ? free.filter((post) => normalizeCaption(post.caption) === expected) : free;

      if (byCaption.length === 1) {
        postId = byCaption[0].id;
        postExternalId = byCaption[0].external_id;
      }
    }

    if (!postId) continue;

    const { error } = await admin
      .from("brand_content_items")
      .update({ post_id: postId, external_id: postExternalId })
      .eq("id", item.id)
      .eq("owner_id", ownerId);
    if (!error) {
      taken.add(postId);
      linked += 1;
    }
  }

  return linked;
}
