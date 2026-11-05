// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` (CLAUDE.md §4).
//
// Alta o actualización de un lead que respondió el embudo orgánico de Instagram
// (ManyChat). Plans/manychat-instagram-leads.md. Es un upsert idempotente: la
// misma persona puede llegar varias veces (al responder, al calificar) y nunca
// se duplica ni baja de estado. No envía nada a nadie: sólo escribe filas.

import { z } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { getLeadForAutomation, type ApiLead } from "@/lib/automation/leads";
import { applyLeadStatusChange, type LeadsClient } from "@/lib/leads/contact";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";
import type { Json } from "@/lib/supabase/database.types";

export const INSTAGRAM_ACQUISITION_SOURCE = "instagram_organico" as const;

/**
 * Lista donde caen los leads nuevos del embudo, mientras la UI sólo muestre
 * leads por lista. Se crea sola la primera vez.
 */
export const INSTAGRAM_LIST_NAME = "Instagram orgánico";

/** Actividad de historial. No es un contacto. */
export const INSTAGRAM_INTAKE_ACTIVITY_TYPE = "NOTA" as const;

export const INTAKE_STAGES = ["respondio", "tibio", "calificado"] as const;
export type IntakeStage = (typeof INTAKE_STAGES)[number];

/** `respondio` y `tibio` son RESPONDIO; `tibio` queda marcado en `intake.stage` para nutrir. */
const STAGE_STATUS: Record<IntakeStage, LeadStatus> = {
  respondio: "RESPONDIO",
  tibio: "RESPONDIO",
  calificado: "CALIFICADO",
};

/** Para que una llamada tardía o repetida no baje la etapa guardada en `intake.stage`. */
const STAGE_RANK: Record<IntakeStage, number> = { respondio: 0, tibio: 1, calificado: 2 };

/** ManyChat manda las variables vacías como `""`: se tratan como `null`. */
const text = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

const utmSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .strictObject({
      source: text(120),
      medium: text(120),
      campaign: text(120),
      content: text(120),
      term: text(120),
    })
    .nullable()
    .optional(),
);

export const instagramIntakeBodySchema = z
  .strictObject({
    /** Quién llama. También puede venir en el header `X-Agent`. */
    agent: automationAgentIdSchema.optional(),
    manychat_id: text(64),
    ig_username: text(100),
    name: text(120),
    stage: z.enum(INTAKE_STAGES),
    rubro: text(120),
    rubro_libre: text(500),
    tarea: text(120),
    tarea_libre: text(500),
    tamano: text(60),
    volumen: text(60),
    keyword: text(60),
    pieza_origen: text(100),
    utm: utmSchema,
  })
  .refine((body) => Boolean(body.manychat_id) || Boolean(body.ig_username), {
    message: "Mandá manychat_id o ig_username.",
    path: ["manychat_id"],
  })
  .refine((body) => !body.ig_username || normalizeInstagramHandle(body.ig_username) !== null, {
    message: "Usuario de Instagram inválido.",
    path: ["ig_username"],
  });

export type InstagramIntakeBody = z.infer<typeof instagramIntakeBodySchema>;

export type InstagramIntakeInput = {
  manychatId: string | null;
  /** Ya normalizado: minúsculas, sin `@`, sin URL ni query. */
  handle: string | null;
  name: string | null;
  stage: IntakeStage;
  /** Campos del flujo, con las mismas claves que el body. Sólo los que vinieron con valor. */
  fields: Record<string, string>;
  utm: Record<string, string>;
};

