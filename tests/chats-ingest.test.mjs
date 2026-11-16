import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";

import { ingestWebhookEvent, syncChannelAccount } from "../lib/chats/ingest.ts";
import { parseWebhookEvent } from "../lib/chats/webhook.ts";

// ── Base en memoria: lo justo del query builder de supabase-js que usa la ingesta ──

const DEFAULTS = {
  conversations: {
    participant_external_id: null,
    participant_handle: null,
    participant_name: null,
    participant_picture: null,
    participant_profile: null,
    lead_id: null,
    status: "ACTIVA",
    last_message_at: null,
    last_message_preview: null,
    last_inbound_at: null,
    unread_count: 0,
    thread_owner: null,
    history_synced_at: null,
    team_id: null,
  },
  messages: { attachments: [], standby: false, edited: false, deleted: false, delivery_status: null, sent_by: null, body: null, team_id: null },
};

const UNIQUE = {
  conversations: ["channel_account_id", "zernio_conversation_id"],
  messages: ["conversation_id", "platform_message_id"],
};

function valueAt(row, column) {
  if (column.includes("->>")) {
    const [base, key] = column.split("->>");
    return row[base]?.[key] ?? null;
  }
  return row[column];
}

function likeToRegExp(pattern) {
  // % = cualquier cosa, _ = un carácter, \\x = el carácter x literal (como hace Postgres).
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "\\" && index + 1 < pattern.length) {
      source += pattern[++index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (char === "%") source += ".*";
    else if (char === "_") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "i");
}

