import { decrypt } from "@/lib/crypto";
import { ANTHROPIC_KEY_SETTING, GEMINI_KEY_SETTING } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";

export type ApiKeyResult = { ok: true; apiKey: string } | { ok: false; message: string };

async function getDecryptedKey(settingKey: string, providerLabel: string): Promise<ApiKeyResult> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("settings").select("value_encrypted").eq("key", settingKey).maybeSingle();

  if (!row) {
    return { ok: false, message: `Falta cargar la API key de ${providerLabel} en Configuración.` };
  }

  try {
    return { ok: true, apiKey: decrypt(row.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}

/**
 * Descifra la key de Anthropic guardada en Configuración. Espeja
 * lib/brand/ai/key.ts: la usan varias acciones del copiloto de prospección
 * (§1.11, §1.12, §1.15, §1.16) y evita repetir el mismo bloque en cada una.
 */
export async function getAnthropicApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(ANTHROPIC_KEY_SETTING, "Anthropic");
}

/** La key de Google AI Studio (Gemini), usada por el enriquecimiento (§1.10). */
export async function getGeminiApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GEMINI_KEY_SETTING, "Google AI Studio (Gemini)");
}