const FLOW_FIELDS = ["rubro", "rubro_libre", "tarea", "tarea_libre", "tamano", "volumen", "keyword", "pieza_origen"] as const;

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/**
 * `@Estudio.Demo`, `instagram.com/estudio.demo/?utm=x` y `estudio.demo` son el
 * mismo usuario. `null` si no queda nada con forma de usuario de Instagram.
 */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^https?:\/\//, "").replace(/^(www\.|m\.)?instagram\.com\//, "");
  value = value.split(/[?#]/)[0].replace(/\/+$/, "");
  value = value.replace(/^@/, "");
  return /^[a-z0-9._]{1,30}$/.test(value) ? value : null;
}

/** snake_case del body → entrada del upsert. */
export function toInstagramIntakeInput(body: InstagramIntakeBody): InstagramIntakeInput {
  const fields: Record<string, string> = {};
  for (const key of FLOW_FIELDS) {
    const value = present(body[key]);
    if (value) fields[key] = value;
  }
  const utm: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.utm ?? {})) {
    const clean = present(value);
    if (clean) utm[key] = clean;
  }
  return {
    manychatId: present(body.manychat_id),
    handle: normalizeInstagramHandle(body.ig_username),
    name: present(body.name),
    stage: body.stage,
    fields,
    utm,
  };
}

/** `[manychat] calificado vía MOTION (pieza DfC9JvfxG_Q)` */
export function instagramIntakeActivityContent(agent: string, input: InstagramIntakeInput): string {
  const via = input.fields.keyword ? ` vía ${input.fields.keyword}` : "";
  const pieza = input.fields.pieza_origen ? ` (pieza ${input.fields.pieza_origen})` : "";
  return `[${agent}] ${input.stage}${via}${pieza}`;
}

export type InstagramIntakeResult =
  | {
      ok: true;
      created: boolean;
      lead: ApiLead;
      agent: string;
      /** Qué cambió en un lead que ya existía. Vacío si lo creó esta llamada. */
      changed: string[];
      activity: { type: typeof INSTAGRAM_INTAKE_ACTIVITY_TYPE; content: string };
    }
  | { ok: false; reason: "error"; message: string };

type IntakeObject = Record<string, Json | undefined>;

type FoundLead = {
  id: string;
  status: LeadStatus;
  instagram_url: string | null;
  intake: Json | null;
};

type IntakeClient = LeadsClient;

const SELECT_FOUND = "id, status, instagram_url, intake";

type Lookup = { ok: true; row: FoundLead | null } | { ok: false; message: string };

/**
 * Crea o actualiza el lead de este owner. Lo busca por ID de ManyChat, por el
 * mismo @ en `instagram_url` y por `dedupe_key`, en ese orden. Si ya existe,
 * enriquece `intake` y sólo sube de estado, nunca baja.
 */
export async function upsertInstagramLead(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  input: InstagramIntakeInput,
): Promise<InstagramIntakeResult> {
  const db = admin;
  const dedupeKey = input.handle ? `instagram:${input.handle}` : `manychat:${input.manychatId}`;

  // Dos vueltas: si otra llamada crea el mismo lead entre la búsqueda y el
  // insert, el unique (owner_id, dedupe_key) avisa y la segunda lo encuentra.
  for (let attempt = 0; attempt < 2; attempt++) {
    const found = await findLead(db, ownerId, input, dedupeKey);
    if (!found.ok) return { ok: false, reason: "error", message: found.message };

    if (found.row) return updateExisting(admin, db, ownerId, agent, input, found.row);

    const created = await createNew(admin, db, ownerId, agent, input, dedupeKey);
    if (created !== "retry") return created;
  }
  return { ok: false, reason: "error", message: "No se pudo guardar el lead." };
}

