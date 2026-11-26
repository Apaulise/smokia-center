// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por el owner que resolvió
// el webhook (CLAUDE.md §4). No envía mensajes: crea o actualiza el lead, ata
// la conversación y anota la corrida del workflow.
//
// Zernio avisa con `contact.tag_added`, `contact.field_changed` y
// `workflow.run.*` (https://docs.zernio.com/webhooks/inbox). El body es una
// señal; el @ sale de la conversación que ya tenemos o, si hace falta, de
// GET /contacts. Un reintento con el mismo `id` de evento no duplica el lead.

import { createHash } from "node:crypto";

import { z } from "zod";

import { looseFrom, schemaMissing, isUniqueViolation, rowsOf, type DbError } from "@/lib/automation/crm-db";
import {
  INSTAGRAM_ACQUISITION_SOURCE,
  type IntakeStage,
  type InstagramIntakeInput,
  normalizeInstagramHandle,
  upsertInstagramLead,
} from "@/lib/automation/instagram-intake";
import { forwardStatus } from "@/lib/automation/lead-progress";
import { asChats } from "@/lib/chats/db";
import { findLeadByInstagramHandle } from "@/lib/chats/lead-link";
import { getContact, getContactChannels } from "@/lib/chats/zernio";
import { applyLeadStatusChange, type LeadsClient } from "@/lib/leads/contact";
import type { LeadStatus } from "@/lib/leads/status";

/**
 * negocio: contestó que tiene un negocio.
 * intervenir: el workflow se frenó para que Agustín responda a mano → INTERESADO.
 * agenda: dato viejo, le pasaron el link para reservar.
 * no_agenda no está acá: es un rechazo (CERRADO_PERDIDO), no un avance.
 */
const QUALIFYING_TAG_STATUS = {
  negocio: "RESPONDIO",
  intervenir: "INTERESADO",
  agenda: "REUNION_PROPUESTA",
} as const satisfies Record<string, LeadStatus>;

/** Un rechazo no pisa una reunión ya agendada ni un cierre ganado. */
const NO_AGENDA_BLOCKED = new Set<LeadStatus>([
  "REUNION_AGENDADA",
  "REUNION_REALIZADA",
  "PROPUESTA_ENVIADA",
  "CERRADO_GANADO",
  "CERRADO_PERDIDO",
  "DESCARTADO",
]);

const TASK_FIELDS = new Set(["tarea", "tareas", "tarea_libre"]);

export type QualifyingTag = keyof typeof QUALIFYING_TAG_STATUS;

export type ContactHint = {
  name: string | null;
  handle: string | null;
  platformIdentifier: string | null;
};

export type ZernioCrmAction =
  | {
      action: "qualify";
      eventId: string;
      eventName: string;
      contactId: string;
      status: LeadStatus;
      signal: string;
      task: string | null;
      handle: string | null;
      name: string | null;
      platformIdentifier: string | null;
    }
  | {
      action: "workflow";
      eventId: string;
      eventName: string;
      workflowId: string;
      executionId: string;
      status: string;
      conversationId: string | null;
      contactId: string | null;
      occurredAt: string;
      handle: string | null;
      name: string | null;
      platformIdentifier: string | null;
    };

export type ParsedZernioCrm =
  | { kind: "test" }
  | { kind: "ignore"; event: string }
  | { kind: "invalid"; reason: string }
  | { kind: "action"; action: ZernioCrmAction };

export type CrmApplyResult =
  | { ok: true; duplicate: true }
  | {
      ok: true;
      duplicate: false;
      ignored: false;
      leadId: string | null;
      created: boolean;
      status: LeadStatus | null;
      linkedConversations: number;
      runRecorded: boolean;
    }
  | { ok: false; reason: "migration" | "error"; message: string };

const contactSchema = z
  .looseObject({
    id: z.string().optional(),
    name: z.string().nullish(),
    username: z.string().nullish(),
    handle: z.string().nullish(),
    platformIdentifier: z.string().nullish(),
  })
  .nullish();

