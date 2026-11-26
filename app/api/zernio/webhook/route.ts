// ⚠️ SERVICE ROLE — saltea RLS. Ver CLAUDE.md §4: cualquier cambio acá se revisa a mano.
//
// Webhook de Zernio (inbox omnicanal, Plans/01-inbox-omnicanal-zernio.md §1.25).
// A diferencia del de Apify, éste SÍ viene firmado: `X-Zernio-Signature` es el
// HMAC-SHA256 del body crudo con el secreto que generamos al crear el endpoint
// (lib/chats/actions.ts) y que guardamos cifrado por cuenta.
//
// El aislamiento entre usuarios depende de este archivo y de lib/chats/ingest.ts:
//   1. El owner sale de `channel_accounts` por `zernio_account_id`, NUNCA del
//      body. El id del body sólo elige qué secreto probar; lo que autoriza es
//      que la firma coincida.
//   2. Cada query filtra por ese owner y cada fila lleva `owner_id` explícito.
//   3. Falla cerrado: cuenta desconocida, sin secreto o firma distinta = 401,
//      con la misma respuesta en los tres casos (no se revela qué cuentas existen).
//   4. §1.26: los eventos de etiquetas (`contact.tag_*`) y de ejecuciones de
//      workflows (`workflow.run.*`) NO traen la cuenta. Para ésos el owner sale
//      del secreto con el que se validó la firma (cada conexión tiene el suyo),
//      y la ingesta sólo toca filas de las cuentas de ese owner. Nunca del body.
//
// Zernio exige 2xx en menos de 5 s y reintenta (hasta 7 veces) ante 5xx o
// timeout; los duplicados son normales, por eso la ingesta es idempotente.
// Nunca se loguea el body (son mensajes de personas) ni los secretos.

import { NextResponse, type NextRequest } from "next/server";

import { applyZernioCrmEvent, bodyEventId, contactHintFromZernio, parseZernioCrmBody } from "@/lib/automation/zernio-crm";
import { asChats, type ChatChannel } from "@/lib/chats/db";
import { ingestWebhookEvent, type AccountContext, type IngestResult } from "@/lib/chats/ingest";
import { applyContactTagEvent, recordWorkflowRun } from "@/lib/chats/tags";
import { extractAccountId, isAccountlessEvent, parseWebhookEvent, verifySignature } from "@/lib/chats/webhook";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const MAX_BODY_BYTES = 1_000_000;
/** Para `webhook.test`, que no trae cuenta: se prueba contra los secretos de las cuentas, con tope. */
const MAX_TEST_SECRETS = 20;