class FakeQuery {
  constructor(db, table) {
    Object.assign(this, { db, table, op: "select", filters: [], orderBy: null, limitN: null, mode: null, returning: false });
  }
  select() {
    this.returning = true;
    return this;
  }
  insert(payload) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload, options = {}) {
    this.op = "upsert";
    this.payload = payload;
    this.options = options;
    return this;
  }
  update(patch) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  eq(column, value) {
    this.filters.push((row) => valueAt(row, column) === value);
    return this;
  }
  gt(column, value) {
    this.filters.push((row) => valueAt(row, column) > value);
    return this;
  }
  ilike(column, pattern) {
    this.filters.push((row) => typeof valueAt(row, column) === "string" && likeToRegExp(pattern).test(valueAt(row, column)));
    return this;
  }
  order(column, { ascending = true } = {}) {
    this.orderBy = { column, ascending };
    return this;
  }
  limit(count) {
    this.limitN = count;
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this.exec();
  }
  single() {
    this.mode = "one";
    return this.exec();
  }
  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  matching() {
    let rows = this.db.rows(this.table).filter((row) => this.filters.every((test) => test(row)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    return this.limitN ? rows.slice(0, this.limitN) : rows;
  }

  conflictWith(row) {
    const columns = UNIQUE[this.table];
    if (!columns) return null;
    return this.db.rows(this.table).find((existing) => columns.every((column) => existing[column] === row[column])) ?? null;
  }

  insertRow(raw) {
    const row = { id: randomUUID(), ...(DEFAULTS[this.table] ?? {}), ...raw };
    this.db.rows(this.table).push(row);
    return row;
  }

  async exec() {
    const clone = (row) => JSON.parse(JSON.stringify(row));
    let data;
    if (this.op === "select") {
      data = this.matching().map(clone);
    } else if (this.op === "update") {
      const rows = this.matching();
      for (const row of rows) Object.assign(row, this.payload);
      data = rows.map(clone);
    } else {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      const written = [];
      for (const raw of payloads) {
        const conflict = this.conflictWith(raw);
        if (conflict) {
          if (this.op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
          if (this.options.ignoreDuplicates) continue;
          Object.assign(conflict, raw);
          written.push(conflict);
          continue;
        }
        written.push(this.insertRow(raw));
      }
      data = written.map(clone);
    }
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "one") return data[0] ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: this.op === "select" || this.returning ? data : null, error: null };
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.tables = { conversations: [], messages: [], channel_accounts: [], leads: [], ...seed };
  }
  rows(table) {
    return (this.tables[table] ??= []);
  }
  from(table) {
    return new FakeQuery(this, table);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const OWNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT_A = { id: "ca1", ownerId: OWNER_A, teamId: null, zernioAccountId: "acc1", channel: "INSTAGRAM" };
const ACCOUNT_B = { id: "cb1", ownerId: OWNER_B, teamId: null, zernioAccountId: "acc2", channel: "INSTAGRAM" };
const LEAD_A = { id: "lead-a", owner_id: OWNER_A, instagram_url: "https://instagram.com/sample_customer", intake: null, dedupe_key: "x", created_at: "2026-01-01T00:00:00Z" };

function event(name, { message = {}, conversation = {}, metadata, extra = {} } = {}) {
  return parseWebhookEvent({
    event: name,
    message: {
      platformMessageId: "m1",
      direction: name === "message.sent" ? "outgoing" : "incoming",
      text: "Hola",
      attachments: [],
      sender: { id: "ig1", name: "Sample Customer", username: "sample_customer" },
      sentAt: "2026-11-13T10:00:00.000Z",
      sentVia: null,
      ...message,
    },
    conversation: { platformConversationId: "t_1", participantId: "ig1", participantName: "Sample Customer", participantUsername: "sample_customer", status: "active", ...conversation },
    account: { accountId: "acc1" },
    ...(metadata ? { metadata } : {}),
    ...extra,
  });
}

const received = (message, more) => event("message.received", { message, ...more });

async function ingest(db, account, parsed) {
  const result = await ingestWebhookEvent(db, account, parsed);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

const conversations = (db) => db.rows("conversations");
const messages = (db) => db.rows("messages");

// ── Webhook ─────────────────────────────────────────────────────────────────

test("el primer mensaje crea la conversación, lo guarda, deja 1 sin leer y enlaza el lead por @", async () => {
  const db = new FakeDb({ leads: [LEAD_A] });
  await ingest(db, ACCOUNT_A, received());

  assert.equal(conversations(db).length, 1);
  const conversation = conversations(db)[0];
  assert.equal(conversation.owner_id, OWNER_A);
  assert.equal(conversation.zernio_conversation_id, "t_1");
  assert.equal(conversation.participant_handle, "sample_customer");
  assert.equal(conversation.lead_id, "lead-a");
  assert.equal(conversation.unread_count, 1);
  assert.equal(conversation.last_inbound_at, "2026-11-13T10:00:00.000Z");
  assert.equal(conversation.last_message_preview, "Hola");
  assert.equal(conversation.thread_owner, "app");

  assert.equal(messages(db).length, 1);
  assert.deepEqual(
    [messages(db)[0].owner_id, messages(db)[0].direction, messages(db)[0].origin, messages(db)[0].body],
    [OWNER_A, "IN", "CLIENTE", "Hola"],
  );
});

test("el mismo evento reenviado no duplica el mensaje ni suma no leídos", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received());
  const again = await ingest(db, ACCOUNT_A, received());
  await ingest(db, ACCOUNT_A, received());

  assert.equal(again.changed, false);
  assert.equal(messages(db).length, 1);
  assert.equal(conversations(db).length, 1);
  assert.equal(conversations(db)[0].unread_count, 1);
});

test("un segundo mensaje suma no leídos y adelanta el último entrante", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received());
  await ingest(db, ACCOUNT_A, received({ platformMessageId: "m2", text: "Cuánto sale?", sentAt: "2026-11-13T10:05:00.000Z" }));

  const conversation = conversations(db)[0];
  assert.equal(messages(db).length, 2);
  assert.equal(conversation.unread_count, 2);
  assert.equal(conversation.last_inbound_at, "2026-11-13T10:05:00.000Z");
  assert.equal(conversation.last_message_preview, "Cuánto sale?");
});