const envelopeSchema = z.looseObject({
  id: z.string().optional(),
  event: z.string(),
  timestamp: z.string().optional(),
  contact: contactSchema,
  contactId: z.string().optional(),
  tag: z.string().nullish(),
  field: z.string().nullish(),
  value: z.unknown().optional(),
  workflow: z.looseObject({ id: z.string().optional() }).nullish(),
  workflowId: z.string().optional(),
  execution: z.looseObject({ id: z.string().optional(), status: z.string().optional() }).nullish(),
  executionId: z.string().optional(),
  conversation: z
    .looseObject({
      id: z.string().optional(),
      platformConversationId: z.string().optional(),
      participantUsername: z.string().nullish(),
      participantName: z.string().nullish(),
    })
    .nullish(),
  conversationId: z.string().optional(),
});

/** `no-agenda`, `No Agenda` y `no_agenda` son la misma etiqueta. */
export function canonicalKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function scalarText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 500) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

export function qualifyingTagStatus(tag: string | null | undefined): { tag: QualifyingTag | "no_agenda"; status: LeadStatus } | null {
  if (!tag) return null;
  const key = canonicalKey(tag);
  if (key === "no_agenda") return { tag: "no_agenda", status: "CERRADO_PERDIDO" };
  if (!(key in QUALIFYING_TAG_STATUS)) return null;
  const qualifying = key as QualifyingTag;
  return { tag: qualifying, status: QUALIFYING_TAG_STATUS[qualifying] };
}

export function taskAnswer(field: string | null | undefined, value: unknown): string | null {
  if (!field || !TASK_FIELDS.has(canonicalKey(field))) return null;
  return scalarText(value);
}

export function bodyEventId(rawBody: string): string {
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

function validDate(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function identityOf(data: z.infer<typeof envelopeSchema>): { handle: string | null; name: string | null; platformIdentifier: string | null } {
  const contact = data.contact;
  const handle = normalizeInstagramHandle(contact?.username ?? contact?.handle ?? data.conversation?.participantUsername);
  const name = scalarText(contact?.name) ?? scalarText(data.conversation?.participantName);
  const platformIdentifier = scalarText(contact?.platformIdentifier);
  return { handle, name, platformIdentifier };
}

/**
 * Traduce un POST de Zernio al acto de CRM, o a "ignorá esto".
 * Los eventos de mensajes los sigue atendiendo `/api/zernio/webhook`.
 */
export function parseZernioCrmBody(json: unknown, fallbackEventId: string): ParsedZernioCrm {
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) return { kind: "invalid", reason: "Falta el nombre del evento." };
  const data = parsed.data;
  const event = data.event;
  if (event === "webhook.test") return { kind: "test" };

  const eventId = data.id?.trim() || fallbackEventId;
  const contactId = data.contact?.id ?? data.contactId ?? null;
  const identity = identityOf(data);

  if (event === "contact.tag_added") {
    if (!contactId) return { kind: "invalid", reason: "Falta el contacto." };
    const qualifying = qualifyingTagStatus(data.tag);
    if (!qualifying) return { kind: "ignore", event };
    return {
      kind: "action",
      action: {
        action: "qualify",
        eventId,
        eventName: event,
        contactId,
        status: qualifying.status,
        signal: qualifying.tag,
        task: null,
        ...identity,
      },
    };
  }

  if (event === "contact.field_changed") {
    if (!contactId) return { kind: "invalid", reason: "Falta el contacto." };
    const task = taskAnswer(data.field, data.value);
    if (!task) return { kind: "ignore", event };
    return {
      kind: "action",
      action: {
        action: "qualify",
        eventId,
        eventName: event,
        contactId,
        status: "DIAGNOSTICO",
        signal: "tarea",
        task,
        ...identity,
      },
    };
  }

  if (event === "workflow.run.started" || event === "workflow.run.completed" || event === "workflow.run.failed") {
    const workflowId = data.workflow?.id ?? data.workflowId ?? null;
    const executionId = data.execution?.id ?? data.executionId ?? null;
    if (!workflowId || !executionId) return { kind: "invalid", reason: "Falta el workflow o la ejecución." };
    const rawStatus = data.execution?.status;
    const status =
      rawStatus && ["running", "waiting", "completed", "exited", "failed"].includes(rawStatus)
        ? rawStatus
        : event === "workflow.run.started"
          ? "running"
          : event === "workflow.run.failed"
            ? "failed"
            : "completed";
    const conversation = data.conversation;
    const conversationId = conversation?.platformConversationId ?? conversation?.id ?? data.conversationId ?? null;
    return {
      kind: "action",
      action: {
        action: "workflow",
        eventId,
        eventName: event,
        workflowId,
        executionId,
        status,
        conversationId,
        contactId,
        occurredAt: validDate(data.timestamp) ?? new Date().toISOString(),
        ...identity,
      },
    };
  }

  return { kind: "ignore", event };
}

type ConversationHit = {
  id: string;
  lead_id: string | null;
  participant_handle: string | null;
  participant_name: string | null;
  participant_external_id: string | null;
  zernio_contact_id: string | null;
  zernio_conversation_id: string;
  tags: string[] | null;
  source_automation_id: string | null;
};

function asConversation(row: Record<string, unknown>): ConversationHit | null {
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    lead_id: typeof row.lead_id === "string" ? row.lead_id : null,
    participant_handle: typeof row.participant_handle === "string" ? row.participant_handle : null,
    participant_name: typeof row.participant_name === "string" ? row.participant_name : null,
    participant_external_id: typeof row.participant_external_id === "string" ? row.participant_external_id : null,
    zernio_contact_id: typeof row.zernio_contact_id === "string" ? row.zernio_contact_id : null,
    zernio_conversation_id: typeof row.zernio_conversation_id === "string" ? row.zernio_conversation_id : "",
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    source_automation_id: typeof row.source_automation_id === "string" ? row.source_automation_id : null,
  };
}