async function findLead(db: IntakeClient, ownerId: string, input: InstagramIntakeInput, dedupeKey: string): Promise<Lookup> {
  if (input.manychatId) {
    const { data, error } = await db
      .from("leads")
      .select(SELECT_FOUND)
      .eq("owner_id", ownerId)
      .eq("intake->>manychat_id", input.manychatId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return { ok: false, message: "No se pudo buscar el lead." };
    if (data?.[0]) return { ok: true, row: data[0] as FoundLead };
  }

  if (input.handle) {
    const { data, error } = await db
      .from("leads")
      .select(`${SELECT_FOUND}, created_at`)
      .eq("owner_id", ownerId)
      .ilike("instagram_url", `%instagram.com/${ilikeLiteral(input.handle)}%`)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) return { ok: false, message: "No se pudo buscar el lead." };
    const match = (data ?? []).find((row) => normalizeInstagramHandle(row.instagram_url) === input.handle);
    if (match) return { ok: true, row: match as FoundLead };
  }

  const { data, error } = await db
    .from("leads")
    .select(SELECT_FOUND)
    .eq("owner_id", ownerId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) return { ok: false, message: "No se pudo buscar el lead." };
  return { ok: true, row: (data as FoundLead | null) ?? null };
}

async function createNew(
  admin: LeadsClient,
  db: IntakeClient,
  ownerId: string,
  agent: string,
  input: InstagramIntakeInput,
  dedupeKey: string,
): Promise<InstagramIntakeResult | "retry"> {
  const list = await ensureInstagramList(db, ownerId);
  if (!list) return { ok: false, reason: "error", message: "No se pudo preparar la lista de Instagram." };

  const intake = mergeIntake(null, input);
  const inserted = await db
    .from("leads")
    .insert({
      owner_id: ownerId,
      name: input.name ?? (input.handle ? `@${input.handle}` : `Instagram ${input.manychatId}`),
      instagram_url: input.handle ? instagramUrl(input.handle) : null,
      lead_list_id: list,
      status: STAGE_STATUS[input.stage],
      dedupe_key: dedupeKey,
      last_contacted_at: null,
      acquisition_source: INSTAGRAM_ACQUISITION_SOURCE,
      intake: intake as Json,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") return "retry";
    return { ok: false, reason: "error", message: "No se pudo crear el lead." };
  }

  const leadId = inserted.data.id;
  const content = instagramIntakeActivityContent(agent, input);
  const noted = await noteActivity(db, ownerId, leadId, content);
  if (!noted) {
    await db.from("leads").delete().eq("id", leadId).eq("owner_id", ownerId);
    return { ok: false, reason: "error", message: "No se pudo anotar el alta en el historial." };
  }

  const detail = await readLead(admin, ownerId, leadId);
  if (!detail) {
    await db.from("lead_activities").delete().eq("lead_id", leadId).eq("owner_id", ownerId);
    await db.from("leads").delete().eq("id", leadId).eq("owner_id", ownerId);
    return { ok: false, reason: "error", message: "No se pudo leer el lead creado." };
  }

  return {
    ok: true,
    created: true,
    lead: detail,
    agent,
    changed: [],
    activity: { type: INSTAGRAM_INTAKE_ACTIVITY_TYPE, content },
  };
}

/** Id de la lista "Instagram orgánico" de este owner; la crea si no existe. */
async function ensureInstagramList(db: IntakeClient, ownerId: string): Promise<string | null> {
  const { data, error } = await db
    .from("lead_lists")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", INSTAGRAM_LIST_NAME)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[instagram-intake] no se pudo leer la lista", error.code, error.message);
    return null;
  }
  if (data?.[0]) return data[0].id;

  const created = await db
    .from("lead_lists")
    .insert({ owner_id: ownerId, name: INSTAGRAM_LIST_NAME, source: "INSTAGRAM", status: "COMPLETADO", lead_count: 0 })
    .select("id")
    .single();
  if (created.error || !created.data) {
    console.error("[instagram-intake] no se pudo crear la lista", created.error?.code, created.error?.message);
    return null;
  }
  return created.data.id;
}

