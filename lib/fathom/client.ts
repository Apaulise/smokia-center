import "server-only";

import { decrypt } from "@/lib/crypto";
import { FATHOM_KEY_SETTING } from "@/lib/settings/constants";
import type { createClient } from "@/lib/supabase/server";
import { fathomPage, summaryResponse } from "./model";

export class FathomError extends Error {}

export async function readFathomKey(db: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await db.from("settings").select("value_encrypted")
    .eq("owner_id", userId).eq("key", FATHOM_KEY_SETTING).maybeSingle();
  if (error) throw new FathomError("No se pudo leer la configuración de Fathom.");
  if (!data) return null;
  try {
    return decrypt(data.value_encrypted);
  } catch {
    throw new FathomError("Volvé a guardar tu API key de Fathom en Configuración.");
  }
}

async function fathomGet(key: string, path: string): Promise<unknown> {
  const response = await fetch(`https://api.fathom.ai/external/v1${path}`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).catch(() => { throw new FathomError("Fathom no respondió. Probá de nuevo."); });
  if (response.status === 401 || response.status === 403) {
    throw new FathomError("Fathom rechazó el acceso. Revisá la API key y los permisos de la reunión.");
  }
  if (response.status === 404) throw new FathomError("Fathom todavía no tiene un resumen disponible para esta reunión.");
  if (response.status === 429) throw new FathomError("Fathom alcanzó su límite de consultas. Probá en un minuto.");
  if (!response.ok) throw new FathomError("Fathom no pudo recuperar las reuniones.");
  return response.json().catch(() => { throw new FathomError("Fathom devolvió una respuesta inválida."); });
}

export async function listFathomMeetings(key: string, cursor: string | null, details = false) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (details) {
    params.set("include_summary", "true");
    params.set("include_action_items", "true");
  }
  const result = fathomPage.safeParse(await fathomGet(key, `/meetings?${params}`));
  if (!result.success) throw new FathomError("Fathom devolvió una lista de reuniones con formato inesperado.");
  return result.data;
}

export async function getFathomSummary(key: string, id: string) {
  const result = summaryResponse.safeParse(await fathomGet(key, `/recordings/${id}/summary`));
  if (!result.success) throw new FathomError("Fathom devolvió un resumen con formato inesperado.");
  return result.data.summary?.markdown_formatted?.trim() || null;
}
