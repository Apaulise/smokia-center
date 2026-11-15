// Parte pura del webhook de Zernio: verificar la firma y convertir el evento en
// algo que la ingesta (lib/chats/ingest.ts) entienda. Sin acceso a la base y
// sin service role, para poder probarla sola (tests/chats-webhook.test.mjs).
//
// Contrato (https://docs.zernio.com/webhooks): POST JSON, `X-Zernio-Event` con
// el nombre, `X-Zernio-Signature` = HMAC-SHA256 hex del BODY CRUDO con el
// secreto que elegimos nosotros al crear el endpoint, responder 2xx en menos de
// 5 s, hasta 7 reintentos y posibles duplicados (de ahí que la ingesta sea
// idempotente por `platformMessageId`).

import { createHmac } from "node:crypto";

import { z } from "zod";

import { normalizeInstagramHandle } from "@/lib/automation/instagram-intake";
import { safeEqual } from "@/lib/crypto";
import type { DeliveryStatus, MessageDirection, MessageOrigin } from "@/lib/chats/db";
import type { Json } from "@/lib/supabase/database.types";

// ── Firma ───────────────────────────────────────────────────────────────────

export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Falla cerrado: sin secreto, sin firma o con una distinta, no pasa. */
export function verifySignature(rawBody: string, header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!header || !secret) return false;
  const received = header.trim().toLowerCase().replace(/^sha256=/, "");
  return safeEqual(signBody(rawBody, secret), received);
}

/**
 * El id de la cuenta de Zernio del evento, leído del body SIN verificar. Sólo
 * sirve para elegir qué secreto probar: la firma es lo que autoriza, y un id
 * inventado lleva a un secreto que no va a coincidir.
 */
export function extractAccountId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { account?: { accountId?: unknown; id?: unknown } };
    const id = parsed?.account?.accountId ?? parsed?.account?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

// ── Esquemas (lenientes: Zernio suma campos sin avisar) ─────────────────────

const instagramProfileSchema = z
  .looseObject({
    isFollower: z.boolean().nullish(),
    isFollowing: z.boolean().nullish(),
    followerCount: z.number().nullish(),
    isVerified: z.boolean().nullish(),
  })
  .nullish();

const attachmentSchema = z.looseObject({
  type: z.string(),
  originalType: z.string().optional(),
  mimeType: z.string().optional(),
  url: z.string().nullish(),
});

const senderSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().nullish(),
  username: z.string().nullish(),
  picture: z.string().nullish(),
  instagramProfile: instagramProfileSchema,
});

const messageSchema = z.looseObject({
  id: z.string().optional(),
  platformMessageId: z.string().min(1),
  direction: z.enum(["incoming", "outgoing"]),
  text: z.string().nullish(),
  attachments: z.array(attachmentSchema).default([]),
  sender: senderSchema.optional(),
  sentAt: z.string(),
  sentVia: z.string().nullish(),
});

const conversationSchema = z.looseObject({
  id: z.string().optional(),
  platformConversationId: z.string().min(1),
  participantId: z.string().nullish(),
  participantName: z.string().nullish(),
  participantUsername: z.string().nullish(),
  participantPicture: z.string().nullish(),
});

const accountSchema = z.looseObject({
  id: z.string().optional(),
  accountId: z.string().optional(),
  username: z.string().nullish(),
  reason: z.string().nullish(),
});

const metadataSchema = z.looseObject({ standby: z.boolean().optional() }).nullish();

const messageEventSchema = z.looseObject({
  event: z.string(),
  message: messageSchema,
  conversation: conversationSchema,
  account: accountSchema,
  metadata: metadataSchema,
});

const controlEventSchema = z.looseObject({
  event: z.string(),
  conversation: conversationSchema,
  account: accountSchema,
  control: z.looseObject({ owner: z.string() }),
});

const accountEventSchema = z.looseObject({
  event: z.string(),
  account: accountSchema,
});

const contactTagEventSchema = z.looseObject({
  event: z.string(),
  contact: z.looseObject({ id: z.string().optional() }).nullish(),
  contactId: z.string().optional(),
  tag: z.string().nullish(),
});

const workflowRunEventSchema = z.looseObject({
  event: z.string(),
  timestamp: z.string().optional(),
  workflow: z.looseObject({ id: z.string().optional() }).nullish(),
  workflowId: z.string().optional(),
  execution: z.looseObject({ id: z.string().optional() }).nullish(),
  executionId: z.string().optional(),
  conversation: z.looseObject({ id: z.string().optional(), platformConversationId: z.string().optional() }).nullish(),
  contact: z.looseObject({ id: z.string().optional() }).nullish(),
});

