import { decrypt } from "@/lib/crypto";
import { GEMINI_KEY_SETTING, GROQ_KEY_SETTING } from "@/lib/settings/constants";
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
 * La key de Google AI Studio (Gemini): sólo el enriquecimiento (§1.10), que
 * necesita el grounding (`google_search`) que Groq no tiene. Las reescrituras
 * de tono se movieron a Groq el 2026-09-28 — ver `getGroqApiKey()`.
 */
export async function getGeminiApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GEMINI_KEY_SETTING, "Google AI Studio (Gemini)");
}

/**
 * La key de Groq (Plans/migracion-fuera-de-anthropic.md, Etapa 1): apertura
 * (§1.11), análisis de respuesta (§1.12), seguimiento (§1.16) y, desde el
 * 2026-09-28, las reescrituras de tono (§1.15) — lo que decide qué escribirle
 * a un lead, más lo que sólo transforma un texto ya escrito sin necesitar
 * buscar nada.
 */
export async function getGroqApiKey(): Promise<ApiKeyResult> {
  return getDecryptedKey(GROQ_KEY_SETTING, "Groq");
}
