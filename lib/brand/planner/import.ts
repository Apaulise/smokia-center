// Importa al planificador lo que se publicó en Instagram sin pasar por él
// (Plans/03 §3.16). Corre al final de cada sincronización, con el cliente admin
// y el owner_id que resuelve quien llama — igual que link.ts (CLAUDE.md §4).
//
// Para cada fila de `brand_posts` que ninguna pieza reclama:
//   1. Si hay UNA pieza sin publicar con el mismo caption (la había cargado a
//      mano y después la subió a Instagram sin apretar "Ya la publiqué"), se la
//      empalma y se la marca PUBLICADO. Un empate no se empalma, por el mismo
//      motivo que en link.ts: una pieza mal enlazada hereda métricas ajenas.
//   2. Si no, se crea una pieza PUBLICADO en el día en que salió.
//
// Es idempotente: el índice único sobre `post_id` es la última barrera, y lo
// importado queda con post_id, así que la próxima corrida no lo vuelve a ver.

import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { postKindsFor } from "./link";
import { composeCaption } from "./schema";

type Admin = ReturnType<typeof createAdminClient>;
type ContentItemInsert = Database["public"]["Tables"]["brand_content_items"]["Insert"];

const TITLE_MAX_CHARS = 80;
const INSERT_CHUNK = 100;

/** Los tipos de post que se pueden mirar (video) para extraer lo que dicen. */
export function isVideoKind(kind: string): boolean {
  return kind === "REEL" || kind === "VIDEO";
}

function normalizeCaption(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Un título provisorio para una pieza importada: la primera línea con texto del
 * caption, sin hashtags ni links. Sobre un reel, el análisis lo reemplaza por
 * uno mejor; sobre un post o carrusel, es el que queda.
 */
export function titleFromCaption(caption: string | null, publishedAt: string, kind: string): string {
  const firstLine = (caption ?? "")
    .split("\n")
    .map((line) => line.replace(/https?:\/\/\S+/g, "").replace(/#\S+/g, "").replace(/\s+/g, " ").trim())
    .find((line) => line.length > 0);

  if (firstLine) {
    return firstLine.length > TITLE_MAX_CHARS ? `${firstLine.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : firstLine;
  }
  const label = isVideoKind(kind) ? "Reel" : kind === "CARRUSEL" ? "Carrusel" : "Post";
  return `${label} del ${new Date(publishedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}`;
}

export interface ImportResult {
  /** Piezas creadas desde posts huérfanos. */
  created: number;
  /** Piezas ya existentes que se empalmaron con su post. */
  linked: number;
}

export async function importUnlinkedPosts(admin: Admin, ownerId: string, platform: "INSTAGRAM" | "YOUTUBE"): Promise<ImportResult> {
  const result: ImportResult = { created: 0, linked: 0 };

  const { data: account } = await admin
    .from("brand_accounts")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("platform", platform)
    .limit(2);
  // Una cuenta por plataforma (igual que la sincronización): con ambigüedad no se importa nada.
  if (!account || account.length !== 1) return result;

  const { data: posts } = await admin
    .from("brand_posts")
    .select("id, external_id, kind, caption, published_at")
    .eq("owner_id", ownerId)
    .eq("account_id", account[0].id)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  if (!posts || posts.length === 0) return result;

  const { data: items } = await admin
    .from("brand_content_items")
    .select("id, kind, caption, hashtags, post_id, status")
    .eq("owner_id", ownerId)
    .eq("platform", platform);

  const claimed = new Set((items ?? []).flatMap((item) => (item.post_id ? [item.post_id] : [])));
  const orphans = posts.filter((post) => !claimed.has(post.id));
  if (orphans.length === 0) return result;

  // Candidatas al empalme por caption: piezas sin publicar y sin post.
  const open = (items ?? []).filter((item) => !item.post_id && item.status !== "PUBLICADO");
  const toInsert: ContentItemInsert[] = [];

  for (const post of orphans) {
    if (!post.published_at) continue;

    const kinds = postKindsFor(post.kind);
    const normalized = normalizeCaption(post.caption);
    const matches = normalized
      ? open.filter(
          (item) =>
            kinds?.includes(item.kind) && normalizeCaption(composeCaption(item.caption, item.hashtags)) === normalized,
        )
      : [];

    if (matches.length === 1) {
      const match = matches[0];
      const { error } = await admin
        .from("brand_content_items")
        .update({
          post_id: post.id,
          external_id: post.external_id,
          status: "PUBLICADO",
          published_at: post.published_at,
          scheduled_for: post.published_at,
        })
        .eq("id", match.id)
        .eq("owner_id", ownerId)
        .neq("status", "PUBLICADO");
      if (!error) {
        open.splice(open.indexOf(match), 1);
        result.linked += 1;
      }
      continue;
    }

    toInsert.push({
      owner_id: ownerId,
      platform,
      kind: post.kind,
      title: titleFromCaption(post.caption, post.published_at, post.kind),
      caption: post.caption,
      status: "PUBLICADO",
      scheduled_for: post.published_at,
      published_at: post.published_at,
      post_id: post.id,
      external_id: post.external_id,
      imported_from_post: true,
      analysis_status: isVideoKind(post.kind) ? "PENDIENTE" : null,
    });
  }

  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await admin.from("brand_content_items").insert(chunk);
    if (!error) result.created += chunk.length;
  }

  return result;
}
