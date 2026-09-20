import { decrypt } from "@/lib/crypto";
import { ANTHROPIC_KEY_SETTING } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";

export type AnthropicKeyResult = { ok: true; apiKey: string } | { ok: false; message: string };

/**
 * Descifra la key de Anthropic guardada en Configuración. Vive acá y no en
 * `lib/brand/actions.ts` porque la usan varias acciones (§3.5, §3.6 y el
 * "Usar" de competencia, §3.14): tres copias del mismo bloque es lo que hay
 * que evitar.
 */
export async function getAnthropicApiKey(): Promise<AnthropicKeyResult> {
  const supabase = await createClient();
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", ANTHROPIC_KEY_SETTING)
    .maybeSingle();

  if (!settingsRow) {
    return { ok: false, message: "Falta cargar la API key de Anthropic en Configuración." };
  }

  try {
    return { ok: true, apiKey: decrypt(settingsRow.value_encrypted) };
  } catch {
    return { ok: false, message: "La API key guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }
}
