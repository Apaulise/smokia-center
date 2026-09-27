import { decrypt } from "@/lib/crypto";
import { ANTHROPIC_KEY_SETTING, GEMINI_KEY_SETTING, GROQ_KEY_SETTING } from "@/lib/settings/constants";
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
 * Descifra la key de Anthropic guardada en Configuración. Sin llamadores
 * dentro de leads desde Plans/migracion-fuera-de-anthropic.md (Etapa 1):
 * se deja para no romper el import si algo la sigue referenciando, candidata
 * a limpieza en un commit aparte una vez verificada la Etapa 1.
 */
export async function getAnthropicApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(ANTHROPIC_KEY_SETTING, "Anthropic");
}

/**
 * La key de Google AI Studio (Gemini): enriquecimiento (§1.10) y, desde la
 * Etapa 1 de la migración, las reescrituras de tono (§1.15) — transformar un
 * texto que ya existe, no decidir qué decir.
 */
export async function getGeminiApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GEMINI_KEY_SETTING, "Google AI Studio (Gemini)");
}

/**
 * La key de Groq (Plans/migracion-fuera-de-anthropic.md, Etapa 1): apertura
 * (§1.11), análisis de respuesta (§1.12) y seguimiento (§1.16) — lo que
 * decide qué escribirle a un lead.
 */
export async function getGroqApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GROQ_KEY_SETTING, "Groq");
}
