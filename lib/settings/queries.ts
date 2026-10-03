import { getApifyAccountLimits, type ApifyAccountLimits } from "@/lib/apify/client";
import { decrypt, maskSecret } from "@/lib/crypto";
import { getMetaCredentials } from "@/lib/meta/client";
import type { LeadSource } from "@/lib/providers/types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

import {
  ANTHROPIC_KEY_SETTING,
  APIFY_KEY_SETTING,
  GEMINI_KEY_SETTING,
  GROQ_KEY_SETTING,
  SALES_PROFILE_SETTING,
} from "./constants";

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

/** Crédito Apify restante del mes (Design System §04) — null sin key configurada o si Apify no responde con el shape esperado. */
export async function getApifyCredit(): Promise<ApifyAccountLimits | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", APIFY_KEY_SETTING)
    .maybeSingle();
  if (!data) return null;

  try {
    return await getApifyAccountLimits(decrypt(data.value_encrypted));
  } catch {
    return null;
  }
}

/** Si el usuario conectó su Instagram. No dice si el token sigue vigente: eso lo prueba el botón de Configuración. */
export async function getInstagramConnectionStatus() {
  const user = await getCurrentUser();
  if (!user) return { configured: false as const, masked: null };

  const supabase = await createClient();
  const credentials = await getMetaCredentials(supabase, user.id);
  if (!credentials) return { configured: false as const, masked: null };
  return { configured: true as const, masked: `Cuenta ${credentials.userId} · ${maskSecret(credentials.accessToken)}` };
}

export async function getAnthropicKeyStatus() {
  return getKeyStatus(ANTHROPIC_KEY_SETTING);
}

export async function getGeminiKeyStatus() {
  return getKeyStatus(GEMINI_KEY_SETTING);
}

export async function getGroqKeyStatus() {
  return getKeyStatus(GROQ_KEY_SETTING);
}

/**
 * El perfil del vendedor (Plan §1.7), en claro. A diferencia de las keys acá
 * no se enmascara: el usuario tiene que poder releerlo y editarlo, y el
 * copiloto necesita el texto entero para no afirmar experiencia que no tiene.
 *
 * Devuelve `""` si no está configurado — el prompt ya sabe qué hacer con un
 * perfil vacío (§13 del Sistema de Prospección: no afirmar nada).
 */
export async function getSalesProfile(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", SALES_PROFILE_SETTING)
    .maybeSingle();

  if (!data) return "";

  try {
    return decrypt(data.value_encrypted);
  } catch {
    // Cifrado con otra APP_ENCRYPTION_KEY: se trata como vacío. Es preferible
    // que el copiloto no afirme nada a que la pantalla se rompa.
    return "";
  }
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

