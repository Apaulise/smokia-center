import type { SupabaseClient } from "@supabase/supabase-js";

import { decrypt } from "@/lib/crypto";
import { GEMINI_KEY_SETTING, GROQ_KEY_SETTING } from "@/lib/settings/constants";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type ApiKeyResult = { ok: true; apiKey: string } | { ok: false; message: string };

async function getDecryptedKey(settingKey: string, providerLabel: string): Promise<ApiKeyResult> {
  const supabase = await createClient();
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", settingKey)
    .maybeSingle();

  if (!settingsRow) {
    return { ok: false, message: `Falta cargar la API key de ${providerLabel} en Configuración.` };
  }

  try {
    return { ok: true, apiKey: decrypt(settingsRow.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}

/**
 * La key de Google AI Studio (Gemini): clasificación de competencia (§3.14) y,
 * desde Plans/migracion-fuera-de-anthropic.md (Etapa 1), guiones (§3.7) e
 * ideas desde un outlier (§3.14/§3.15) — transformar algo que ya existe, no
 * decidir una estrategia.
 */
export async function getGeminiApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GEMINI_KEY_SETTING, "Google AI Studio (Gemini)");
}

/**
 * La key de Gemini de un owner puntual, para código que corre sin sesión (la
 * sincronización y el cron, con el cliente admin). Filtra por owner_id a mano
 * porque ahí RLS no lo hace por nosotros (CLAUDE.md §4). null si no la cargó o
 * si quedó cifrada con otra APP_ENCRYPTION_KEY.
 */
export async function getGeminiApiKeyForOwner(db: SupabaseClient<Database>, ownerId: string): Promise<string | null> {
  const { data } = await db
    .from("settings")
    .select("value_encrypted")
    .eq("owner_id", ownerId)
    .eq("key", GEMINI_KEY_SETTING)
    .maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.value_encrypted);
  } catch {
    return null;
  }
}

/**
 * La key de Groq (Plans/migracion-fuera-de-anthropic.md, Etapa 1): las
 * recomendaciones de contenido (§3.5) — lo que decide qué repetir, cortar o
 * probar.
 */
export async function getGroqApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GROQ_KEY_SETTING, "Groq");
}