// ── Resultado ───────────────────────────────────────────────────────────────

export type StoredAttachment = { type: string; originalType?: string; mimeType?: string; url?: string };

export type NormalizedMessage = {
  platformMessageId: string;
  direction: MessageDirection;
  origin: MessageOrigin;
  body: string | null;
  attachments: StoredAttachment[];
  occurredAt: string;
  standby: boolean;
};

export type NormalizedConversation = {
  zernioConversationId: string;
  participantExternalId: string | null;
  participantHandle: string | null;
  participantName: string | null;
  participantPicture: string | null;
  profile: Json | null;
};

export type ParsedWebhook =
  | { kind: "test" }
  | {
      kind: "message";
      /** `message.received` o `message.sent`. */
      event: string;
      accountId: string;
      message: NormalizedMessage;
      conversation: NormalizedConversation;
    }
  | {
      kind: "message_edited";
      accountId: string;
      conversationId: string;
      platformMessageId: string;
      body: string | null;
    }
  | { kind: "message_deleted"; accountId: string; conversationId: string; platformMessageId: string }
  | {
      kind: "delivery";
      accountId: string;
      conversationId: string;
      platformMessageId: string;
      status: DeliveryStatus;
    }
  | { kind: "control"; accountId: string; conversationId: string; owner: string }
  | { kind: "account"; accountId: string; connected: boolean; reason: string | null }
  /**
   * §1.26: cambió una etiqueta de un contacto. El evento NO trae la cuenta (los
   * contactos son del perfil): el dueño sale del secreto que validó la firma.
   * Se trata como señal: la ingesta vuelve a pedir el contacto y reemplaza el set.
   */
  | { kind: "contact_tags"; contactId: string; tag: string | null; added: boolean }
  /** §1.26: empezó, terminó o falló una ejecución de un workflow. Tampoco trae la cuenta. */
  | {
      kind: "workflow_run";
      workflowId: string;
      executionId: string;
      status: "running" | "completed" | "failed";
      conversationId: string | null;
      contactId: string | null;
      occurredAt: string;
    }
  | { kind: "ignored"; event: string }
  | { kind: "invalid"; event: string; reason: string };

/**
 * Quién produjo un mensaje saliente, según `sentVia`:
 *  · workflow, comment-to-DM, secuencia, broadcast → AUTOMATIZACION
 *  · api, human (dashboard de Zernio), bulk-api → ZERNIO
 *  · null → se mandó desde la app de Instagram u otra herramienta (ManyChat…) → APP
 * El CRM no está en la lista: cuando manda él, inserta su propia fila antes de
 * que llegue el eco y esa fila (origin CRM, con sent_by) es la que queda.
 */
export function originForOutgoing(sentVia: string | null | undefined): MessageOrigin {
  switch (sentVia) {
    case "workflow":
    case "comment_automation":
    case "sequence":
    case "broadcast":
      return "AUTOMATIZACION";
    case "api":
    case "human":
    case "bulk-api":
      return "ZERNIO";
    default:
      return "APP";
  }
}

