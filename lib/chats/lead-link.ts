import { normalizeInstagramHandle } from "@/lib/automation/instagram-intake";
import type { ChatsClient } from "@/lib/chats/db";

/** `_` y `%` son comodines de LIKE y un usuario de Instagram puede tener `_`. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * El lead de este owner que corresponde a un @ de Instagram, o `null`. Busca
 * igual que el alta del embudo (lib/automation/instagram-intake.ts): por el @
 * en `instagram_url`, por `intake.ig_username` y por `dedupe_key`. Si hay más de
 * uno devuelve el más viejo: mejor un enlace al original que ninguno.
 *
 * Filtra por `owner_id` explícito: con RLS es redundante, pero el webhook y el
 * cron lo llaman con service role (CLAUDE.md §4).
 */
export async function findLeadByInstagramHandle(
  db: ChatsClient,
  ownerId: string,
  rawHandle: string | null | undefined,
): Promise<string | null> {
  const handle = normalizeInstagramHandle(rawHandle);
  if (!handle) return null;

  const byUrl = await db
    .from("leads")
    .select("id, instagram_url, created_at")
    .eq("owner_id", ownerId)
    .ilike("instagram_url", `%instagram.com/${likeLiteral(handle)}%`)
    .order("created_at", { ascending: true })
    .limit(20);
  const urlMatch = (byUrl.data ?? []).find((row) => normalizeInstagramHandle(row.instagram_url) === handle);
  if (urlMatch) return urlMatch.id;

  const byIntake = await db
    .from("leads")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("intake->>ig_username", handle)
    .order("created_at", { ascending: true })
    .limit(1);
  if (byIntake.data?.[0]) return byIntake.data[0].id;

  const byKey = await db
    .from("leads")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("dedupe_key", `instagram:${handle}`)
    .maybeSingle();
  return byKey.data?.id ?? null;
}
