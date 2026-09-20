/**
 * Cliente HTTP crudo contra la Connectors API de Windsor.ai — sin SDK, espejo
 * de lib/apify/client.ts. A diferencia de Apify, Windsor no soporta auth por
 * header: la key viaja en el query string. Por eso ningún error de acá debe
 * loguear la URL armada, sólo el conector y el status (ver CLAUDE.md /
 * Plans/03 §3.1).
 */

const WINDSOR_BASE = "https://connectors.windsor.ai";

async function windsorErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // el cuerpo no era JSON — se informa sólo el status
  }
  return `status ${response.status}`;
}

export interface WindsorQueryParams {
  apiKey: string;
  connector: string;
  fields: string[];
  dateFrom?: string;
  dateTo?: string;
  selectAccounts?: string[];
  maxRows?: number;
}

/** Lee filas de un conector. Cada fila trae exactamente los `fields` pedidos. */
export async function queryWindsorConnector(params: WindsorQueryParams): Promise<unknown[]> {
  const query = new URLSearchParams({
    api_key: params.apiKey,
    fields: params.fields.join(","),
  });
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.selectAccounts?.length) query.set("select_accounts", params.selectAccounts.join(","));
  if (params.maxRows) query.set("_max_rows", String(params.maxRows));

  const response = await fetch(`${WINDSOR_BASE}/${encodeURIComponent(params.connector)}?${query}`);

  if (!response.ok) {
    throw new Error(`Windsor rechazó la consulta a "${params.connector}" (${await windsorErrorMessage(response)})`);
  }

  const body = (await response.json()) as { data?: unknown[] };
  return body.data ?? [];
}

const WINDSOR_ONBOARD_BASE = "https://onboard.windsor.ai";

export interface WindsorAccount {
  id: string;
  name: string | null;
}

/**
 * Las cuentas conectadas de un conector, con el id que Windsor espera en
 * `account` al ejecutar una acción. NO es el `account_id` que devuelven los
 * campos de lectura: para la cuenta real de Agus son dos ids distintos
 * (probado). Por eso la publicación resuelve la cuenta acá y no con el
 * `external_id` de `brand_accounts`.
 */
export async function listWindsorAccounts(apiKey: string, connector: string): Promise<WindsorAccount[]> {
  const query = new URLSearchParams({ datasource: connector, api_key: apiKey });
  const response = await fetch(`${WINDSOR_ONBOARD_BASE}/api/common/ds-accounts?${query}`);
  if (!response.ok) {
    throw new Error(`Windsor no devolvió las cuentas de "${connector}" (${await windsorErrorMessage(response)})`);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as Record<string, unknown>;
    if (record.account_id === undefined || record.account_id === null) return [];
    return [{ id: String(record.account_id), name: typeof record.account_name === "string" ? record.account_name : null }];
  });
}

export interface WindsorActionParams {
  apiKey: string;
  connector: string;
  account: string;
  action: string;
  params: Record<string, unknown>;
}

export interface WindsorActionResult {
  /** El texto que devolvió Windsor ("… created successfully"), si devolvió alguno. */
  message: string | null;
  /** El id de la pieza creada, si Windsor lo devolvió — ver `extractExternalId`. */
  externalId: string | null;
}

/**
 * `definitive: true` — Windsor contestó y rechazó la acción: no se publicó
 * nada, reintentar es seguro. `definitive: false` — no llegó respuesta (corte
 * de red, timeout): la publicación PUDO haber salido, y reintentar a ciegas
 * arriesga un post duplicado. Los llamadores tienen que tratarlos distinto.
 */
export class WindsorActionError extends Error {
  constructor(
    message: string,
    readonly definitive: boolean,
  ) {
    super(message);
    this.name = "WindsorActionError";
  }
}

/** Sobra para que Windsor procese un video (Instagram lo procesa de su lado) sin pasar el maxDuration de la página. */
const ACTION_TIMEOUT_MS = 55_000;

/**
 * Los ids de media de Instagram son números largos (17 dígitos hoy). La
 * documentación de Windsor sólo garantiza `{ "result": "<mensaje>" }` y no dice
 * dónde va el id de lo publicado, así que se busca en los campos habituales y,
 * si no, dentro del mensaje. Si no aparece devuelve null y la sincronización
 * empalma la pieza por caption y horario (lib/brand/planner/link.ts).
 */
function extractExternalId(body: Record<string, unknown>): string | null {
  const direct = body.id ?? body.external_id ?? body.media_id;
  if (typeof direct === "string" || typeof direct === "number") return String(direct);
  if (typeof body.result === "string") return body.result.match(/\b\d{15,}\b/)?.[0] ?? null;
  return null;
}

/**
 * Ejecuta una acción de escritura (ej. publicar) contra `{connector}/actions`.
 * Nunca incluye la URL en un error: lleva la key (ver header).
 */
export async function runWindsorAction(params: WindsorActionParams): Promise<WindsorActionResult> {
  const query = new URLSearchParams({ api_key: params.apiKey });

  let response: Response;
  try {
    response = await fetch(`${WINDSOR_BASE}/${encodeURIComponent(params.connector)}/actions?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: params.account, action: params.action, params: params.params }),
      signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
    });
  } catch {
    throw new WindsorActionError(
      `No se pudo confirmar la acción "${params.action}" en "${params.connector}": la conexión con Windsor se cortó.`,
      false,
    );
  }

  if (!response.ok) {
    throw new WindsorActionError(
      `Windsor rechazó la acción "${params.action}" en "${params.connector}" (${await windsorErrorMessage(response)})`,
      true,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = (await response.json()) as unknown;
    if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    // 2xx sin cuerpo JSON: la acción salió igual, sólo no hay mensaje ni id
  }

  const error = body.error;
  if (error) {
    const detail = typeof error === "string" ? error : ((error as { message?: string }).message ?? "sin detalle");
    throw new WindsorActionError(`Windsor rechazó la acción "${params.action}" en "${params.connector}" (${detail})`, true);
  }

  return {
    message: typeof body.result === "string" ? body.result : null,
    externalId: extractExternalId(body),
  };
}