test("un mensaje saliente de una automatización no suma no leídos ni mueve la ventana", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received());
  await ingest(db, ACCOUNT_A, event("message.sent", { message: { platformMessageId: "o1", text: "Gracias por escribir", sentAt: "2026-11-13T10:01:00.000Z", sentVia: "workflow", sender: { id: "biz" } } }));

  const conversation = conversations(db)[0];
  assert.equal(conversation.unread_count, 1);
  assert.equal(conversation.last_inbound_at, "2026-11-13T10:00:00.000Z");
  assert.equal(conversation.last_message_preview, "Gracias por escribir");
  const out = messages(db).find((message) => message.platform_message_id === "o1");
  assert.deepEqual([out.direction, out.origin, out.delivery_status], ["OUT", "AUTOMATIZACION", "sent"]);
});

test("una conversación de otro dueño con el mismo id queda aparte y no se enlaza a leads ajenos", async () => {
  const db = new FakeDb({ leads: [LEAD_A] });
  await ingest(db, ACCOUNT_A, received());
  await ingest(db, ACCOUNT_B, received());

  assert.equal(conversations(db).length, 2);
  const [a, b] = ["ca1", "cb1"].map((accountId) => conversations(db).find((row) => row.channel_account_id === accountId));
  assert.deepEqual([a.owner_id, b.owner_id], [OWNER_A, OWNER_B]);
  assert.equal(a.lead_id, "lead-a");
  assert.equal(b.lead_id, null, "el lead de A no se le enlaza a B");
  for (const row of messages(db)) {
    const conversation = conversations(db).find((item) => item.id === row.conversation_id);
    assert.equal(row.owner_id, conversation.owner_id, "cada mensaje lleva el owner de su conversación");
  }
});

test("lo que se ingresa hereda el team_id de la cuenta compartida", async () => {
  const db = new FakeDb();
  await ingest(db, { ...ACCOUNT_A, teamId: "team-1" }, received());
  assert.equal(conversations(db)[0].team_id, "team-1");
  assert.equal(messages(db)[0].team_id, "team-1");
});

test("standby marca el hilo como de otra app; un mensaje normal lo devuelve; control_changed lo fija", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received({}, { metadata: { standby: true } }));
  assert.equal(conversations(db)[0].thread_owner, "other");
  assert.equal(messages(db)[0].standby, true);

  await ingest(db, ACCOUNT_A, received({ platformMessageId: "m2", sentAt: "2026-11-13T10:02:00.000Z" }));
  assert.equal(conversations(db)[0].thread_owner, "app");

  await ingest(db, ACCOUNT_A, parseWebhookEvent({
    event: "conversation.control_changed",
    conversation: { platformConversationId: "t_1", participantName: "X" },
    account: { accountId: "acc1" },
    control: { owner: "other" },
  }));
  assert.equal(conversations(db)[0].thread_owner, "other");
});

test("si el cliente escribe en una conversación archivada, vuelve a la bandeja", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received());
  conversations(db)[0].status = "ARCHIVADA";
  await ingest(db, ACCOUNT_A, received({ platformMessageId: "m2", sentAt: "2026-11-13T11:00:00.000Z" }));
  assert.equal(conversations(db)[0].status, "ACTIVA");
});

test("editado y borrado: se actualiza el texto y, al borrar, se vacía el contenido", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received({ attachments: [{ type: "image", url: "https://cdn.example.com/a.jpg" }] }));

  await ingest(db, ACCOUNT_A, event("message.edited", { message: { text: "Hola, corregido" } }));
  assert.deepEqual([messages(db)[0].body, messages(db)[0].edited], ["Hola, corregido", true]);

  await ingest(db, ACCOUNT_A, event("message.deleted"));
  assert.deepEqual([messages(db)[0].body, messages(db)[0].deleted, messages(db)[0].attachments], [null, true, []]);
});

