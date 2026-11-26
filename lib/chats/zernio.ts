// Cliente de la API REST de Zernio (https://docs.zernio.com), sólo lo que usa el
// inbox: cuentas, conversaciones, mensajes, enviar, marcar leído y el alta del
// webhook. Sin SDK a propósito: son seis llamadas, y la salida de un tercero se
// valida con Zod en el borde (CLAUDE.md §5) porque cambia sin avisar — el
// contrato de cada una está en la especificación OpenAPI de Zernio.
//
// La API key NO sale de acá hacia el cliente ni a los logs: la reciben estas
// funciones como argumento y los errores sólo llevan lo que Zernio devolvió.

import { z } from "zod";

import { normalizeInstagramHandle } from "@/lib/automation/instagram-intake";

export const ZERNIO_BASE_URL = "https://zernio.com/api/v1";
const REQUEST_TIMEOUT_MS = 20_000;

export class ZernioError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfter: number | null;

  constructor(status: number, message: string, code: string | null = null, retryAfter: number | null = null) {
    super(message);
    this.name = "ZernioError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
};

function errorFromBody(status: number, body: unknown, retryAfterHeader: string | null): ZernioError {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;
  const message =
    (typeof record.error === "string" ? record.error : null) ??
    (typeof nested?.message === "string" ? nested.message : null) ??
    (typeof record.message === "string" ? record.message : null) ??
    `Zernio respondió ${status}.`;
  const code =
    (typeof record.code === "string" ? record.code : null) ?? (typeof nested?.code === "string" ? nested.code : null);
  const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
  return new ZernioError(status, message, code, retryAfter);
}

