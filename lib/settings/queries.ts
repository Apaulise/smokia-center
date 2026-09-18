import { decrypt, maskSecret } from "@/lib/crypto";
import type { LeadSource } from "@/lib/providers/types";
import { createClient } from "@/lib/supabase/server";

import { ANTHROPIC_KEY_SETTING, APIFY_KEY_SETTING, WINDSOR_KEY_SETTING } from "./constants";

const ACTOR_KEY_PREFIX = "apify_actor_";

/**
 * No hace falta filtrar por owner_id acá: RLS ya garantiza que sólo vuelven
 * las filas del usuario logueado (CLAUDE.md §4).
 */
async function getKeyStatus(key: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", key)
    .maybeSingle();

  if (!data) return { configured: false as const, masked: null };

  try {
    return { configured: true as const, masked: maskSecret(decrypt(data.value_encrypted)) };
  } catch {
    // Cifrado con una APP_ENCRYPTION_KEY distinta a la actual: tratarla como
    // no configurada en vez de romper la pantalla.
    return { configured: false as const, masked: null };
  }
}

export async function getApifyKeyStatus() {
  return getKeyStatus(APIFY_KEY_SETTING);
}

export async function getWindsorKeyStatus() {
  return getKeyStatus(WINDSOR_KEY_SETTING);
}

export async function getAnthropicKeyStatus() {
  return getKeyStatus(ANTHROPIC_KEY_SETTING);
}

export async function listIndustries() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("industries")
    .select("*")
    .order("name");
  if (error) throw error;
  return data;
}

/** Actores de Apify configurados por el usuario, indexados por fuente. */
export async function getActorOverrides(): Promise<Partial<Record<LeadSource, string>>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value_encrypted")
    .like("key", `${ACTOR_KEY_PREFIX}%`);

  const overrides: Partial<Record<LeadSource, string>> = {};
  for (const row of data ?? []) {
    const source = row.key.slice(ACTOR_KEY_PREFIX.length) as LeadSource;
    try {
      overrides[source] = decrypt(row.value_encrypted);
    } catch {
      // Cifrado con una APP_ENCRYPTION_KEY distinta: se ignora, se re-configura.
    }
  }
  return overrides;
}

export async function listMessageTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
