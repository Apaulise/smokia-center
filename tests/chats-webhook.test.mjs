import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAccountId,
  originForOutgoing,
  parseWebhookEvent,
  signBody,
  verifySignature,
} from "../lib/chats/webhook.ts";

const SECRET = "s3cr3t-de-prueba";

// Basado en el ejemplo de https://docs.zernio.com/webhooks/inbox/message-received
function messageEvent(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    event: "message.received",
    timestamp: "2026-01-15T10:00:00Z",
    message: {
      id: "507f1f77bcf86cd799439015",
      conversationId: "507f1f77bcf86cd799439014",
      platform: "instagram",
      platformMessageId: "aWdfZAG1zYW1wbGVfbWVzc2FnZQ",
      direction: "incoming",
      text: "Hola! Sigue disponible?",
      attachments: [],
      sender: { id: "17841400000000001", name: "Sample Customer", username: "Sample_Customer", instagramProfile: { isFollower: true, followerCount: 120 } },
      sentAt: "2026-01-15T10:00:00.000Z",
      isRead: false,
      sentVia: null,
      ...overrides.message,
    },
    conversation: {
      id: "507f1f77bcf86cd799439014",
      platformConversationId: "t_10000000000000001",
      participantId: "17841400000000001",
      participantName: "Sample Customer",
      participantUsername: "sample_customer",
      status: "active",
      ...overrides.conversation,
    },
    account: { id: "acc1", accountId: "acc1", platform: "instagram", username: "sample_brand", ...overrides.account },
    ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
    ...(overrides.top ?? {}),
  };
}

test("la firma es el HMAC-SHA256 hex del body crudo", () => {
  const raw = JSON.stringify(messageEvent());
  const signature = signBody(raw, SECRET);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.equal(verifySignature(raw, signature, SECRET), true);
});

test("falla cerrado: sin firma, sin secreto, firma ajena o body alterado", () => {
  const raw = JSON.stringify(messageEvent());
  const signature = signBody(raw, SECRET);
  assert.equal(verifySignature(raw, null, SECRET), false);
  assert.equal(verifySignature(raw, "", SECRET), false);
  assert.equal(verifySignature(raw, signature, ""), false);
  assert.equal(verifySignature(raw, signature, null), false);
  assert.equal(verifySignature(raw, signBody(raw, "otro-secreto"), SECRET), false);
  assert.equal(verifySignature(`${raw} `, signature, SECRET), false);
  assert.equal(verifySignature(raw, "abc", SECRET), false);
});

test("tolera mayúsculas y el prefijo sha256= en el header", () => {
  const raw = '{"a":1}';
  const signature = signBody(raw, SECRET);
  assert.equal(verifySignature(raw, signature.toUpperCase(), SECRET), true);
  assert.equal(verifySignature(raw, `sha256=${signature}`, SECRET), true);
});

test("extractAccountId lee la cuenta sin confiar en el body", () => {
  assert.equal(extractAccountId(JSON.stringify({ account: { accountId: "A1", id: "B2" } })), "A1");
  assert.equal(extractAccountId(JSON.stringify({ account: { id: "B2" } })), "B2");
  assert.equal(extractAccountId(JSON.stringify({ event: "webhook.test" })), null);
  assert.equal(extractAccountId("no es json"), null);
  assert.equal(extractAccountId(JSON.stringify({ account: { accountId: 5 } })), null);
});

test("message.received: normaliza dirección, origen, @ y perfil", () => {
  const parsed = parseWebhookEvent(messageEvent());
  assert.equal(parsed.kind, "message");
  assert.equal(parsed.accountId, "acc1");
  assert.equal(parsed.message.platformMessageId, "aWdfZAG1zYW1wbGVfbWVzc2FnZQ");
  assert.equal(parsed.message.direction, "IN");
  assert.equal(parsed.message.origin, "CLIENTE");
  assert.equal(parsed.message.body, "Hola! Sigue disponible?");
  assert.equal(parsed.message.occurredAt, "2026-01-15T10:00:00.000Z");
  assert.equal(parsed.message.standby, false);
  assert.equal(parsed.conversation.zernioConversationId, "t_10000000000000001");
  assert.equal(parsed.conversation.participantHandle, "sample_customer");
  assert.equal(parsed.conversation.profile.isFollower, true);
});