async function request(apiKey: string, method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
  const url = new URL(`${ZERNIO_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ZernioError(0, "No se pudo conectar con Zernio. Probá de nuevo en un momento.", "network");
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) throw errorFromBody(response.status, json, response.headers.get("retry-after"));
  return json;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ZernioError(502, `Zernio devolvió ${what} con una forma inesperada.`, "unexpected_shape");
  }
  return result.data;
}

/** El mensaje que ve el usuario. Nunca incluye la key ni el cuerpo crudo. */
export function describeZernioError(error: unknown): string {
  if (!(error instanceof ZernioError)) return "No se pudo completar la operación con Zernio.";
  const wait = error.retryAfter ? ` Esperá ${error.retryAfter} s y reintentá.` : "";
  switch (error.status) {
    case 0:
      return error.message;
    case 401:
      return "La API key de Zernio no es válida o fue revocada.";
    case 402:
      return "El saldo de Zernio está en 0. Cargá fondos en el dashboard de Zernio y reintentá.";
    case 403:
      return /inbox/i.test(`${error.message} ${error.code ?? ""}`)
        ? "Falta activar el add-on Inbox en tu plan de Zernio."
        : `Zernio rechazó el envío (${error.message}). Suele ser por estar fuera de la ventana de mensajes de Instagram.`;
    case 409:
      return error.code === "not_thread_owner"
        ? "Otra app (ManyChat o el Inbox de Instagram) es dueña de esta conversación y no deja responder desde acá. Devolvé el hilo a Zernio o apagá esa automatización."
        : "Zernio todavía está procesando un envío igual. Esperá unos segundos.";
    case 422:
      return `Zernio no aceptó el pedido (${error.message}).`;
    case 429:
      return `Zernio o Instagram limitaron el ritmo.${wait}`;
    default:
      return error.status >= 500
        ? `Zernio o Instagram fallaron (${error.status}). Probá de nuevo en un momento.`
        : `Zernio rechazó el pedido (${error.message}).`;
  }
}

// ── Cuentas ─────────────────────────────────────────────────────────────────

const accountsSchema = z.looseObject({
  accounts: z.array(
    z.looseObject({
      _id: z.string(),
      platform: z.string(),
      username: z.string().nullish(),
      displayName: z.string().nullish(),
      isActive: z.boolean().optional(),
    }),
  ),
});

export type ZernioAccount = {
  id: string;
  platform: string;
  username: string | null;
  displayName: string | null;
  isActive: boolean;
};

export async function listAccounts(apiKey: string, platform?: string): Promise<ZernioAccount[]> {
  const json = await request(apiKey, "GET", "/accounts", { query: { platform, limit: 100 } });
  const { accounts } = parse(accountsSchema, json, "la lista de cuentas");
  return accounts.map((account) => ({
    id: account._id,
    platform: account.platform,
    username: account.username ?? null,
    displayName: account.displayName ?? null,
    isActive: account.isActive !== false,
  }));
}

const healthSchema = z.looseObject({
  status: z.enum(["healthy", "warning", "error"]).optional(),
  tokenStatus: z.looseObject({ valid: z.boolean().optional() }).optional(),
  issues: z.array(z.string()).optional(),
  disconnectReason: z.string().nullish(),
  permissions: z
    .looseObject({
      optional: z.array(z.looseObject({ scope: z.string(), granted: z.boolean() })).optional(),
    })
    .optional(),
});

export type ZernioAccountHealth = {
  status: "healthy" | "warning" | "error";
  tokenValid: boolean;
  issues: string[];
  /** ¿Tiene el permiso de mensajes de Instagram? `null` si Zernio no lo informó. */
  canMessage: boolean | null;
};

export async function getAccountHealth(apiKey: string, accountId: string): Promise<ZernioAccountHealth> {
  const json = await request(apiKey, "GET", `/accounts/${encodeURIComponent(accountId)}/health`);
  const health = parse(healthSchema, json, "la salud de la cuenta");
  const messaging = health.permissions?.optional?.find((entry) => entry.scope === "instagram_business_manage_messages");
  const tokenValid = health.tokenStatus?.valid !== false;
  return {
    status: health.status ?? (tokenValid ? "healthy" : "error"),
    tokenValid,
    issues: health.issues ?? (health.disconnectReason ? [health.disconnectReason] : []),
    canMessage: messaging ? messaging.granted : null,
  };
}

// ── Conversaciones y mensajes ───────────────────────────────────────────────

const instagramProfileSchema = z
  .looseObject({
    isFollower: z.boolean().nullish(),
    isFollowing: z.boolean().nullish(),
    followerCount: z.number().nullish(),
    isVerified: z.boolean().nullish(),
  })
  .nullish();

const conversationsSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      platform: z.string(),
      accountId: z.string().optional(),
      participantId: z.string().nullish(),
      participantName: z.string().nullish(),
      participantUsername: z.string().nullish(),
      participantPicture: z.string().nullish(),
      lastMessage: z.string().nullish(),
      updatedTime: z.string().nullish(),
      status: z.string().optional(),
      unreadCount: z.number().nullish(),
      threadControl: z.string().nullish(),
      url: z.string().nullish(),
      instagramProfile: instagramProfileSchema,
    }),
  ),
  pagination: z.looseObject({ hasMore: z.boolean().optional() }).optional(),
});

export type ZernioConversation = z.infer<typeof conversationsSchema>["data"][number];

export async function listConversations(
  apiKey: string,
  params: { accountId: string; platform?: string; limit?: number },
): Promise<{ conversations: ZernioConversation[]; hasMore: boolean }> {
  const json = await request(apiKey, "GET", "/inbox/conversations", {
    query: { accountId: params.accountId, platform: params.platform, limit: params.limit ?? 100, sortOrder: "desc" },
  });
  const parsed = parse(conversationsSchema, json, "las conversaciones");
  return { conversations: parsed.data, hasMore: parsed.pagination?.hasMore === true };
}

const attachmentSchema = z.looseObject({
  type: z.string(),
  originalType: z.string().optional(),
  mimeType: z.string().optional(),
  url: z.string().nullish(),
  filename: z.string().nullish(),
});

const messagesSchema = z.looseObject({
  messages: z.array(
    z.looseObject({
      id: z.string(),
      message: z.string().nullish(),
      direction: z.enum(["incoming", "outgoing"]),
      createdAt: z.string().nullish(),
      sentAt: z.string().nullish(),
      attachments: z.array(attachmentSchema).optional(),
      deliveryStatus: z.string().nullish(),
      isDeleted: z.boolean().optional(),
      isEdited: z.boolean().optional(),
      sentVia: z.string().nullish(),
    }),
  ),
  pagination: z.looseObject({ hasMore: z.boolean().optional(), nextCursor: z.string().nullish() }).optional(),
});

export type ZernioListedMessage = z.infer<typeof messagesSchema>["messages"][number];

export async function listMessages(
  apiKey: string,
  conversationId: string,
  params: { accountId: string; limit?: number; sortOrder?: "asc" | "desc" },
): Promise<ZernioListedMessage[]> {
  const json = await request(apiKey, "GET", `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    query: { accountId: params.accountId, limit: params.limit ?? 100, sortOrder: params.sortOrder ?? "desc" },
  });
  return parse(messagesSchema, json, "los mensajes").messages;
}