test("las confirmaciones de entrega sólo avanzan, salvo un fallo", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received());
  await ingest(db, ACCOUNT_A, event("message.sent", { message: { platformMessageId: "o1", sentAt: "2026-11-13T10:01:00.000Z", sender: { id: "biz" } } }));

  const status = () => messages(db).find((message) => message.platform_message_id === "o1").delivery_status;
  await ingest(db, ACCOUNT_A, event("message.read", { message: { platformMessageId: "o1", direction: "outgoing" } }));
  assert.equal(status(), "read");
  await ingest(db, ACCOUNT_A, event("message.delivered", { message: { platformMessageId: "o1", direction: "outgoing" } }));
  assert.equal(status(), "read", "un 'entregado' tardío no pisa un 'leído'");
  await ingest(db, ACCOUNT_A, event("message.failed", { message: { platformMessageId: "o1", direction: "outgoing" } }));
  assert.equal(status(), "failed");
});

test("account.disconnected deja la cuenta en error con el motivo", async () => {
  const db = new FakeDb({ channel_accounts: [{ id: "ca1", owner_id: OWNER_A, status: "ACTIVA", status_detail: null }] });
  await ingest(db, ACCOUNT_A, parseWebhookEvent({ event: "account.disconnected", account: { accountId: "acc1", reason: "Token vencido" } }));
  assert.deepEqual([db.rows("channel_accounts")[0].status, db.rows("channel_accounts")[0].status_detail], ["ERROR", "Token vencido"]);
  await ingest(db, ACCOUNT_A, parseWebhookEvent({ event: "account.connected", account: { accountId: "acc1" } }));
  assert.deepEqual([db.rows("channel_accounts")[0].status, db.rows("channel_accounts")[0].status_detail], ["ACTIVA", null]);
});

// ── Sincronización ──────────────────────────────────────────────────────────

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockZernio({ conversations: listed, messagesByConversation, rateLimitOn = null }) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (url.pathname.endsWith("/inbox/conversations")) return json({ data: listed, pagination: { hasMore: false } });
    const match = url.pathname.match(/\/inbox\/conversations\/([^/]+)\/messages$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (rateLimitOn === id) return json({ error: "Too many requests", code: "rate_limited" }, 429, { "retry-after": "12" });
      return json({ messages: messagesByConversation[id] ?? [] });
    }
    return json({ error: "no mock" }, 404);
  };
  return calls;
}

const listedConversation = (id, updatedTime, extra = {}) => ({ id, platform: "instagram", participantId: `p-${id}`, participantName: `Persona ${id}`, lastMessage: "x", updatedTime, unreadCount: 0, ...extra });
const listedMessage = (id, direction, text, at, extra = {}) => ({ id, direction, message: text, sentAt: at, attachments: [], ...extra });

test("sincronizar trae conversaciones y mensajes, es idempotente y deja la ventana lista", async () => {
  const db = new FakeDb();
  const calls = mockZernio({
    conversations: [listedConversation("c1", "2026-11-12T12:00:00.000Z", { participantUsername: "Ana_Gomez" }), listedConversation("c2", "2026-11-11T12:00:00.000Z")],
    messagesByConversation: {
      c1: [listedMessage("a2", "outgoing", "Te cuento", "2026-11-12T12:00:00.000Z"), listedMessage("a1", "incoming", "Hola, precio?", "2026-11-12T11:00:00.000Z")],
      c2: [listedMessage("b1", "incoming", "Buenas", "2026-11-11T12:00:00.000Z")],
    },
  });

  const first = await syncChannelAccount(db, ACCOUNT_A, "key", { now: () => new Date("2026-11-13T00:00:00.000Z") });
  assert.deepEqual([first.conversations, first.messages, first.pending, first.rateLimited, first.error], [2, 3, 0, false, null]);

  const c1 = conversations(db).find((row) => row.zernio_conversation_id === "c1");
  assert.equal(c1.participant_handle, "ana_gomez");
  assert.equal(c1.history_synced_at, "2026-11-13T00:00:00.000Z");
  assert.equal(c1.last_message_at, "2026-11-12T12:00:00.000Z");
  assert.equal(c1.last_message_preview, "Te cuento");
  assert.equal(c1.last_inbound_at, "2026-11-12T11:00:00.000Z");
  const origins = Object.fromEntries(messages(db).map((row) => [row.platform_message_id, row.origin]));
  assert.deepEqual(origins, { a1: "CLIENTE", a2: "HISTORIAL", b1: "CLIENTE" });
  assert.ok(messages(db).every((row) => row.owner_id === OWNER_A));
  assert.ok(calls.some((call) => call.includes("accountId=acc1")), "pide siempre con el accountId de la cuenta");

  // Segunda corrida sin novedades: nada nuevo y no vuelve a pedir los mensajes.
  const before = calls.length;
  const second = await syncChannelAccount(db, ACCOUNT_A, "key", { now: () => new Date("2026-11-13T01:00:00.000Z") });
  assert.deepEqual([second.messages, second.pending], [0, 0]);
  assert.equal(messages(db).length, 3);
  assert.equal(calls.length - before, 1, "sólo repite el listado de conversaciones");
});