function validDate(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const DELIVERY_EVENTS: Record<string, DeliveryStatus> = {
  "message.delivered": "delivered",
  "message.read": "read",
  "message.played": "played",
  "message.failed": "failed",
};

function accountIdOf(account: z.infer<typeof accountSchema>): string | null {
  return account.accountId ?? account.id ?? null;
}

function fail(event: string, error: z.ZodError | string): ParsedWebhook {
  const reason = typeof error === "string" ? error : (error.issues[0]?.message ?? "payload inválido");
  return { kind: "invalid", event, reason };
}

export function parseWebhookEvent(json: unknown): ParsedWebhook {
  const event = z.looseObject({ event: z.string() }).safeParse(json);
  if (!event.success) return { kind: "invalid", event: "?", reason: "Falta el nombre del evento." };
  const name = event.data.event;

  if (name === "webhook.test") return { kind: "test" };

  if (name === "message.received" || name === "message.sent") {
    const parsed = messageEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const { message, conversation, account, metadata } = parsed.data;
    const accountId = accountIdOf(account);
    if (!accountId) return fail(name, "Falta la cuenta.");
    const occurredAt = validDate(message.sentAt);
    if (!occurredAt) return fail(name, "Fecha inválida.");

    const incoming = message.direction === "incoming";
    const handleSource = conversation.participantUsername ?? (incoming ? message.sender?.username : null);
    const profile = incoming ? (message.sender?.instagramProfile ?? null) : null;

    return {
      kind: "message",
      event: name,
      accountId,
      message: {
        platformMessageId: message.platformMessageId,
        direction: incoming ? "IN" : "OUT",
        origin: incoming ? "CLIENTE" : originForOutgoing(message.sentVia),
        body: message.text ?? null,
        attachments: message.attachments.map((attachment) => ({
          type: attachment.type,
          ...(attachment.originalType ? { originalType: attachment.originalType } : {}),
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          ...(attachment.url ? { url: attachment.url } : {}),
        })),
        occurredAt,
        standby: metadata?.standby === true,
      },
      conversation: {
        zernioConversationId: conversation.platformConversationId,
        participantExternalId: conversation.participantId ?? (incoming ? (message.sender?.id ?? null) : null),
        participantHandle: normalizeInstagramHandle(handleSource),
        participantName: conversation.participantName ?? (incoming ? (message.sender?.name ?? null) : null),
        participantPicture: conversation.participantPicture ?? (incoming ? (message.sender?.picture ?? null) : null),
        profile: profile ? (profile as Json) : null,
      },
    };
  }

  if (name === "message.edited" || name === "message.deleted") {
    const parsed = messageEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const accountId = accountIdOf(parsed.data.account);
    if (!accountId) return fail(name, "Falta la cuenta.");
    const base = {
      accountId,
      conversationId: parsed.data.conversation.platformConversationId,
      platformMessageId: parsed.data.message.platformMessageId,
    };
    return name === "message.edited"
      ? { kind: "message_edited", ...base, body: parsed.data.message.text ?? null }
      : { kind: "message_deleted", ...base };
  }

  if (name in DELIVERY_EVENTS) {
    const parsed = messageEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const accountId = accountIdOf(parsed.data.account);
    if (!accountId) return fail(name, "Falta la cuenta.");
    return {
      kind: "delivery",
      accountId,
      conversationId: parsed.data.conversation.platformConversationId,
      platformMessageId: parsed.data.message.platformMessageId,
      status: DELIVERY_EVENTS[name],
    };
  }

  if (name === "conversation.control_changed") {
    const parsed = controlEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const accountId = accountIdOf(parsed.data.account);
    if (!accountId) return fail(name, "Falta la cuenta.");
    return {
      kind: "control",
      accountId,
      conversationId: parsed.data.conversation.platformConversationId,
      owner: parsed.data.control.owner,
    };
  }

  if (name === "account.connected" || name === "account.disconnected") {
    const parsed = accountEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const accountId = accountIdOf(parsed.data.account);
    if (!accountId) return fail(name, "Falta la cuenta.");
    return {
      kind: "account",
      accountId,
      connected: name === "account.connected",
      reason: parsed.data.account.reason ?? null,
    };
  }

  if (name === "contact.tag_added" || name === "contact.tag_removed") {
    const parsed = contactTagEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const contactId = parsed.data.contact?.id ?? parsed.data.contactId ?? null;
    if (!contactId) return fail(name, "Falta el contacto.");
    return { kind: "contact_tags", contactId, tag: parsed.data.tag ?? null, added: name === "contact.tag_added" };
  }

  if (name === "workflow.run.started" || name === "workflow.run.completed" || name === "workflow.run.failed") {
    const parsed = workflowRunEventSchema.safeParse(json);
    if (!parsed.success) return fail(name, parsed.error);
    const workflowId = parsed.data.workflow?.id ?? parsed.data.workflowId ?? null;
    const executionId = parsed.data.execution?.id ?? parsed.data.executionId ?? null;
    if (!workflowId || !executionId) return fail(name, "Falta el workflow o la ejecución.");
    const conversation = parsed.data.conversation;
    return {
      kind: "workflow_run",
      workflowId,
      executionId,
      status: name === "workflow.run.started" ? "running" : name === "workflow.run.completed" ? "completed" : "failed",
      conversationId: conversation?.id ?? conversation?.platformConversationId ?? null,
      contactId: parsed.data.contact?.id ?? null,
      occurredAt: (parsed.data.timestamp && validDate(parsed.data.timestamp)) || new Date().toISOString(),
    };
  }

  return { kind: "ignored", event: name };
}

/** Los eventos que no traen la cuenta: el webhook resuelve el dueño por el secreto que validó la firma. */
export function isAccountlessEvent(event: ParsedWebhook): event is Extract<ParsedWebhook, { kind: "contact_tags" | "workflow_run" }> {
  return event.kind === "contact_tags" || event.kind === "workflow_run";
}