const sendSchema = z.looseObject({
  success: z.boolean().optional(),
  data: z.looseObject({ messageId: z.string().optional(), conversationId: z.string().optional() }).optional(),
});

export type SendMessageInput = {
  accountId: string;
  /** Puede ir vacío si hay adjunto. */
  message: string;
  /** URL pública (o firmada) que Zernio descarga y manda a Instagram. */
  attachmentUrl?: string;
  attachmentType?: "image" | "video" | "audio" | "file";
  messagingType?: "MESSAGE_TAG";
  messageTag?: "HUMAN_AGENT";
  /** Hace segura la reintentada ante un timeout: misma key + mismo body = no se manda dos veces. */
  idempotencyKey: string;
};

export async function sendMessage(
  apiKey: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<{ messageId: string | null }> {
  const json = await request(apiKey, "POST", `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    idempotencyKey: input.idempotencyKey,
    body: {
      accountId: input.accountId,
      ...(input.message ? { message: input.message } : {}),
      ...(input.attachmentUrl ? { attachmentUrl: input.attachmentUrl, attachmentType: input.attachmentType ?? "file" } : {}),
      ...(input.messageTag ? { messagingType: input.messagingType, messageTag: input.messageTag } : {}),
    },
  });
  const parsed = parse(sendSchema, json, "la respuesta del envío");
  return { messageId: parsed.data?.messageId ?? null };
}

export async function markConversationRead(apiKey: string, conversationId: string, accountId: string): Promise<void> {
  await request(apiKey, "POST", `/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
    body: { accountId },
  });
}

// ── Webhook ─────────────────────────────────────────────────────────────────

/** Los eventos que el inbox procesa (lib/chats/webhook.ts). */
export const WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.edited",
  "message.deleted",
  "message.delivered",
  "message.read",
  "message.failed",
  "conversation.control_changed",
  "account.connected",
  "account.disconnected",
  // §1.26: etiquetas que ponen los workflows y ejecuciones de cada pieza.
  "contact.tag_added",
  "contact.tag_removed",
  "contact.field_changed",
  "workflow.run.started",
  "workflow.run.completed",
  "workflow.run.failed",
] as const;

const webhookCreatedSchema = z.looseObject({
  webhook: z.looseObject({ _id: z.string() }),
});

export async function createWebhook(
  apiKey: string,
  input: { name: string; url: string; secret: string; accountIds: string[] },
): Promise<{ id: string }> {
  const json = await request(apiKey, "POST", "/webhooks/settings", {
    body: {
      name: input.name.slice(0, 50),
      url: input.url,
      secret: input.secret,
      events: [...WEBHOOK_EVENTS],
      accountIds: input.accountIds,
      isActive: true,
    },
  });
  return { id: parse(webhookCreatedSchema, json, "el webhook creado").webhook._id };
}

export async function deleteWebhook(apiKey: string, webhookId: string): Promise<void> {
  await request(apiKey, "DELETE", "/webhooks/settings", { query: { webhookId } });
}

// ── Contactos y etiquetas (§1.26) ───────────────────────────────────────────
// Las etiquetas son del contacto de Zernio. El contacto se cruza con la
// conversación por `platformIdentifier`, que en Instagram es el mismo id que
// `participantId` de la conversación (el id de la persona en esa cuenta).

const contactSchema = z.looseObject({
  id: z.string().optional(),
  _id: z.string().optional(),
  name: z.string().nullish(),
  username: z.string().nullish(),
  handle: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  platform: z.string().nullish(),
  platformIdentifier: z.string().nullish(),
});

export type ZernioContact = {
  id: string;
  tags: string[];
  platformIdentifier: string | null;
  name: string | null;
  handle: string | null;
};

function toContact(raw: z.infer<typeof contactSchema>): ZernioContact | null {
  const id = raw.id ?? raw._id;
  if (!id) return null;
  return {
    id,
    tags: raw.tags ?? [],
    platformIdentifier: raw.platformIdentifier ?? null,
    name: raw.name ?? null,
    handle: normalizeInstagramHandle(raw.username ?? raw.handle),
  };
}

const contactsListSchema = z.looseObject({
  contacts: z.array(contactSchema),
  pagination: z.looseObject({ hasMore: z.boolean().optional(), total: z.number().optional() }).optional(),
});

