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

export interface WindsorActionParams {
  apiKey: string;
  connector: string;
  account: string;
  action: string;
  params: Record<string, unknown>;
}

/** Ejecuta una acción de escritura (ej. publicar) contra `{connector}/actions`. */
export async function runWindsorAction(params: WindsorActionParams): Promise<{ externalId: string }> {
  const query = new URLSearchParams({ api_key: params.apiKey });
  const response = await fetch(`${WINDSOR_BASE}/${encodeURIComponent(params.connector)}/actions?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: params.account, action: params.action, params: params.params }),
  });

  if (!response.ok) {
    throw new Error(
      `Windsor rechazó la acción "${params.action}" en "${params.connector}" (${await windsorErrorMessage(response)})`,
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const externalId = body.id ?? body.external_id ?? body.media_id;
  if (externalId === undefined) {
    throw new Error(`Windsor no devolvió un id para la acción "${params.action}"`);
  }
  return { externalId: String(externalId) };
}
