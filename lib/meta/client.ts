/**
 * Cliente HTTP crudo contra la Graph API oficial de Meta (Instagram), sin SDK —
 * espejo de lib/apify/client.ts. Reemplaza a lib/windsor/client.ts.
 *
 * Las credenciales son de cada usuario: viven cifradas en `settings`
 * (INSTAGRAM_CREDENTIALS_SETTING) y se cargan desde Configuración. Graph API
 * lleva el token en el query string, así que NINGÚN error de acá debe incluir
 * la URL armada — sólo el mensaje de Meta y el código (ver CLAUDE.md §5,
 * "nunca loguear secretos").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { decrypt } from "@/lib/crypto";
import { INSTAGRAM_CREDENTIALS_SETTING } from "@/lib/settings/constants";
import type { Database } from "@/lib/supabase/database.types";

/** Versión de la Graph API a la que se apunta. Meta mantiene cada versión ~2 años. */
export const GRAPH_VERSION = "v23.0";

const REQUEST_TIMEOUT_MS = 25_000;

export interface MetaCredentials {
  accessToken: string;
  /** Id de la cuenta profesional de Instagram (no el de la página de Facebook). */
  userId: string;
}

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  userId: z.string().min(1),
});

/**
 * Las credenciales de Instagram de `ownerId`, o null si no conectó su cuenta
 * (o si están cifradas con otra APP_ENCRYPTION_KEY). Filtra por owner_id
 * explícitamente: sirve tanto con el cliente del usuario (RLS) como con el
 * admin de la sincronización y el cron, que saltea RLS.
 */
export async function getMetaCredentials(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<MetaCredentials | null> {
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("owner_id", ownerId)
    .eq("key", INSTAGRAM_CREDENTIALS_SETTING)
    .maybeSingle();
  if (!data) return null;

  try {
    const parsed = credentialsSchema.safeParse(JSON.parse(decrypt(data.value_encrypted)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Los tokens de "Instagram Login" empiezan con `IG` y sólo los acepta
 * graph.instagram.com; los de "Facebook Login" (`EAA…`) van a graph.facebook.com.
 * Los endpoints son los mismos en los dos hosts.
 */
function graphBase(accessToken: string): string {
  return accessToken.startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

/**
 * `definitive: true` — Meta contestó y rechazó: no pasó nada, reintentar es
 * seguro. `definitive: false` — no llegó respuesta (corte de red, timeout): la
 * operación PUDO haber salido, y reintentar a ciegas arriesga un post duplicado.
 * Sólo importa para la publicación (ver lib/brand/sources/instagram.ts).
 */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly definitive: boolean,
    readonly code: number | null = null,
    readonly subcode: number | null = null,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

function describeError(body: GraphErrorBody | null, status: number): { message: string; code: number | null; subcode: number | null } {
  const error = body?.error;
  const code = typeof error?.code === "number" ? error.code : null;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : null;
  // 190 = token vencido, revocado o inválido. Es el error que más se va a ver (los tokens
  // largos duran 60 días), así que se dice qué hacer en vez de repetir el texto de Meta.
  if (code === 190) {
    return {
      message: "El token de Instagram venció o fue revocado. Generá uno nuevo y actualizalo en Configuración.",
      code,
      subcode,
    };
  }
  return { message: error?.message ?? `status ${status}`, code, subcode };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** GET a un path de la Graph API (ej. `${userId}/media`). Devuelve el JSON crudo. */
export async function graphGet(
  credentials: MetaCredentials,
  path: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const query = new URLSearchParams({ access_token: credentials.accessToken });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(`${graphBase(credentials.accessToken)}/${GRAPH_VERSION}/${path}?${query}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Un timeout y un corte de red no se arreglan igual: se dice cuál fue.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new MetaApiError(
      timedOut
        ? `Instagram tardó más de ${Math.round(timeoutMs / 1000)} s en responder (${path.split("/").pop()}).`
        : `No se pudo contactar a Instagram (${path.split("/").pop()}).`,
      false,
    );
  }

  const body = await parseJson(response);
  if (!response.ok) {
    const { message, code, subcode } = describeError(body as GraphErrorBody | null, response.status);
    throw new MetaApiError(`Instagram rechazó la consulta a "${path.split("/").pop()}" (${message})`, true, code, subcode);
  }
  return body;
}

/** Lo mismo que `graphGet`, siguiendo `paging.next` hasta juntar `maxItems` filas. */
export async function graphGetAll(
  credentials: MetaCredentials,
  path: string,
  params: Record<string, string | number | undefined>,
  maxItems: number,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let page = (await graphGet(credentials, path, { ...params, limit: params.limit ?? 50 })) as GraphPage;

  while (true) {
    rows.push(...(page.data ?? []));
    const next = page.paging?.next;
    if (!next || rows.length >= maxItems) break;

    // `next` ya trae el token adentro. No se lo loguea nunca; sólo se sigue si
    // apunta a un host de Meta, por si la respuesta trajera otra cosa.
    if (!/^https:\/\/graph\.(instagram|facebook)\.com\//.test(next)) break;
    let response: Response;
    try {
      response = await fetch(next, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new MetaApiError(`No se pudo contactar a Instagram (${path.split("/").pop()}).`, false);
    }
    const body = await parseJson(response);
    if (!response.ok) {
      const { message, code, subcode } = describeError(body as GraphErrorBody | null, response.status);
      throw new MetaApiError(`Instagram rechazó la consulta a "${path.split("/").pop()}" (${message})`, true, code, subcode);
    }
    page = (body ?? {}) as GraphPage;
  }

  return rows.slice(0, maxItems);
}

interface GraphPage {
  data?: unknown[];
  paging?: { next?: string };
}

/**
 * POST a la Graph API (publicación). Distingue "Meta rechazó" (`definitive`) de
 * "no llegó respuesta": ver `MetaApiError`. `timeoutMs` acota la llamada al
 * presupuesto que le quede a la función de servidor.
 */
export async function graphPost(
  credentials: MetaCredentials,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({ access_token: credentials.accessToken });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) form.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(`${graphBase(credentials.accessToken)}/${GRAPH_VERSION}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new MetaApiError(`No se pudo confirmar la operación "${path.split("/").pop()}": la conexión con Instagram se cortó.`, false);
  }

  const body = await parseJson(response);
  if (!response.ok) {
    const { message, code, subcode } = describeError(body as GraphErrorBody | null, response.status);
    throw new MetaApiError(`Instagram rechazó "${path.split("/").pop()}" (${message})`, true, code, subcode);
  }
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** Corre `fn` sobre cada item con a lo sumo `limit` en vuelo — sin tirar cientos de pedidos juntos contra Meta. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