async function updateExisting(
  admin: LeadsClient,
  db: IntakeClient,
  ownerId: string,
  agent: string,
  input: InstagramIntakeInput,
  row: FoundLead,
): Promise<InstagramIntakeResult> {
  const changed: string[] = [];
  const update: { intake?: Json; instagram_url?: string } = {};

  const intake = mergeIntake(asIntakeObject(row.intake), input);
  if (JSON.stringify(withoutStamp(intake)) !== JSON.stringify(withoutStamp(asIntakeObject(row.intake) ?? {}))) {
    update.intake = intake as Json;
    changed.push("intake");
  }
  // Un lead de prospección en frío sin @ guardado lo gana acá; uno que ya tiene
  // `instagram_url` no se pisa.
  if (!row.instagram_url && input.handle) {
    update.instagram_url = instagramUrl(input.handle);
    changed.push("instagram_url");
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db.from("leads").update(update).eq("id", row.id).eq("owner_id", ownerId);
    if (error) return { ok: false, reason: "error", message: "No se pudo actualizar el lead." };
  }

  // Sólo sube: un lead que ya avanzó (reunión, cierre, "ahora no") conserva su estado.
  const target = STAGE_STATUS[input.stage];
  if (LEAD_STATUSES.indexOf(target) > LEAD_STATUSES.indexOf(row.status)) {
    const moved = await applyLeadStatusChange(admin, ownerId, row.id, target);
    if (!moved.ok) return { ok: false, reason: "error", message: moved.message };
    if (moved.changed) changed.push("status");
  }

  const content = instagramIntakeActivityContent(agent, input);
  if (!(await noteActivity(db, ownerId, row.id, content))) {
    return { ok: false, reason: "error", message: "No se pudo anotar la actividad en el historial." };
  }

  const detail = await readLead(admin, ownerId, row.id);
  if (!detail) return { ok: false, reason: "error", message: "No se pudo leer el lead." };

  return {
    ok: true,
    created: false,
    lead: detail,
    agent,
    changed,
    activity: { type: INSTAGRAM_INTAKE_ACTIVITY_TYPE, content },
  };
}

/**
 * Lo que ya había se conserva si esta llamada no trae el dato (una variable
 * vacía de ManyChat no borra nada). La etapa nunca baja.
 */
function mergeIntake(previous: IntakeObject | null, input: InstagramIntakeInput): IntakeObject {
  const next: IntakeObject = { ...(previous ?? {}) };
  if (input.manychatId) next.manychat_id = input.manychatId;
  if (input.handle) next.ig_username = input.handle;
  for (const [key, value] of Object.entries(input.fields)) next[key] = value;

  if (Object.keys(input.utm).length > 0) {
    const prevUtm = previous?.utm && typeof previous.utm === "object" && !Array.isArray(previous.utm) ? previous.utm : {};
    next.utm = { ...prevUtm, ...input.utm };
  }

  const prevStage = typeof previous?.stage === "string" ? (previous.stage as IntakeStage) : null;
  next.stage = prevStage && prevStage in STAGE_RANK && STAGE_RANK[prevStage] > STAGE_RANK[input.stage] ? prevStage : input.stage;
  next.updated_at = new Date().toISOString();
  return next;
}

function withoutStamp(intake: IntakeObject): IntakeObject {
  const { updated_at: _updatedAt, ...rest } = intake;
  void _updatedAt;
  return rest;
}

function asIntakeObject(value: Json | null): IntakeObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as IntakeObject) : null;
}

function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}

/** Valor literal para `ilike`: `%`, `_` y `\` dejan de ser comodines (el `_` es válido en un @). */
function ilikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function noteActivity(db: IntakeClient, ownerId: string, leadId: string, content: string): Promise<boolean> {
  const { data, error } = await db
    .from("lead_activities")
    .insert({ owner_id: ownerId, lead_id: leadId, type: INSTAGRAM_INTAKE_ACTIVITY_TYPE, content })
    .select("id")
    .single();
  return !error && Boolean(data);
}

async function readLead(admin: LeadsClient, ownerId: string, leadId: string): Promise<ApiLead | null> {
  try {
    const detail = await getLeadForAutomation(admin, ownerId, leadId);
    return detail?.lead ?? null;
  } catch {
    return null;
  }
}