export async function listContacts(
  apiKey: string,
  params: { accountId: string; platform?: string; limit?: number; skip?: number },
): Promise<{ contacts: ZernioContact[]; hasMore: boolean }> {
  const json = await request(apiKey, "GET", "/contacts", {
    query: { accountId: params.accountId, platform: params.platform, limit: params.limit ?? 100, skip: params.skip ?? 0 },
  });
  const parsed = parse(contactsListSchema, json, "los contactos");
  return {
    contacts: parsed.contacts.map(toContact).filter((contact): contact is ZernioContact => contact !== null),
    hasMore: parsed.pagination?.hasMore === true,
  };
}

const contactEnvelopeSchema = z.union([z.looseObject({ contact: contactSchema }), contactSchema]);

function unwrapContact(json: unknown, what: string): ZernioContact {
  const parsed = parse(contactEnvelopeSchema, json, what);
  const raw = "contact" in parsed && parsed.contact && typeof parsed.contact === "object" ? (parsed.contact as z.infer<typeof contactSchema>) : (parsed as z.infer<typeof contactSchema>);
  const contact = toContact(raw);
  if (!contact) throw new ZernioError(502, `Zernio devolvió ${what} sin id.`, "unexpected_shape");
  return contact;
}

export async function getContact(apiKey: string, contactId: string): Promise<ZernioContact> {
  return unwrapContact(await request(apiKey, "GET", `/contacts/${encodeURIComponent(contactId)}`), "el contacto");
}

const channelsSchema = z.looseObject({
  channels: z.array(z.looseObject({ platform: z.string().nullish(), platformIdentifier: z.string().nullish(), accountId: z.string().nullish() })).optional(),
});

/** Los canales de un contacto (para saber su id de Instagram cuando el evento no lo trae). */
export async function getContactChannels(apiKey: string, contactId: string): Promise<Array<{ platform: string | null; platformIdentifier: string | null; accountId: string | null }>> {
  const json = await request(apiKey, "GET", `/contacts/${encodeURIComponent(contactId)}/channels`);
  const parsed = parse(channelsSchema, json, "los canales del contacto");
  return (parsed.channels ?? []).map((channel) => ({
    platform: channel.platform ?? null,
    platformIdentifier: channel.platformIdentifier ?? null,
    accountId: channel.accountId ?? null,
  }));
}

/** Reemplaza el set COMPLETO de etiquetas del contacto (Zernio escribe sólo los campos que se mandan). */
export async function setContactTags(apiKey: string, contactId: string, tags: string[]): Promise<ZernioContact> {
  return unwrapContact(await request(apiKey, "PATCH", `/contacts/${encodeURIComponent(contactId)}`, { body: { tags } }), "el contacto actualizado");
}

// ── Posts con comentarios (para elegir la pieza) ────────────────────────────

const commentedPostsSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      platform: z.string().optional(),
      createdTime: z.string().nullish(),
      permalink: z.string().nullish(),
      content: z.string().nullish(),
      commentCount: z.number().nullish(),
      likeCount: z.number().nullish(),
      picture: z.string().nullish(),
    }),
  ),
});

export type ZernioPost = { platformPostId: string; createdTime: string | null; permalink: string | null; caption: string | null; commentCount: number; likeCount: number };

/** Las publicaciones recientes de la cuenta (las que Zernio sigue para comentarios). */
export async function listRecentPosts(apiKey: string, accountId: string, limit = 30): Promise<ZernioPost[]> {
  const json = await request(apiKey, "GET", "/inbox/comments", { query: { accountId, platform: "instagram", limit, sortBy: "date", sortOrder: "desc" } });
  return parse(commentedPostsSchema, json, "las publicaciones").data.map((post) => ({
    platformPostId: post.id,
    createdTime: post.createdTime ?? null,
    permalink: post.permalink ?? null,
    caption: post.content ?? null,
    commentCount: post.commentCount ?? 0,
    likeCount: post.likeCount ?? 0,
  }));
}

// ── Automatizaciones de comentario y workflows (§1.26) ──────────────────────
// Se leen y se clonan casi enteras: el objeto crudo de Zernio pasa por
// `lib/chats/automations.ts`, que decide qué campos se copian. Por eso acá los
// esquemas sólo exigen el id y dejan pasar el resto.

const rawObject = z.record(z.string(), z.unknown());

export type RawRecord = Record<string, unknown>;

function idOf(record: RawRecord): string | null {
  const id = record.id ?? record._id;
  return typeof id === "string" && id ? id : null;
}