const unauthorized = () => NextResponse.json({ error: "No autorizado." }, { status: 401 });

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body demasiado grande." }, { status: 413 });
  }

  const signature = request.headers.get("x-zernio-signature");
  if (!signature) return unauthorized();

  const admin = createAdminClient();
  const db = asChats(admin);
  const zernioAccountId = extractAccountId(rawBody);

  let account: AccountContext | null = null;
  /** Para los eventos sin cuenta: las cuentas cuyo secreto validó la firma, con su API key cifrada. */
  let signedBy: Array<{ context: AccountContext; apiKeyEncrypted: string }> = [];

  try {
    if (zernioAccountId) {
      const { data } = await db
        .from("channel_accounts")
        .select("id, owner_id, team_id, channel, zernio_account_id")
        .eq("zernio_account_id", zernioAccountId)
        .maybeSingle();
      if (!data) return unauthorized();

      const { data: secretRow } = await db
        .from("channel_secrets")
        .select("webhook_secret_encrypted")
        .eq("channel_account_id", data.id)
        .eq("owner_id", data.owner_id)
        .maybeSingle();
      if (!secretRow) return unauthorized();

      if (!verifySignature(rawBody, signature, decrypt(secretRow.webhook_secret_encrypted))) return unauthorized();

      account = {
        id: data.id,
        ownerId: data.owner_id,
        teamId: data.team_id,
        zernioAccountId: data.zernio_account_id,
        channel: data.channel,
      };
    } else {
      // Sin cuenta: el `webhook.test` del botón "Probar" y los eventos de §1.26 (etiquetas y
      // ejecuciones). Vale si la firma coincide con algún secreto, y ESE secreto dice de quién es.
      const { data: secrets } = await db
        .from("channel_secrets")
        .select("channel_account_id, owner_id, api_key_encrypted, webhook_secret_encrypted")
        .limit(MAX_TEST_SECRETS);
      const matching = (secrets ?? []).filter((row) => {
        try {
          return verifySignature(rawBody, signature, decrypt(row.webhook_secret_encrypted));
        } catch {
          return false;
        }
      });
      if (matching.length === 0) return unauthorized();

      // Un mismo secreto lo comparten las cuentas de UNA conexión, que es de un solo dueño.
      const ownerId = matching[0].owner_id;
      const mine = matching.filter((row) => row.owner_id === ownerId);
      const { data: accounts } = await db
        .from("channel_accounts")
        .select("id, owner_id, team_id, channel, zernio_account_id")
        .eq("owner_id", ownerId)
        .in(
          "id",
          mine.map((row) => row.channel_account_id),
        );
      signedBy = (accounts ?? []).map((row) => ({
        context: {
          id: row.id,
          ownerId: row.owner_id,
          teamId: row.team_id,
          zernioAccountId: row.zernio_account_id,
          channel: row.channel as ChatChannel,
        },
        apiKeyEncrypted: mine.find((secret) => secret.channel_account_id === row.id)?.api_key_encrypted ?? "",
      }));
    }
  } catch (error) {
    // APP_ENCRYPTION_KEY cambiada o secreto corrupto: error nuestro, que Zernio reintente.
    console.error("zernio webhook: no se pudo verificar la firma", error instanceof Error ? error.name : "error");
    return NextResponse.json({ error: "No se pudo verificar la firma." }, { status: 500 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const event = parseWebhookEvent(json);
  if (event.kind === "test") return NextResponse.json({ ok: true, test: true });
  if (event.kind === "invalid") {
    console.error("zernio webhook: payload inválido", event.event, event.reason);
    return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
  }
  if (event.kind === "ignored") return NextResponse.json({ ok: true, ignored: event.event });

  if (isAccountlessEvent(event)) {
    // Con cuenta en el body también sirve (por si Zernio la agrega): se usa esa y su secreto.
    const contexts = account ? [account] : signedBy.map((entry) => entry.context);
    if (contexts.length === 0) return unauthorized();
    const ownerId = contexts[0].ownerId;
    let apiKey: string | null = null;
    try {
      if (account) {
        const { data } = await db
          .from("channel_secrets")
          .select("api_key_encrypted")
          .eq("channel_account_id", account.id)
          .eq("owner_id", account.ownerId)
          .maybeSingle();
        apiKey = data ? decrypt(data.api_key_encrypted) : null;
      } else {
        const encrypted = signedBy.find((entry) => entry.apiKeyEncrypted)?.apiKeyEncrypted;
        apiKey = encrypted ? decrypt(encrypted) : null;
      }
    } catch {
      apiKey = null;
    }

    let result: IngestResult = { ok: true, changed: false };
    if (event.kind === "contact_tags") {
      if (!apiKey) return NextResponse.json({ error: "No se pudo leer la API key." }, { status: 500 });
      result = await applyContactTagEvent(db, contexts, apiKey, event.contactId);
    } else if (event.kind === "workflow_run") {
      result = await recordWorkflowRun(db, contexts, event);
    }
    if (!result.ok) {
      console.error("zernio webhook: no se pudo procesar", event.kind, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // La misma entrega puede crear el lead (etiqueta de calificación, respuesta
    // de tareas) o anotar la corrida. Si falta la migración, el inbox igual
    // responde 200: los mensajes y las etiquetas no dependen de esa tabla.
    const crm = parseZernioCrmBody(json, bodyEventId(rawBody));
    if (crm.kind === "action") {
      const applied = await applyZernioCrmEvent(admin, ownerId, crm.action, {
        lookup: apiKey ? (contactId) => contactHintFromZernio(apiKey, contactId) : undefined,
      });
      if (!applied.ok && applied.reason === "error") {
        console.error("zernio webhook: no se pudo pasar al CRM", applied.message);
        return NextResponse.json({ error: applied.message }, { status: 500 });
      }
      if (!applied.ok) console.error("zernio webhook: CRM en espera de migración");
    }

    return NextResponse.json({ ok: true, changed: result.changed });
  }

  if (!account) return unauthorized();

  const result = await ingestWebhookEvent(db, account, event);
  if (!result.ok) {
    console.error("zernio webhook: no se pudo procesar", event.kind, result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
