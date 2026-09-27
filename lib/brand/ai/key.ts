import { decrypt } from "@/lib/crypto";
import { ANTHROPIC_KEY_SETTING, GEMINI_KEY_SETTING, GROQ_KEY_SETTING } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";

export type AnthropicKeyResult = { ok: true; apiKey: string } | { ok: false; message: string };

async function getDecryptedKey(settingKey: string, providerLabel: string): Promise<AnthropicKeyResult> {
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
 * Descifra la key de Anthropic guardada en Configuración. Sigue haciendo
 * falta: `sendBrandChatMessage` (lib/brand/actions.ts) la usa hasta la Etapa 2
 * de la migración (chat.ts, tool-use en loop, fuera de alcance de la Etapa 1).
 */
export async function getAnthropicApiKey(): Promise<AnthropicKeyResult> {
  return getDecryptedKey(ANTHROPIC_KEY_SETTING, "Anthropic");
}

/**
 * La key de Google AI Studio (Gemini): clasificación de competencia (§3.14) y,
 * desde Plans/migracion-fuera-de-anthropic.md (Etapa 1), guiones (§3.7) e
 * ideas desde un outlier (§3.14/§3.15) — transformar algo que ya existe, no
 * decidir una estrategia.
 */
export async function getGeminiApiKey(): Promise<AnthropicKeyResult> {
  return getDecryptedKey(GEMINI_KEY_SETTING, "Google AI Studio (Gemini)");
}

/**
 * La key de Groq (Plans/migracion-fuera-de-anthropic.md, Etapa 1): las
 * recomendaciones de contenido (§3.5) — lo que decide qué repetir, cortar o
 * probar.
 */
export async function getGroqApiKey(): Promise<AnthropicKeyResult> {
  return getDecryptedKey(GROQ_KEY_SETTING, "Groq");
}
