// Etiquetas de Zernio espejadas en `conversations.tags` y ejecuciones de los
// workflows de cada pieza (§1.26).
//
// ⚠️ Las llama el webhook con SERVICE ROLE (y el cron): igual que en
// lib/chats/ingest.ts, el aislamiento depende de que TODA query filtre por el
// owner de la cuenta que resolvió el webhook y nunca por algo del body. Los
// eventos de etiquetas y de ejecuciones no traen la cuenta: el owner sale del
// secreto con el que se validó la firma (app/api/zernio/webhook/route.ts), y
// acá sólo se tocan conversaciones de las cuentas de ESE owner.
//
// Zernio es la fuente de verdad: un evento es una señal y se vuelve a pedir el
// contacto entero, así que reenvíos y desorden no dejan el set mal.

import type { AutomationRunRow, ChatsClient } from "@/lib/chats/db";
import type { AccountContext, IngestResult } from "@/lib/chats/ingest";
import { getContact, getContactChannels, listContacts, ZernioError } from "@/lib/chats/zernio";

const CONTACT_PAGES = 10;
const PAGE_SIZE = 100;

function sameTags(a: string[] | null | undefined, b: string[]): boolean {
  const left = [...new Set(a ?? [])].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export type TagSyncResult = { updated: number; error: string | null };

/**
 * Recorre los contactos de la cuenta y deja en cada conversación su contacto y
 * sus etiquetas. Es la red de seguridad del webhook (y lo que llena las
 * etiquetas la primera vez): cruza por `platformIdentifier` = `participant_external_id`.
 */
export async function syncContactTags(db: ChatsClient, account: AccountContext, apiKey: string): Promise<TagSyncResult> {
  const { data: rows, error } = await db
    .from("conversations")
    .select("id, participant_external_id, zernio_contact_id, tags")
    .eq("owner_id", account.ownerId)
    .eq("channel_account_id", account.id);
  if (error) return { updated: 0, error: "No se pudieron leer las conversaciones (¿falta la migración de etiquetas?)." };

  const byParticipant = new Map<string, { id: string; zernio_contact_id: string | null; tags: string[] }>();
  for (const row of rows ?? []) {
    if (row.participant_external_id) byParticipant.set(row.participant_external_id, { id: row.id, zernio_contact_id: row.zernio_contact_id, tags: row.tags ?? [] });
  }

  let updated = 0;
  const now = new Date().toISOString();
  for (let page = 0; page < CONTACT_PAGES; page += 1) {
    let result;
    try {
      result = await listContacts(apiKey, { accountId: account.zernioAccountId, platform: account.channel.toLowerCase(), limit: PAGE_SIZE, skip: page * PAGE_SIZE });
    } catch (caught) {
      return { updated, error: caught instanceof ZernioError ? caught.message : "No se pudieron leer los contactos de Zernio." };
    }
    for (const contact of result.contacts) {
      if (!contact.platformIdentifier) continue;
      const row = byParticipant.get(contact.platformIdentifier);
      if (!row) continue;
      if (row.zernio_contact_id === contact.id && sameTags(row.tags, contact.tags)) continue;
      const { error: updateError } = await db
        .from("conversations")
        .update({ zernio_contact_id: contact.id, tags: contact.tags, tags_synced_at: now })
        .eq("id", row.id)
        .eq("owner_id", account.ownerId);
      if (!updateError) updated += 1;
    }
    if (!result.hasMore) break;
  }
  return { updated, error: null };
}

type ConversationRef = { id: string; channel_account_id: string; tags: string[] };

/** La conversación de un contacto dentro de las cuentas de un owner. */
async function findByContact(db: ChatsClient, ownerId: string, accountIds: string[], contactId: string, apiKey: string): Promise<ConversationRef[]> {
  const { data } = await db
    .from("conversations")
    .select("id, channel_account_id, tags")
    .eq("owner_id", ownerId)
    .in("channel_account_id", accountIds)
    .eq("zernio_contact_id", contactId);
  if (data && data.length > 0) return data as ConversationRef[];

  // Primera vez que vemos este contacto: se busca su id de Instagram en sus canales.
  let identifiers: string[] = [];
  try {
    identifiers = (await getContactChannels(apiKey, contactId)).map((channel) => channel.platformIdentifier).filter((id): id is string => Boolean(id));
  } catch {
    identifiers = [];
  }
  if (identifiers.length === 0) return [];
  const { data: byParticipant } = await db
    .from("conversations")
    .select("id, channel_account_id, tags")
    .eq("owner_id", ownerId)
    .in("channel_account_id", accountIds)
    .in("participant_external_id", identifiers);
  return (byParticipant ?? []) as ConversationRef[];
}

/**
 * Aplica un `contact.tag_added`/`contact.tag_removed`: pide el contacto a
 * Zernio y reemplaza el set de etiquetas de su conversación. Si la persona
 * todavía no tiene conversación en SmokIA no hay nada que actualizar: la
 * sincronización la completa cuando aparezca.
 */
export async function applyContactTagEvent(db: ChatsClient, accounts: AccountContext[], apiKey: string, contactId: string): Promise<IngestResult> {
  const ownerId = accounts[0]?.ownerId;
  if (!ownerId) return { ok: true, changed: false };
  const accountIds = accounts.filter((account) => account.ownerId === ownerId).map((account) => account.id);

  let tags: string[];
  try {
    tags = (await getContact(apiKey, contactId)).tags;
  } catch (caught) {
    // 404: el contacto se borró. No es un error nuestro; otro 4xx/5xx sí se reintenta.
    if (caught instanceof ZernioError && caught.status === 404) return { ok: true, changed: false };
    return { ok: false, error: caught instanceof ZernioError ? caught.message : "No se pudo leer el contacto." };
  }

  const conversations = await findByContact(db, ownerId, accountIds, contactId, apiKey);
  let changed = false;
  const now = new Date().toISOString();
  for (const conversation of conversations) {
    if (sameTags(conversation.tags, tags)) continue;
    const { error } = await db
      .from("conversations")
      .update({ zernio_contact_id: contactId, tags, tags_synced_at: now })
      .eq("id", conversation.id)
      .eq("owner_id", ownerId);
    if (error) return { ok: false, error: "No se pudieron guardar las etiquetas." };
    changed = true;
  }
  return { ok: true, changed };
}

/**
 * Registra una ejecución del workflow de una pieza (§1.26 sub-paso 4). Sólo
 * cuenta las de workflows que SmokIA creó para una pieza de este owner: los
 * demás workflows de la cuenta se ignoran. Si la ejecución trae la
 * conversación, la marca como "llegó por esta pieza" (sólo la primera vez).
 */
export async function recordWorkflowRun(
  db: ChatsClient,
  accounts: AccountContext[],
  event: { workflowId: string; executionId: string; status: "running" | "completed" | "failed"; conversationId: string | null; occurredAt: string },
): Promise<IngestResult> {
  const ownerId = accounts[0]?.ownerId;
  if (!ownerId) return { ok: true, changed: false };
  const accountIds = accounts.filter((account) => account.ownerId === ownerId).map((account) => account.id);

  const { data: automation, error } = await db
    .from("content_automations")
    .select("id, channel_account_id")
    .eq("owner_id", ownerId)
    .in("channel_account_id", accountIds)
    .eq("zernio_workflow_id", event.workflowId)
    .maybeSingle();
  if (error) return { ok: true, changed: false }; // Migración sin aplicar: no hay piezas que medir.
  if (!automation) return { ok: true, changed: false };

  let conversationId: string | null = null;
  if (event.conversationId) {
    const { data: conversation } = await db
      .from("conversations")
      .select("id, source_automation_id")
      .eq("owner_id", ownerId)
      .eq("channel_account_id", automation.channel_account_id)
      .eq("zernio_conversation_id", event.conversationId)
      .maybeSingle();
    if (conversation) {
      conversationId = conversation.id;
      if (!conversation.source_automation_id) {
        await db.from("conversations").update({ source_automation_id: automation.id }).eq("id", conversation.id).eq("owner_id", ownerId);
      }
    }
  }

  const { data: existing } = await db
    .from("automation_runs")
    .select("id, status, conversation_id")
    .eq("owner_id", ownerId)
    .eq("zernio_execution_id", event.executionId)
    .maybeSingle();

  if (existing) {
    // Un "started" que llega tarde no pisa un final ya registrado.
    const patch: Partial<AutomationRunRow> = {};
    if (event.status !== "running") {
      patch.status = event.status;
      patch.finished_at = event.occurredAt;
    }
    if (!existing.conversation_id && conversationId) patch.conversation_id = conversationId;
    if (Object.keys(patch).length === 0) return { ok: true, changed: false };
    await db.from("automation_runs").update(patch).eq("id", existing.id).eq("owner_id", ownerId);
    return { ok: true, changed: true };
  }

  const { error: insertError } = await db.from("automation_runs").insert({
    owner_id: ownerId,
    automation_id: automation.id,
    zernio_execution_id: event.executionId,
    conversation_id: conversationId,
    status: event.status,
    started_at: event.status === "running" ? event.occurredAt : null,
    finished_at: event.status === "running" ? null : event.occurredAt,
  });
  // Dos entregas del mismo evento en paralelo: el unique avisa y la segunda no hace nada.
  if (insertError && insertError.code !== "23505") return { ok: false, error: "No se pudo registrar la ejecución." };
  return { ok: true, changed: !insertError };
}