test("el @ sale de participantUsername y, si falta, del remitente, normalizado", () => {
  const parsed = parseWebhookEvent(messageEvent({ conversation: { participantUsername: undefined }, message: { sender: { username: "@Mi.Usuario" } } }));
  assert.equal(parsed.conversation.participantHandle, "mi.usuario");
});

test("metadata.standby marca el mensaje como de un hilo de otra app", () => {
  const parsed = parseWebhookEvent(messageEvent({ metadata: { standby: true } }));
  assert.equal(parsed.message.standby, true);
});

test("message.sent: de dónde salió se deduce de sentVia", () => {
  const sent = (sentVia) => parseWebhookEvent(messageEvent({ top: { event: "message.sent" }, message: { direction: "outgoing", sentVia, sender: { id: "biz" } } }));
  assert.equal(sent(null).message.origin, "APP");
  assert.equal(sent("workflow").message.origin, "AUTOMATIZACION");
  assert.equal(sent("comment_automation").message.origin, "AUTOMATIZACION");
  assert.equal(sent("api").message.origin, "ZERNIO");
  assert.equal(sent("human").message.origin, "ZERNIO");
  assert.equal(sent(null).message.direction, "OUT");
  // El saliente no trae al cliente como remitente: el @ no se toma del bot.
  assert.equal(parseWebhookEvent(messageEvent({ top: { event: "message.sent" }, conversation: { participantUsername: undefined }, message: { direction: "outgoing", sender: { username: "sample_brand" } } })).conversation.participantHandle, null);
  assert.equal(originForOutgoing(undefined), "APP");
});

test("adjuntos: se guarda tipo, tipo original y URL", () => {
  const parsed = parseWebhookEvent(
    messageEvent({ message: { text: null, attachments: [{ type: "share", originalType: "story_mention", url: "https://cdn.example.com/x.jpg", extra: "ignorado" }] } }),
  );
  assert.deepEqual(parsed.message.attachments, [{ type: "share", originalType: "story_mention", url: "https://cdn.example.com/x.jpg" }]);
  assert.equal(parsed.message.body, null);
});

test("editado, borrado, entrega y cambio de control", () => {
  const edited = parseWebhookEvent(messageEvent({ top: { event: "message.edited" }, message: { text: "nuevo texto" } }));
  assert.deepEqual([edited.kind, edited.body, edited.conversationId], ["message_edited", "nuevo texto", "t_10000000000000001"]);

  const deleted = parseWebhookEvent(messageEvent({ top: { event: "message.deleted" } }));
  assert.equal(deleted.kind, "message_deleted");

  for (const [event, status] of [["message.delivered", "delivered"], ["message.read", "read"], ["message.failed", "failed"], ["message.played", "played"]]) {
    const parsed = parseWebhookEvent(messageEvent({ top: { event } }));
    assert.deepEqual([parsed.kind, parsed.status], ["delivery", status]);
  }

  const control = parseWebhookEvent({
    event: "conversation.control_changed",
    conversation: { platformConversationId: "t_1", participantName: "X" },
    account: { accountId: "acc1" },
    control: { owner: "other" },
  });
  assert.deepEqual([control.kind, control.owner, control.conversationId], ["control", "other", "t_1"]);
});

test("cuenta conectada o desconectada", () => {
  const off = parseWebhookEvent({ event: "account.disconnected", account: { accountId: "acc1", reason: "Token vencido" } });
  assert.deepEqual([off.kind, off.connected, off.reason], ["account", false, "Token vencido"]);
  const on = parseWebhookEvent({ event: "account.connected", account: { accountId: "acc1" } });
  assert.equal(on.connected, true);
});

test("test, eventos que no usamos y payloads inválidos", () => {
  assert.equal(parseWebhookEvent({ event: "webhook.test" }).kind, "test");
  assert.deepEqual(parseWebhookEvent({ event: "post.published" }), { kind: "ignored", event: "post.published" });
  assert.equal(parseWebhookEvent({}).kind, "invalid");
  assert.equal(parseWebhookEvent("x").kind, "invalid");
  assert.equal(parseWebhookEvent({ event: "message.received", message: {} }).kind, "invalid");
  assert.equal(parseWebhookEvent(messageEvent({ message: { sentAt: "ayer" } })).kind, "invalid");
  assert.equal(parseWebhookEvent(messageEvent({ account: { id: undefined, accountId: undefined } })).kind, "invalid");
});
