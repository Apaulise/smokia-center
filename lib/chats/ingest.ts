// Ingesta del inbox: convierte un evento de Zernio (webhook) o un listado
// (sincronización) en filas de `conversations` y `messages`.
//
// ⚠️ La llama el webhook con SERVICE ROLE y el cron también: el aislamiento entre
// usuarios depende de que TODA query de acá filtre por `account.ownerId` y que
// cada fila insertada lleve ese `owner_id` explícito (CLAUDE.md §4). El owner sale
// de `channel_accounts`, nunca del body del evento. La sincronización manual la
// llama el dueño con su cliente con RLS: mismo código, mismas garantías.
//
// Idempotencia: `messages` es único por (conversation_id, platform_message_id).
// Un webhook reenviado, o el mismo mensaje por webhook y por sincronización, no
// duplica nada; el contador de no leídos sólo sube cuando la fila es nueva.

import { previewOf } from "@/lib/chats/format";
import { findLeadByInstagramHandle } from "@/lib/chats/lead-link";
import type {
  ChannelAccountStatus,
  ChatChannel,
  ChatsClient,
  ConversationInsert,
  ConversationRow,
  DeliveryStatus,
  MessageInsert,
  MessageOrigin,
} from "@/lib/chats/db";
import {
  listConversations,
  listMessages,
  ZernioError,
  type ZernioConversation,
  type ZernioListedMessage,
} from "@/lib/chats/zernio";
import type { NormalizedConversation, NormalizedMessage, ParsedWebhook } from "@/lib/chats/webhook";
import { normalizeInstagramHandle } from "@/lib/automation/instagram-intake";
import type { Json } from "@/lib/supabase/database.types";

/** Lo mínimo de `channel_accounts` que necesita la ingesta. */
export type AccountContext = {
  id: string;
  ownerId: string;
  teamId: string | null;
  zernioAccountId: string;
  channel: ChatChannel;
};

export type IngestResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

// ── Conversaciones ──────────────────────────────────────────────────────────