const CONVERSATION_COLUMNS =
  "id, lead_id, participant_handle, participant_name, participant_external_id, zernio_contact_id, zernio_conversation_id, tags, source_automation_id";

async function selectConversations(db: LeadsClient, ownerId: string, column: string, value: string): Promise<ConversationHit[]> {
  const { data, error } = await db.from("conversations").select(CONVERSATION_COLUMNS).eq("owner_id", ownerId).eq(column, value).limit(20);
  if (error) return [];
  return (data ?? []).map((row) => asConversation(row as unknown as Record<string, unknown>)).filter((row): row is ConversationHit => row !== null);
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function conversationsFor(db: LeadsClient, ownerId: string, input: {
  contactId: string | null;
  platformIdentifier: string | null;
  handle: string | null;
  conversationId: string | null;
}): Promise<ConversationHit[]> {
  const byId = new Map<string, ConversationHit>();
  const add = (rows: ConversationHit[]) => {
    for (const row of rows) byId.set(row.id, row);
  };
  if (input.contactId) add(await selectConversations(db, ownerId, "zernio_contact_id", input.contactId));
  if (input.platformIdentifier) add(await selectConversations(db, ownerId, "participant_external_id", input.platformIdentifier));
  if (input.conversationId) add(await selectConversations(db, ownerId, "zernio_conversation_id", input.conversationId));
  if (input.handle) {
    const { data, error } = await db
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("owner_id", ownerId)
      .ilike("participant_handle", likeExact(input.handle))
      .limit(20);
    if (!error) add((data ?? []).map((row) => asConversation(row as unknown as Record<string, unknown>)).filter((row): row is ConversationHit => row !== null));
  }
  return [...byId.values()];
}

async function claimDelivery(db: LeadsClient, ownerId: string, eventId: string, eventName: string): Promise<"claimed" | "duplicate" | "migration" | "error"> {
  const { error } = await looseFrom(db, "webhook_deliveries").insert({
    owner_id: ownerId,
    provider: "zernio",
    event_id: eventId,
    event_name: eventName,
  });
  if (!error) return "claimed";
  if (isUniqueViolation(error)) return "duplicate";
  if (schemaMissing(error)) return "migration";
  return "error";
}

async function releaseDelivery(db: LeadsClient, ownerId: string, eventId: string): Promise<void> {
  await looseFrom(db, "webhook_deliveries").delete().eq("owner_id", ownerId).eq("provider", "zernio").eq("event_id", eventId);
}

function intakeStageFor(status: LeadStatus): IntakeStage {
  if (status === "CALIFICADO" || status === "INTERESADO" || status === "REUNION_PROPUESTA") return "calificado";
  return "respondio";
}

export async function contactHintFromZernio(apiKey: string, contactId: string): Promise<ContactHint | null> {
  try {
    const contact = await getContact(apiKey, contactId);
    const channels = await getContactChannels(apiKey, contactId);
    const instagram = channels.find((channel) => (channel.platform ?? "").toLowerCase() === "instagram") ?? channels[0];
    return {
      name: contact.name,
      handle: contact.handle,
      platformIdentifier: instagram?.platformIdentifier ?? contact.platformIdentifier,
    };
  } catch {
    return null;
  }
}

type ResolvedIdentity = { handle: string | null; name: string | null; platformIdentifier: string | null; conversations: ConversationHit[] };

async function resolveIdentity(
  db: LeadsClient,
  ownerId: string,
  seed: { contactId: string | null; handle: string | null; name: string | null; platformIdentifier: string | null; conversationId: string | null },
  lookup: ((contactId: string) => Promise<ContactHint | null>) | undefined,
): Promise<ResolvedIdentity> {
  let handle = normalizeInstagramHandle(seed.handle);
  let name = seed.name;
  let platformIdentifier = seed.platformIdentifier;
  let conversations = await conversationsFor(db, ownerId, { contactId: seed.contactId, platformIdentifier, handle, conversationId: seed.conversationId });

  const fromThread = conversations.find((row) => row.participant_handle) ?? conversations[0];
  handle = handle ?? normalizeInstagramHandle(fromThread?.participant_handle);
  name = name ?? fromThread?.participant_name ?? null;
  platformIdentifier = platformIdentifier ?? fromThread?.participant_external_id ?? null;

  if (lookup && seed.contactId && (!handle || conversations.length === 0)) {
    const hint = await lookup(seed.contactId);
    if (hint) {
      handle = handle ?? normalizeInstagramHandle(hint.handle);
      name = name ?? hint.name;
      platformIdentifier = platformIdentifier ?? hint.platformIdentifier;
      const again = await conversationsFor(db, ownerId, {
        contactId: seed.contactId,
        platformIdentifier,
        handle,
        conversationId: seed.conversationId,
      });
      const byId = new Map(conversations.map((row) => [row.id, row]));
      for (const row of again) byId.set(row.id, row);
      conversations = [...byId.values()];
      const thread = conversations.find((row) => row.participant_handle);
      handle = handle ?? normalizeInstagramHandle(thread?.participant_handle);
      name = name ?? thread?.participant_name ?? null;
    }
  }

  return { handle, name, platformIdentifier, conversations };
}

async function linkConversations(
  db: LeadsClient,
  ownerId: string,
  conversations: ConversationHit[],
  patch: { leadId?: string | null; contactId?: string | null; sourceAutomationId?: string | null; tag?: string | null },
): Promise<{ linked: number; error: DbError }> {
  let linked = 0;
  for (const conversation of conversations) {
    const update: {
      lead_id?: string;
      zernio_contact_id?: string;
      source_automation_id?: string;
      tags?: string[];
      tags_synced_at?: string;
    } = {};
    if (patch.leadId && !conversation.lead_id) update.lead_id = patch.leadId;
    if (patch.contactId && conversation.zernio_contact_id !== patch.contactId) update.zernio_contact_id = patch.contactId;
    if (patch.sourceAutomationId && !conversation.source_automation_id) update.source_automation_id = patch.sourceAutomationId;
    if (patch.tag) {
      const tags = new Set(conversation.tags ?? []);
      if (!tags.has(patch.tag)) {
        tags.add(patch.tag);
        update.tags = [...tags];
        update.tags_synced_at = new Date().toISOString();
      }
    }
    if (Object.keys(update).length === 0) continue;
    const { error } = await db.from("conversations").update(update).eq("id", conversation.id).eq("owner_id", ownerId);
    if (error) return { linked, error };
    if (update.lead_id) linked += 1;
  }
  return { linked, error: null };
}

async function qualify(
  db: LeadsClient,
  ownerId: string,
  action: Extract<ZernioCrmAction, { action: "qualify" }>,
  identity: ResolvedIdentity,
): Promise<CrmApplyResult> {
  if (!identity.handle && !action.contactId) {
    return { ok: false, reason: "error", message: "El contacto no tiene usuario ni id." };
  }

  const stage = intakeStageFor(action.status);
  const input: InstagramIntakeInput = {
    manychatId: null,
    handle: identity.handle,
    name: identity.name,
    stage,
    fields: action.task ? { tarea: action.task } : {},
    utm: {},
    zernioContactId: action.contactId,
    signal: action.signal,
  };
  const saved = await upsertInstagramLead(db, ownerId, "zernio", input);
  if (!saved.ok) return { ok: false, reason: "error", message: saved.message };

  const { error: sourceError } = await db
    .from("leads")
    .update({ acquisition_source: INSTAGRAM_ACQUISITION_SOURCE })
    .eq("id", saved.lead.id)
    .eq("owner_id", ownerId)
    .is("acquisition_source", null);
  if (sourceError) return { ok: false, reason: "error", message: "No se pudo marcar el origen del lead." };

  // El upsert ya subió hasta RESPONDIO o CALIFICADO y nunca baja. Acá se da
  // el paso que esa etapa no cubre. applyLeadStatusChange no conoce el orden:
  // no se lo llama si el destino no está más adelante. no_agenda es un rechazo,
  // no un avance, y no pisa una reunión ni un cierre ganado.
  let status = saved.lead.status;
  if (action.signal === "no_agenda") {
    if (!NO_AGENDA_BLOCKED.has(status)) {
      const moved = await applyLeadStatusChange(db, ownerId, saved.lead.id, "CERRADO_PERDIDO");
      if (!moved.ok) return { ok: false, reason: "error", message: moved.message };
      status = "CERRADO_PERDIDO";
    }
  } else if (forwardStatus(status, action.status)) {
    const moved = await applyLeadStatusChange(db, ownerId, saved.lead.id, action.status);
    if (!moved.ok) return { ok: false, reason: "error", message: moved.message };
    status = action.status;
  }

  if (action.signal === "intervenir" && status === "INTERESADO") {
    const { error: dueError } = await db
      .from("leads")
      .update({ next_action_at: new Date().toISOString() })
      .eq("id", saved.lead.id)
      .eq("owner_id", ownerId);
    if (dueError) return { ok: false, reason: "error", message: "No se pudo marcar la respuesta pendiente." };
  }

  const linked = await linkConversations(db, ownerId, identity.conversations, {
    leadId: saved.lead.id,
    contactId: action.contactId,
    tag: action.signal === "tarea" ? null : action.signal,
  });
  if (linked.error) return { ok: false, reason: "error", message: "No se pudo vincular la conversación." };

  return {
    ok: true,
    duplicate: false,
    ignored: false,
    leadId: saved.lead.id,
    created: saved.created,
    status,
    linkedConversations: linked.linked,
    runRecorded: false,
  };
}

async function findAutomation(db: LeadsClient, ownerId: string, workflowId: string): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("content_automations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("zernio_workflow_id", workflowId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}

async function recordRun(
  db: LeadsClient,
  ownerId: string,
  action: Extract<ZernioCrmAction, { action: "workflow" }>,
  conversationId: string | null,
  automationId: string | null,
): Promise<{ ok: true; recorded: boolean } | { ok: false; reason: "migration" | "error"; message: string }> {
  const { rows, error: readError } = await rowsOf(
    looseFrom(db, "automation_runs")
      .select("id, status, conversation_id, automation_id")
      .eq("owner_id", ownerId)
      .eq("zernio_execution_id", action.executionId)
      .limit(1),
  );
  if (readError) {
    if (schemaMissing(readError)) return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
    return { ok: false, reason: "error", message: "No se pudo leer la corrida." };
  }

  const finished = action.status === "running" || action.status === "waiting" ? null : action.occurredAt;
  if (rows[0] && typeof rows[0].id === "string") {
    const patch: Record<string, unknown> = { zernio_workflow_id: action.workflowId };
    if (action.status !== "running" && action.status !== "waiting") {
      patch.status = action.status;
      patch.finished_at = action.occurredAt;
    }
    if (!rows[0].conversation_id && conversationId) patch.conversation_id = conversationId;
    if (!rows[0].automation_id && automationId) patch.automation_id = automationId;
    const wrote = await writeRun(db, ownerId, rows[0].id, patch);
    if (!wrote.ok) return wrote;
    return { ok: true, recorded: true };
  }

  const wrote = await writeRun(db, ownerId, null, {
    owner_id: ownerId,
    automation_id: automationId,
    zernio_workflow_id: action.workflowId,
    zernio_execution_id: action.executionId,
    conversation_id: conversationId,
    status: action.status,
    started_at: finished ? null : action.occurredAt,
    finished_at: finished,
  });
  if (!wrote.ok) return wrote;
  return { ok: true, recorded: true };
}

/** Si la migración no está, una pieza conocida se guarda sin la columna nueva. Un workflow suelto no entra: `automation_id` sigue siendo obligatorio. */
async function writeRun(
  db: LeadsClient,
  ownerId: string,
  id: string | null,
  row: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; reason: "migration" | "error"; message: string }> {
  const run = async (payload: Record<string, unknown>) => {
    const query = id
      ? looseFrom(db, "automation_runs").update(payload).eq("id", id).eq("owner_id", ownerId)
      : looseFrom(db, "automation_runs").insert(payload);
    return query;
  };
  const first = await run(row);
  if (!first.error || isUniqueViolation(first.error)) return { ok: true };
  if (!schemaMissing(first.error)) return { ok: false, reason: "error", message: "No se pudo registrar la corrida." };

  const { zernio_workflow_id: _workflow, ...legacy } = row;
  void _workflow;
  if (legacy.automation_id == null) {
    return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
  }
  const second = await run(legacy);
  if (!second.error || isUniqueViolation(second.error)) return { ok: true };
  if (schemaMissing(second.error)) return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
  return { ok: false, reason: "error", message: "No se pudo registrar la corrida." };
}

async function leadIdForIdentity(db: LeadsClient, ownerId: string, contactId: string | null, handle: string | null): Promise<string | null> {
  if (contactId) {
    const { data } = await db
      .from("leads")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("intake->>zernio_contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  if (!handle) return null;
  return findLeadByInstagramHandle(asChats(db), ownerId, handle);
}

async function recordWorkflow(
  db: LeadsClient,
  ownerId: string,
  action: Extract<ZernioCrmAction, { action: "workflow" }>,
  identity: ResolvedIdentity,
): Promise<CrmApplyResult> {
  const automation = await findAutomation(db, ownerId, action.workflowId);
  const conversation = identity.conversations[0] ?? null;
  const run = await recordRun(db, ownerId, action, conversation?.id ?? null, automation?.id ?? null);
  if (!run.ok) return run;

  const leadId = conversation?.lead_id ?? (await leadIdForIdentity(db, ownerId, action.contactId, identity.handle));
  const linked = await linkConversations(db, ownerId, identity.conversations, {
    leadId,
    contactId: action.contactId,
    sourceAutomationId: automation?.id ?? null,
  });
  if (linked.error) return { ok: false, reason: "error", message: "No se pudo marcar la pieza de origen." };

  return {
    ok: true,
    duplicate: false,
    ignored: false,
    leadId,
    created: false,
    status: null,
    linkedConversations: linked.linked,
    runRecorded: run.recorded,
  };
}

export async function applyZernioCrmEvent(
  db: LeadsClient,
  ownerId: string,
  action: ZernioCrmAction,
  options?: { lookup?: (contactId: string) => Promise<ContactHint | null> },
): Promise<CrmApplyResult> {
  const claim = await claimDelivery(db, ownerId, action.eventId, action.eventName);
  if (claim === "duplicate") return { ok: true, duplicate: true };
  if (claim === "migration") return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
  if (claim === "error") return { ok: false, reason: "error", message: "No se pudo registrar la entrega." };

  try {
    const identity = await resolveIdentity(
      db,
      ownerId,
      {
        contactId: action.action === "qualify" ? action.contactId : action.contactId,
        handle: action.handle,
        name: action.name,
        platformIdentifier: action.platformIdentifier,
        conversationId: action.action === "workflow" ? action.conversationId : null,
      },
      options?.lookup,
    );
    const result = action.action === "qualify" ? await qualify(db, ownerId, action, identity) : await recordWorkflow(db, ownerId, action, identity);
    if (!result.ok) await releaseDelivery(db, ownerId, action.eventId);
    return result;
  } catch (error) {
    await releaseDelivery(db, ownerId, action.eventId);
    console.error("zernio crm: falló el evento", error instanceof Error ? error.name : "error");
    return { ok: false, reason: "error", message: "No se pudo procesar el evento." };
  }
}
