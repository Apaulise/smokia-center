import { createHash } from "node:crypto";

import { BRAND_MEDIA_BUCKET } from "@/lib/brand/planner/schema";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024;
const CONCURRENCY = 5;

/**
 * Las URLs de imagen del CDN de Instagram caducan a los pocos días (el `oe=` de
 * la propia URL es la fecha de vencimiento) y después responden 403. Para que
 * las portadas de competencia y de lo descubierto sigan viéndose, se copian al
 * bucket `brand-media` al importar y la base apunta a la copia.
 *
 * Va bajo `<owner_id>/thumbs/`, la misma carpeta-por-dueño que exigen las
 * políticas del bucket. Si algo falla (red, tamaño, tipo), devuelve la URL
 * original: perder la copia nunca debe tirar la importación.
 */
export async function mirrorThumbnails<T extends { externalId: string; thumbnailUrl: string | null }>(
  supabase: Supabase,
  ownerId: string,
  scope: "competitors" | "trends",
  posts: T[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>(posts.map((post) => [post.externalId, post.thumbnailUrl]));
  const queue = posts.filter((post) => post.thumbnailUrl);

  async function worker() {
    for (let post = queue.shift(); post; post = queue.shift()) {
      const copy = await copyOne(supabase, ownerId, scope, post.externalId, post.thumbnailUrl as string);
      if (copy) result.set(post.externalId, copy);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}

async function copyOne(supabase: Supabase, ownerId: string, scope: string, externalId: string, url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/jpeg")) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    const name = createHash("sha1").update(externalId).digest("hex");
    const path = `${ownerId}/thumbs/${scope}/${name}.jpg`;
    const { error } = await supabase.storage.from(BRAND_MEDIA_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) return null;
    return supabase.storage.from(BRAND_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