async function findConversation(
  db: ChatsClient,
  account: AccountContext,
  zernioConversationId: string,
): Promise<ConversationRow | null> {
  const { data } = await db
    .from("conversations")
    .select("*")
    .eq("owner_id", account.ownerId)
    .eq("channel_account_id", account.id)
    .eq("zernio_conversation_id", zernioConversationId)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

type ConversationSeed = {
  zernioConversationId: string;
  participantExternalId: string | null;
  participantHandle: string | null;
  participantName: string | null;
  participantPicture: string | null;
  profile: Json | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  threadOwner?: string | null;
};

/** La conversación existente o una nueva, enlazada al lead si el @ coincide con uno. */
async function ensureConversation(
  db: ChatsClient,
  account: AccountContext,
  seed: ConversationSeed,
): Promise<{ row: ConversationRow; created: boolean } | null> {
  const existing = await findConversation(db, account, seed.zernioConversationId);
  if (existing) return { row: existing, created: false };

  const leadId = account.channel === "INSTAGRAM" ? await findLeadByInstagramHandle(db, account.ownerId, seed.participantHandle) : null;

  const insert: ConversationInsert = {
    owner_id: account.ownerId,
    team_id: account.teamId,
    channel_account_id: account.id,
    channel: account.channel,
    zernio_conversation_id: seed.zernioConversationId,
    participant_external_id: seed.participantExternalId,
    participant_handle: seed.participantHandle,
    participant_name: seed.participantName,
    participant_picture: seed.participantPicture,
    participant_profile: seed.profile,
    lead_id: leadId,
    last_message_at: seed.lastMessageAt ?? null,
    unread_count: Math.max(0, seed.unreadCount ?? 0),
    thread_owner: seed.threadOwner ?? null,
  };
  const { data, error } = await db.from("conversations").insert(insert).select("*").single();
  if (!error && data) return { row: data as ConversationRow, created: true };

  // Dos eventos del mismo cliente en paralelo: el unique avisa y el segundo la encuentra.
  if (error?.code === UNIQUE_VIOLATION) {
    const raced = await findConversation(db, account, seed.zernioConversationId);
    if (raced) return { row: raced, created: false };
  }
  return null;
}

// ── Webhook ─────────────────────────────────────────────────────────────────

function messageRow(account: AccountContext, conversationId: string, message: NormalizedMessage): MessageInsert {
  return {
    owner_id: account.ownerId,
    team_id: account.teamId,
    conversation_id: conversationId,
    platform_message_id: message.platformMessageId,
    direction: message.direction,
    origin: message.origin,
    body: message.body,
    attachments: message.attachments as unknown as Json,
    standby: message.standby,
    delivery_status: message.direction === "OUT" ? "sent" : null,
    occurred_at: message.occurredAt,
  };
}

async function ingestMessage(
  db: ChatsClient,
  account: AccountContext,
  message: NormalizedMessage,
  conversation: NormalizedConversation,
): Promise<IngestResult> {
  const ensured = await ensureConversation(db, account, {
    zernioConversationId: conversation.zernioConversationId,
    participantExternalId: conversation.participantExternalId,
    participantHandle: conversation.participantHandle,
    participantName: conversation.participantName,
    participantPicture: conversation.participantPicture,
    profile: conversation.profile,
  });
  if (!ensured) return { ok: false, error: "No se pudo guardar la conversación." };
  const { row: current } = ensured;

  const { data: inserted, error } = await db
    .from("messages")
    .upsert(messageRow(account, current.id, message), {
      onConflict: "conversation_id,platform_message_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) return { ok: false, error: "No se pudo guardar el mensaje." };

  // Duplicado (reintento del webhook o ya traído por la sincronización): nada más que hacer.
  if (!inserted || inserted.length === 0) return { ok: true, changed: false };

  const incoming = message.direction === "IN";
  const isLatest = !current.last_message_at || Date.parse(message.occurredAt) >= Date.parse(current.last_message_at);

  const patch: Partial<ConversationRow> = {
    last_message_at: later(current.last_message_at, message.occurredAt),
  };
  if (isLatest) patch.last_message_preview = previewOf(message.body, message.attachments as unknown as Json);

  if (incoming) {
    patch.last_inbound_at = later(current.last_inbound_at, message.occurredAt);
    // Una conversación recién creada nace con 0, así que el primer entrante deja 1.
    patch.unread_count = current.unread_count + 1;
    // El cliente volvió a escribir: si estaba archivada, vuelve a la bandeja.
    if (current.status === "ARCHIVADA") patch.status = "ACTIVA";
    // standby = otra app (ManyChat, Instagram Inbox) es dueña del hilo; si no, responde Zernio.
    patch.thread_owner = message.standby ? "other" : "app";
  }

  // Datos del participante que llegaron después (el primer evento puede traer menos).
  if (conversation.participantName && conversation.participantName !== current.participant_name) {
    patch.participant_name = conversation.participantName;
  }
  if (conversation.participantPicture && conversation.participantPicture !== current.participant_picture) {
    patch.participant_picture = conversation.participantPicture;
  }
  if (conversation.participantExternalId && !current.participant_external_id) {
    patch.participant_external_id = conversation.participantExternalId;
  }
  if (conversation.profile) patch.participant_profile = conversation.profile;
  if (conversation.participantHandle && conversation.participantHandle !== current.participant_handle) {
    patch.participant_handle = conversation.participantHandle;
  }
  if (!current.lead_id && account.channel === "INSTAGRAM") {
    const leadId = await findLeadByInstagramHandle(db, account.ownerId, conversation.participantHandle ?? current.participant_handle);
    if (leadId) patch.lead_id = leadId;
  }

  const { error: updateError } = await db
    .from("conversations")
    .update(patch)
    .eq("id", current.id)
    .eq("owner_id", account.ownerId);
  if (updateError) return { ok: false, error: "No se pudo actualizar la conversación." };

  return { ok: true, changed: true };
}

const DELIVERY_RANK: Record<DeliveryStatus, number> = { sent: 0, failed: 0, delivered: 1, read: 2, played: 3 };

async function ingestDelivery(
  db: ChatsClient,
  account: AccountContext,
  event: Extract<ParsedWebhook, { kind: "delivery" }>,
): Promise<IngestResult> {
  const conversation = await findConversation(db, account, event.conversationId);
  if (!conversation) return { ok: true, changed: false };

  const { data: message } = await db
    .from("messages")
    .select("id, delivery_status")
    .eq("owner_id", account.ownerId)
    .eq("conversation_id", conversation.id)
    .eq("platform_message_id", event.platformMessageId)
    .eq("direction", "OUT")
    .maybeSingle();
  if (!message) return { ok: true, changed: false };

  const currentRank = message.delivery_status ? DELIVERY_RANK[message.delivery_status as DeliveryStatus] : -1;
  // Un "enviado" tardío no pisa un "leído"; un fallo sí es la última palabra.
  if (event.status !== "failed" && DELIVERY_RANK[event.status] <= currentRank) return { ok: true, changed: false };

  await db
    .from("messages")
    .update({ delivery_status: event.status })
    .eq("id", message.id)
    .eq("owner_id", account.ownerId);
  return { ok: true, changed: true };
}

async function ingestEditOrDelete(
  db: ChatsClient,
  account: AccountContext,
  event: Extract<ParsedWebhook, { kind: "message_edited" | "message_deleted" }>,
): Promise<IngestResult> {
  const conversation = await findConversation(db, account, event.conversationId);
  if (!conversation) return { ok: true, changed: false };

  // Si el cliente borra el mensaje, la intención es que no quede: se vacía el contenido.
  // Zernio conserva el original para moderación; acá no hace falta.
  const patch =
    event.kind === "message_edited"
      ? { body: event.body, edited: true }
      : { body: null, attachments: [] as unknown as Json, deleted: true };

  const { data } = await db
    .from("messages")
    .update(patch)
    .eq("owner_id", account.ownerId)
    .eq("conversation_id", conversation.id)
    .eq("platform_message_id", event.platformMessageId)
    .select("id");
  return { ok: true, changed: (data?.length ?? 0) > 0 };
}

/**
 * Aplica un evento ya verificado y parseado. `account` es la cuenta que
 * resolvió el webhook por `zernio_account_id`, y de ahí sale el owner.
 */
export async function ingestWebhookEvent(
  db: ChatsClient,
  account: AccountContext,
  event: ParsedWebhook,
): Promise<IngestResult> {
  switch (event.kind) {
    case "message":
      return ingestMessage(db, account, event.message, event.conversation);
    case "delivery":
      return ingestDelivery(db, account, event);
    case "message_edited":
    case "message_deleted":
      return ingestEditOrDelete(db, account, event);
    case "control": {
      const { data } = await db
        .from("conversations")
        .update({ thread_owner: event.owner })
        .eq("owner_id", account.ownerId)
        .eq("channel_account_id", account.id)
        .eq("zernio_conversation_id", event.conversationId)
        .select("id");
      return { ok: true, changed: (data?.length ?? 0) > 0 };
    }
    case "account": {
      const status: ChannelAccountStatus = event.connected ? "ACTIVA" : "ERROR";
      await db
        .from("channel_accounts")
        .update({ status, status_detail: event.connected ? null : (event.reason ?? "Zernio avisó que la cuenta se desconectó.") })
        .eq("id", account.id)
        .eq("owner_id", account.ownerId);
      return { ok: true, changed: true };
    }
    default:
      return { ok: true, changed: false };
  }
}

// ── Sincronización (historial y reconciliación) ─────────────────────────────

export type SyncOptions = {
  /** Tope de conversaciones cuyos mensajes se piden en una corrida (la API de Zernio limita por minuto). */
  maxFetches?: number;
  now?: () => Date;
};

export type SyncResult = {
  conversations: number;
  messages: number;
  /** Conversaciones que quedaron sin traer su historial: volver a sincronizar. */
  pending: number;
  rateLimited: boolean;
  /** Mensaje para mostrar si la corrida cortó por un error. */
  error: string | null;
};

const FIRST_SYNC_MESSAGES = 100;
const RECONCILE_MESSAGES = 40;
const DEFAULT_MAX_FETCHES = 40;

function handleFromConversation(listed: ZernioConversation): string | null {
  return normalizeInstagramHandle(listed.participantUsername) ?? normalizeInstagramHandle(listed.url);
}

function listedOrigin(message: ZernioListedMessage): MessageOrigin {
  return message.direction === "incoming" ? "CLIENTE" : "HISTORIAL";
}

function listedRow(account: AccountContext, conversationId: string, message: ZernioListedMessage): MessageInsert | null {
  const when = message.sentAt ?? message.createdAt;
  const time = when ? Date.parse(when) : Number.NaN;
  if (Number.isNaN(time)) return null;
  const attachments = (message.attachments ?? []).map((attachment) => ({
    type: attachment.type,
    ...(attachment.originalType ? { originalType: attachment.originalType } : {}),
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(attachment.url ? { url: attachment.url } : {}),
  }));
  const status = message.deliveryStatus && message.deliveryStatus in DELIVERY_RANK ? (message.deliveryStatus as DeliveryStatus) : null;
  return {
    owner_id: account.ownerId,
    team_id: account.teamId,
    conversation_id: conversationId,
    platform_message_id: message.id,
    direction: message.direction === "incoming" ? "IN" : "OUT",
    origin: listedOrigin(message),
    body: message.isDeleted ? null : (message.message ?? null),
    attachments: (message.isDeleted ? [] : attachments) as unknown as Json,
    delivery_status: message.direction === "outgoing" ? (status ?? "sent") : null,
    edited: message.isEdited === true,
    deleted: message.isDeleted === true,
    occurred_at: new Date(time).toISOString(),
  };
}

/**
 * Trae de Zernio las conversaciones más recientes de la cuenta (hasta 100: el
 * listado no pagina) y, de cada una cuyo historial falta o quedó atrás, sus
 * mensajes. Sirve para el backfill al conectar, para el botón "Sincronizar" y
 * para el cron que repara webhooks perdidos.
 *
 * Es idempotente y corta sin romper si Zernio limita el ritmo (429): lo que no
 * alcanzó queda en `pending` y la próxima corrida sigue.
 */
export async function syncChannelAccount(
  db: ChatsClient,
  account: AccountContext,
  apiKey: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const now = (options.now ?? (() => new Date()))();
  const maxFetches = options.maxFetches ?? DEFAULT_MAX_FETCHES;
  const result: SyncResult = { conversations: 0, messages: 0, pending: 0, rateLimited: false, error: null };

  let listed: ZernioConversation[];
  try {
    ({ conversations: listed } = await listConversations(apiKey, {
      accountId: account.zernioAccountId,
      platform: account.channel.toLowerCase(),
      limit: 100,
    }));
  } catch (error) {
    result.error = error instanceof ZernioError ? error.message : "No se pudo leer la lista de conversaciones.";
    result.rateLimited = error instanceof ZernioError && error.status === 429;
    return result;
  }

  let fetches = 0;
  for (const item of listed) {
    // Conversaciones de otro tipo de hilo (p. ej. carpeta de solicitudes) no se espejan.
    if (item.platform !== account.channel.toLowerCase()) continue;

    const ensured = await ensureConversation(db, account, {
      zernioConversationId: item.id,
      participantExternalId: item.participantId ?? null,
      participantHandle: handleFromConversation(item),
      participantName: item.participantName ?? null,
      participantPicture: item.participantPicture ?? null,
      profile: item.instagramProfile ? (item.instagramProfile as Json) : null,
      unreadCount: item.unreadCount ?? 0,
      threadOwner: item.threadControl === "other" ? "other" : null,
    });
    if (!ensured) continue;
    result.conversations += 1;
    const current = ensured.row;

    const updatedAt = item.updatedTime ? Date.parse(item.updatedTime) : Number.NaN;
    const stored = current.last_message_at ? Date.parse(current.last_message_at) : Number.NaN;
    const behind = !Number.isNaN(updatedAt) && (Number.isNaN(stored) || updatedAt > stored + 1000);
    const needsFetch = !current.history_synced_at || behind;
    if (!needsFetch) continue;

    if (fetches >= maxFetches) {
      result.pending += 1;
      continue;
    }
    fetches += 1;

    let messages: ZernioListedMessage[];
    try {
      messages = await listMessages(apiKey, item.id, {
        accountId: account.zernioAccountId,
        limit: current.history_synced_at ? RECONCILE_MESSAGES : FIRST_SYNC_MESSAGES,
        sortOrder: "desc",
      });
    } catch (error) {
      if (error instanceof ZernioError && error.status === 429) {
        result.rateLimited = true;
        result.pending += 1;
        // Con el límite alcanzado, lo que queda no se intenta: se cuenta como pendiente.
        const remaining = listed.length - listed.indexOf(item) - 1;
        result.pending += Math.max(0, remaining);
        break;
      }
      result.pending += 1;
      continue;
    }

    const rows = messages.map((message) => listedRow(account, current.id, message)).filter((row): row is MessageInsert => row !== null);
    if (rows.length > 0) {
      const { data: inserted, error } = await db
        .from("messages")
        .upsert(rows, { onConflict: "conversation_id,platform_message_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        result.pending += 1;
        continue;
      }
      result.messages += inserted?.length ?? 0;
    }

    const newest = rows.reduce<MessageInsert | null>(
      (best, row) => (!best || Date.parse(row.occurred_at as string) > Date.parse(best.occurred_at as string) ? row : best),
      null,
    );
    const newestInbound = rows
      .filter((row) => row.direction === "IN")
      .reduce<string | null>((best, row) => later(best, row.occurred_at as string), null);

    const patch: Partial<ConversationRow> = {
      history_synced_at: now.toISOString(),
      last_inbound_at: later(current.last_inbound_at, newestInbound),
    };
    if (newest && (!current.last_message_at || Date.parse(newest.occurred_at as string) >= Date.parse(current.last_message_at))) {
      patch.last_message_at = newest.occurred_at as string;
      patch.last_message_preview = previewOf(newest.body, newest.attachments);
    } else if (!current.last_message_at && item.updatedTime) {
      patch.last_message_at = new Date(item.updatedTime).toISOString();
    }
    await db.from("conversations").update(patch).eq("id", current.id).eq("owner_id", account.ownerId);
  }

  await db
    .from("channel_accounts")
    .update({ last_synced_at: now.toISOString() })
    .eq("id", account.id)
    .eq("owner_id", account.ownerId);

  return result;
}