test("lo que ya llegó por webhook no se duplica al sincronizar", async () => {
  const db = new FakeDb();
  await ingest(db, ACCOUNT_A, received({ platformMessageId: "a1", text: "Hola, precio?", sentAt: "2026-11-12T11:00:00.000Z" }, { conversation: { platformConversationId: "c1" } }));
  mockZernio({
    conversations: [listedConversation("c1", "2026-11-12T11:00:00.000Z")],
    messagesByConversation: { c1: [listedMessage("a1", "incoming", "Hola, precio?", "2026-11-12T11:00:00.000Z")] },
  });

  const result = await syncChannelAccount(db, ACCOUNT_A, "key");
  assert.equal(result.messages, 0);
  assert.equal(messages(db).length, 1);
  assert.equal(conversations(db).length, 1);
  assert.equal(conversations(db)[0].unread_count, 1, "el historial no toca los no leídos");
});

test("un tope de pedidos deja el resto como pendiente en vez de pasarse del límite de Zernio", async () => {
  const db = new FakeDb();
  mockZernio({
    conversations: ["c1", "c2", "c3"].map((id) => listedConversation(id, "2026-11-12T12:00:00.000Z")),
    messagesByConversation: { c1: [listedMessage("m1", "incoming", "a", "2026-11-12T12:00:00.000Z")], c2: [listedMessage("m2", "incoming", "b", "2026-11-12T12:00:00.000Z")], c3: [listedMessage("m3", "incoming", "c", "2026-11-12T12:00:00.000Z")] },
  });

  const first = await syncChannelAccount(db, ACCOUNT_A, "key", { maxFetches: 1 });
  assert.deepEqual([first.messages, first.pending], [1, 2]);
  const second = await syncChannelAccount(db, ACCOUNT_A, "key", { maxFetches: 5 });
  assert.deepEqual([second.messages, second.pending], [2, 0]);
  assert.equal(messages(db).length, 3);
});

test("si Zernio responde 429, corta, avisa y no pierde lo ya traído", async () => {
  const db = new FakeDb();
  mockZernio({
    conversations: ["c1", "c2", "c3"].map((id) => listedConversation(id, "2026-11-12T12:00:00.000Z")),
    messagesByConversation: { c1: [listedMessage("m1", "incoming", "a", "2026-11-12T12:00:00.000Z")] },
    rateLimitOn: "c2",
  });

  const result = await syncChannelAccount(db, ACCOUNT_A, "key");
  assert.equal(result.rateLimited, true);
  assert.equal(result.messages, 1);
  assert.equal(result.pending, 2);
});

test("si no se puede leer el listado (key inválida), devuelve el error sin tocar la base", async () => {
  const db = new FakeDb();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { "content-type": "application/json" } });
  const result = await syncChannelAccount(db, ACCOUNT_A, "mala");
  assert.equal(result.error, "Invalid API key");
  assert.equal(conversations(db).length, 0);
});
