/**
 * Cliente HTTP crudo contra la API de Apify — sin SDK, en línea con el resto
 * del proyecto (fetch directo, ver lib/settings/actions.ts).
 */

const APIFY_BASE = "https://api.apify.com/v2";

export const APIFY_TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED",
]);

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd: number | null;
  /**
   * Lo que cuesta la corrida contando lo que el actor ya cobró por evento.
   * `usageTotalUsd` sola puede quedarse corta al terminar: en `apify/instagram-scraper`
   * (pago por resultado) dio US$ 0,0081 al reconciliar y US$ 0,054 minutos después,
   * porque los eventos cobrados se contabilizan con demora. Los actores que no
   * cobran por evento devuelven el mismo número que `usageTotalUsd`.
   */
  costUsd: number | null;
}

/** Suma `chargedEventCounts × eventPriceUsd`. null si el actor no cobra por evento o falta algún precio. */
function chargedEventsUsd(data: Record<string, unknown>): number | null {
  const counts = data.chargedEventCounts as Record<string, unknown> | undefined;
  const pricing = (data.pricingInfo as { pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: unknown }> } } | undefined)
    ?.pricingPerEvent?.actorChargeEvents;
  if (!counts || !pricing) return null;

  let total = 0;
  for (const [event, count] of Object.entries(counts)) {
    if (typeof count !== "number" || count === 0) continue;
    const price = pricing[event]?.eventPriceUsd;
    if (typeof price !== "number") return null; // un evento sin precio conocido: mejor no adivinar
    total += count * price;
  }
  return total;
}

function mapRun(data: Record<string, unknown>): ApifyRun {
  const usage = data.usageTotalUsd ?? (data.usageUsd as Record<string, unknown> | undefined)?.total;
  const usageTotalUsd = typeof usage === "number" ? usage : null;
  const events = chargedEventsUsd(data);
  return {
    id: String(data.id),
    status: String(data.status),
    defaultDatasetId: String(data.defaultDatasetId),
    usageTotalUsd,
    // El mayor de los dos: si `usageTotalUsd` ya incluye los eventos es igual o más grande, y si todavía no, gana la suma de eventos.
    costUsd: usageTotalUsd === null && events === null ? null : Math.max(usageTotalUsd ?? 0, events ?? 0),
  };
}

/**
 * Lanza una corrida y, si hay una URL pública, registra el webhook que avisa
 * cuando termina. El webhook no es la fuente de datos (Apify no lo firma):
 * sólo dispara la reconciliación, que vuelve a consultar la corrida con este
 * mismo token.
 *
 * Sin `webhookUrl` (dev, donde Apify no puede alcanzar localhost) se omite
 * por completo: Apify valida el `requestUrl` contra su propio servidor y
 * rechaza la corrida entera (400 schema-validation) si apunta a localhost —
 * no es que el webhook simplemente no llegue.
 */
export async function startApifyRun(params: {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  webhookUrl?: string;
}): Promise<ApifyRun> {
  const query = new URLSearchParams();
  if (params.webhookUrl) {
    const webhooks = Buffer.from(
      JSON.stringify([
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"],
          requestUrl: params.webhookUrl,
        },
      ]),
    ).toString("base64");
    query.set("webhooks", webhooks);
  }

  const queryString = query.toString();
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(params.actorId)}/runs${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.input),
  });

  if (!response.ok) {
    throw new Error(`Apify rechazó la corrida (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { data: Record<string, unknown> };
  return mapRun(body.data);
}

/** Re-consulta la corrida con nuestro propio token. Nunca confiar en el body del webhook. */
export async function getApifyRun(params: { token: string; runId: string }): Promise<ApifyRun> {
  const response = await fetch(`${APIFY_BASE}/actor-runs/${params.runId}`, {
    headers: { Authorization: `Bearer ${params.token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar la corrida (${response.status})`);
  }

  const body = (await response.json()) as { data: Record<string, unknown> };
  return mapRun(body.data);
}

async function getApifyDatasetPage(params: {
  token: string;
  datasetId: string;
  offset: number;
  limit: number;
}): Promise<unknown[]> {
  const query = new URLSearchParams({
    clean: "true",
    format: "json",
    offset: String(params.offset),
    limit: String(params.limit),
  });

  const response = await fetch(`${APIFY_BASE}/datasets/${params.datasetId}/items?${query}`, {
    headers: { Authorization: `Bearer ${params.token}` },
  });

  if (!response.ok) {
    throw new Error(`No se pudo leer el dataset (${response.status})`);
  }

  return response.json();
}

/** Pagina el dataset completo. Los actores no devuelven más de unos miles de items por corrida de prueba. */
export async function getAllApifyDatasetItems(params: { token: string; datasetId: string }): Promise<unknown[]> {
  const PAGE_SIZE = 500;
  const items: unknown[] = [];
  let offset = 0;

  while (true) {
    const page = await getApifyDatasetPage({ ...params, offset, limit: PAGE_SIZE });
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return items;
}