function unwrap(json: unknown, key: string, what: string): RawRecord {
  const parsed = parse(rawObject, json, what);
  const inner = parsed[key];
  const record = inner && typeof inner === "object" && !Array.isArray(inner) ? (inner as RawRecord) : parsed;
  if (!idOf(record)) throw new ZernioError(502, `Zernio devolvió ${what} sin id.`, "unexpected_shape");
  return record;
}

export function recordId(record: RawRecord): string {
  return idOf(record) ?? "";
}

export async function listCommentAutomations(apiKey: string): Promise<RawRecord[]> {
  const json = await request(apiKey, "GET", "/comment-automations");
  const parsed = parse(z.looseObject({ automations: z.array(rawObject) }), json, "las automatizaciones de comentario");
  return parsed.automations.filter((record) => idOf(record) !== null);
}

export async function getCommentAutomation(apiKey: string, automationId: string): Promise<RawRecord> {
  return unwrap(await request(apiKey, "GET", `/comment-automations/${encodeURIComponent(automationId)}`), "automation", "la automatización de comentario");
}

export async function createCommentAutomation(apiKey: string, body: RawRecord): Promise<RawRecord> {
  return unwrap(await request(apiKey, "POST", "/comment-automations", { body }), "automation", "la automatización creada");
}

export async function updateCommentAutomation(apiKey: string, automationId: string, body: RawRecord): Promise<void> {
  await request(apiKey, "PATCH", `/comment-automations/${encodeURIComponent(automationId)}`, { body });
}

export async function deleteCommentAutomation(apiKey: string, automationId: string): Promise<void> {
  await request(apiKey, "DELETE", `/comment-automations/${encodeURIComponent(automationId)}`);
}

export async function listWorkflows(apiKey: string): Promise<RawRecord[]> {
  const json = await request(apiKey, "GET", "/workflows", { query: { limit: 100 } });
  const parsed = parse(z.looseObject({ workflows: z.array(rawObject) }), json, "los workflows");
  return parsed.workflows.filter((record) => idOf(record) !== null);
}

export async function getWorkflow(apiKey: string, workflowId: string): Promise<RawRecord> {
  return unwrap(await request(apiKey, "GET", `/workflows/${encodeURIComponent(workflowId)}`), "workflow", "el workflow");
}

export async function createWorkflow(apiKey: string, body: RawRecord): Promise<RawRecord> {
  return unwrap(await request(apiKey, "POST", "/workflows", { body }), "workflow", "el workflow creado");
}

export async function activateWorkflow(apiKey: string, workflowId: string): Promise<void> {
  await request(apiKey, "POST", `/workflows/${encodeURIComponent(workflowId)}/activate`);
}

export async function pauseWorkflow(apiKey: string, workflowId: string): Promise<void> {
  await request(apiKey, "POST", `/workflows/${encodeURIComponent(workflowId)}/pause`);
}

export async function deleteWorkflow(apiKey: string, workflowId: string): Promise<void> {
  await request(apiKey, "DELETE", `/workflows/${encodeURIComponent(workflowId)}`);
}

/** Cambia los eventos de un webhook ya registrado (para sumar los de §1.26 sin reconectar). */
export async function updateWebhookEvents(apiKey: string, webhookId: string): Promise<void> {
  await request(apiKey, "PUT", "/webhooks/settings", { body: { webhookId, events: [...WEBHOOK_EVENTS], isActive: true } });
}

// ── Perfil (para crear workflows y automatizaciones de comentario) ─────────

const profilesSchema = z.looseObject({
  profiles: z.array(z.looseObject({ id: z.string().optional(), _id: z.string().optional(), isDefault: z.boolean().optional() })),
});

/** El perfil por default del workspace (el primero, "default first" según Zernio). Todas las cuentas de este negocio viven en uno solo. */
export async function getDefaultProfileId(apiKey: string): Promise<string> {
  const json = await request(apiKey, "GET", "/profiles", { query: { limit: 20 } });
  const parsed = parse(profilesSchema, json, "los perfiles");
  const profiles = parsed.profiles
    .map((profile) => ({ id: profile.id ?? profile._id, isDefault: profile.isDefault === true }))
    .filter((profile): profile is { id: string; isDefault: boolean } => Boolean(profile.id));
  if (profiles.length === 0) throw new ZernioError(502, "La cuenta de Zernio no tiene ningún perfil.", "no_profile");
  return (profiles.find((profile) => profile.isDefault) ?? profiles[0]).id;
}
