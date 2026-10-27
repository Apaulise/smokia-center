// Esquema del rol admin de la API de automatización (mr-pou y quien esté en
// AUTOMATION_ADMIN_AGENTS). Puro: no toca la base. La lista blanca es la
// frontera — settings, scrape_jobs, profiles, marca y equipo no entran.

import { z, type ZodType } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { computeDedupeKey, normalizePhone } from "@/lib/leads/dedupe";
import { Constants } from "@/lib/supabase/database.types";

const ENUMS = Constants.public.Enums;

export const ADMIN_TABLES = [
  "leads",
  "lead_lists",
  "lead_activities",
  "lead_messages",
  "lead_intel",
  "lead_signals",
  "industries",
  "appointments",
  "message_templates",
  "sales_goals",
  "sales_knowledge",
] as const;

export type AdminTable = (typeof ADMIN_TABLES)[number];

const BLOCKED_MESSAGE: Record<string, string> = {
  owner_id: "owner_id lo fija el servidor y no se puede enviar.",
  id: "El id va en la URL, no en el body.",
  created_at: "created_at lo pone el servidor.",
  updated_at: "updated_at lo pone el servidor.",
  search: "search es una columna generada y no se escribe.",
  dedupe_key: "dedupe_key se calcula sola.",
  confirm: "confirm sólo aplica al DELETE.",
};

function oneOf(values: readonly string[]) {
  const [first, ...rest] = values;
  if (!first) throw new Error("enum vacío");
  return z.enum([first, ...rest]);
}

function oneOfOrNull(values: readonly string[]) {
  return z.union([oneOf(values), z.null()]);
}

const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = z.union([timestamp, z.null()]);

function finiteNumber(min: number, max: number) {
  return z.number().refine((value) => Number.isFinite(value) && value >= min && value <= max, "Número fuera de rango.");
}

function nullableFinite(min: number, max: number) {
  return z.union([finiteNumber(min, max), z.null()]);
}

function boundedJson(maxChars: number) {
  return z.unknown().refine((value) => {
    try {
      const encoded = JSON.stringify(value);
      return typeof encoded === "string" && encoded.length <= maxChars;
    } catch {
      return false;
    }
  }, "JSON demasiado grande.");
}

const nullableJson = z.union([boundedJson(50_000), z.null()]);

/** Texto que se guarda tal cual, sin recortar: el mensaje o la nota exacta. */
export function exactText(max: number) {
  return z.string().max(max).refine((value) => value.trim().length > 0, "El texto está vacío.");
}

function trimmed(max: number) {
  return z.string().trim().min(1).max(max);
}

function nullableTrimmed(max: number) {
  return z.union([z.string().trim().max(max), z.null()]).transform((value) => {
    if (value === null) return null;
    return value.trim() === "" ? null : value.trim();
  });
}

const phoneField = z
  .union([
    z.string().trim().max(40).refine((value) => value === "" || normalizePhone(value) !== null, "Teléfono inválido."),
    z.null(),
  ])
  .transform((value) => {
    if (value === null || value.trim() === "") return null;
    return normalizePhone(value);
  });

const emailField = z
  .union([
    z
      .string()
      .trim()
      .max(160)
      .refine((value) => value === "" || z.email().safeParse(value).success, "Email inválido."),
    z.null(),
  ])
  .transform((value) => {
    if (value === null || value.trim() === "") return null;
    return value.trim().toLowerCase();
  });

const currencyField = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3,8}$/, "Moneda inválida.")
  .transform((value) => value.toUpperCase());

const positiveMoney = finiteNumber(0.01, 1_000_000_000);
const rate = finiteNumber(0.0001, 1);
const smallint = z.number().int().min(0).max(32767);
const nullableSmallint = z.union([smallint, z.null()]);

function rowSchema(shape: Record<string, ZodType>, mode: "insert" | "update", required: readonly string[]) {
  const out: Record<string, ZodType> = {};
  for (const [key, schema] of Object.entries(shape)) {
    out[key] = mode === "insert" && required.includes(key) ? schema : schema.optional();
  }
  const base = z.strictObject(out as never) as ZodType<Record<string, unknown>>;
  if (mode === "update") {
    return base.refine((row) => Object.values(row).some((value) => value !== undefined), {
      message: "Nada para actualizar.",
    });
  }
  return base;
}

export type AdminFilter = {
  param: string;
  column: string;
  kind: "uuid" | "enum" | "bool";
  values?: readonly string[];
};

export type AdminRef = { column: string; table: AdminTable };

export type AdminResource = {
  name: string;
  table: AdminTable;
  deleteMode: "soft" | "hard";
  /** `id` si la fila es el lead. `lead_id` si cuelga de uno. `null` si no. */
  leadLink: "id" | "lead_id" | null;
  columns: readonly string[];
  orderBy: readonly string[];
  defaultOrder: string;
  filters: readonly AdminFilter[];
  refs: readonly AdminRef[];
  insert: ZodType<Record<string, unknown>>;
  update: ZodType<Record<string, unknown>>;
  writable: readonly string[];
};

function defineResource(input: {
  name: string;
  table: AdminTable;
  deleteMode: "soft" | "hard";
  leadLink: "id" | "lead_id" | null;
  columns: readonly string[];
  orderBy: readonly string[];
  defaultOrder: string;
  filters?: readonly AdminFilter[];
  refs?: readonly AdminRef[];
  fields: Record<string, ZodType>;
  required: readonly string[];
}): AdminResource {
  return {
    name: input.name,
    table: input.table,
    deleteMode: input.deleteMode,
    leadLink: input.leadLink,
    columns: input.columns,
    orderBy: input.orderBy,
    defaultOrder: input.defaultOrder,
    filters: input.filters ?? [],
    refs: input.refs ?? [],
    insert: rowSchema(input.fields, "insert", input.required),
    update: rowSchema(input.fields, "update", input.required),
    writable: Object.keys(input.fields),
  };
}

const leadStatus = ENUMS.lead_status;
const leadFields: Record<string, ZodType> = {
  name: trimmed(200),
  phone: phoneField,
  email: emailField,
  website: nullableTrimmed(500),
  address: nullableTrimmed(300),
  city: nullableTrimmed(120),
  region: nullableTrimmed(120),
  country: nullableTrimmed(120),
  latitude: nullableFinite(-90, 90),
  longitude: nullableFinite(-180, 180),
  rating: nullableFinite(0, 9.9),
  reviews_count: z.union([z.number().int().min(0).max(5_000_000), z.null()]),
  instagram_url: nullableTrimmed(500),
  linkedin_url: nullableTrimmed(500),
  source_url: nullableTrimmed(500),
  external_id: nullableTrimmed(200),
  raw: z.union([boundedJson(100_000), z.null()]),
  status: oneOf(leadStatus),
  notes: nullableTrimmed(8000),
  last_contacted_at: nullableTimestamp,
  next_action_at: nullableTimestamp,
  industry_id: z.union([z.uuid(), z.null()]),
  lead_list_id: z.union([z.uuid(), z.null()]),
  interest_level: z.union([z.number().int().min(0).max(10), z.null()]),
  sales_angle: oneOfOrNull(ENUMS.lead_sales_angle),
};

const LEAD_COLUMNS = [
  "id",
  "owner_id",
  "lead_list_id",
  "industry_id",
  "name",
  "phone",
  "email",
  "website",
  "address",
  "city",
  "region",
  "country",
  "latitude",
  "longitude",
  "rating",
  "reviews_count",
  "instagram_url",
  "linkedin_url",
  "source_url",
  "external_id",
  "raw",
  "status",
  "notes",
  "last_contacted_at",
  "next_action_at",
  "dedupe_key",
  "interest_level",
  "sales_angle",
  "created_at",
  "updated_at",
] as const;

const leads = defineResource({
  name: "leads",
  table: "leads",
  deleteMode: "soft",
  leadLink: "id",
  columns: LEAD_COLUMNS,
  orderBy: ["created_at", "updated_at", "next_action_at", "name", "status"],
  defaultOrder: "created_at",
  filters: [
    { param: "status", column: "status", kind: "enum", values: leadStatus },
    { param: "lead_list_id", column: "lead_list_id", kind: "uuid" },
    { param: "industry_id", column: "industry_id", kind: "uuid" },
  ],
  refs: [
    { column: "industry_id", table: "industries" },
    { column: "lead_list_id", table: "lead_lists" },
  ],
  fields: leadFields,
  required: ["name"],
});

const leadLists = defineResource({
  name: "lead_lists",
  table: "lead_lists",
  deleteMode: "hard",
  leadLink: null,
  columns: ["id", "owner_id", "name", "source", "criteria", "status", "lead_count", "industry_id", "created_at", "updated_at"],
  orderBy: ["created_at", "updated_at", "name"],
  defaultOrder: "created_at",
  filters: [
    { param: "status", column: "status", kind: "enum", values: ENUMS.job_status },
    { param: "industry_id", column: "industry_id", kind: "uuid" },
  ],
  refs: [{ column: "industry_id", table: "industries" }],
  fields: {
    name: trimmed(200),
    source: oneOf(ENUMS.lead_source),
    criteria: boundedJson(50_000),
    status: oneOf(ENUMS.job_status),
    lead_count: z.number().int().min(0).max(1_000_000),
    industry_id: z.union([z.uuid(), z.null()]),
  },
  required: ["name", "source"],
});

const leadActivities = defineResource({
  name: "lead_activities",
  table: "lead_activities",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: ["id", "owner_id", "lead_id", "type", "from_status", "to_status", "content", "occurred_at", "created_at"],
  orderBy: ["occurred_at", "created_at"],
  defaultOrder: "occurred_at",
  filters: [
    { param: "lead_id", column: "lead_id", kind: "uuid" },
    { param: "type", column: "type", kind: "enum", values: ENUMS.lead_activity_type },
  ],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    lead_id: z.uuid(),
    type: oneOf(ENUMS.lead_activity_type),
    content: z.union([exactText(8000), z.null()]),
    from_status: oneOfOrNull(leadStatus),
    to_status: oneOfOrNull(leadStatus),
    occurred_at: timestamp,
  },
  required: ["lead_id", "type"],
});

const leadMessages = defineResource({
  name: "lead_messages",
  table: "lead_messages",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: [
    "id",
    "owner_id",
    "lead_id",
    "sender",
    "channel",
    "content",
    "generated_by",
    "generated_content",
    "angle",
    "variant",
    "kind",
    "analysis",
    "confirmed",
    "confirmed_at",
    "edit_distance",
    "style_excluded",
    "occurred_at",
    "created_at",
  ],
  orderBy: ["occurred_at", "created_at", "confirmed_at"],
  defaultOrder: "occurred_at",
  filters: [
    { param: "lead_id", column: "lead_id", kind: "uuid" },
    { param: "sender", column: "sender", kind: "enum", values: ENUMS.lead_message_sender },
    { param: "channel", column: "channel", kind: "enum", values: ENUMS.message_channel },
    { param: "confirmed", column: "confirmed", kind: "bool" },
  ],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    lead_id: z.uuid(),
    sender: oneOf(ENUMS.lead_message_sender),
    channel: oneOf(ENUMS.message_channel),
    content: exactText(8000),
    generated_by: oneOfOrNull(ENUMS.lead_message_generator),
    generated_content: z.union([exactText(8000), z.null()]),
    angle: oneOfOrNull(ENUMS.lead_sales_angle),
    variant: nullableSmallint,
    kind: oneOfOrNull(ENUMS.lead_message_kind),
    analysis: nullableJson,
    confirmed: z.boolean(),
    confirmed_at: nullableTimestamp,
    edit_distance: nullableSmallint,
    style_excluded: z.boolean(),
    occurred_at: timestamp,
  },
  required: ["lead_id", "sender", "content"],
});

const leadIntel = defineResource({
  name: "lead_intel",
  table: "lead_intel",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: [
    "id",
    "owner_id",
    "lead_id",
    "enrichment",
    "memory",
    "next_best_action",
    "next_best_action_reason",
    "enriched_at",
    "created_at",
    "updated_at",
  ],
  orderBy: ["updated_at", "created_at"],
  defaultOrder: "updated_at",
  filters: [{ param: "lead_id", column: "lead_id", kind: "uuid" }],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    lead_id: z.uuid(),
    enrichment: nullableJson,
    memory: nullableJson,
    next_best_action: oneOfOrNull(ENUMS.lead_next_action),
    next_best_action_reason: nullableTrimmed(2000),
    enriched_at: nullableTimestamp,
  },
  required: ["lead_id"],
});

const leadSignals = defineResource({
  name: "lead_signals",
  table: "lead_signals",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: [
    "id",
    "owner_id",
    "lead_id",
    "kind",
    "status",
    "title",
    "description",
    "evidence",
    "business_impact",
    "trigger_event",
    "timing",
    "already_solved",
    "created_at",
    "updated_at",
  ],
  orderBy: ["created_at", "updated_at"],
  defaultOrder: "created_at",
  filters: [
    { param: "lead_id", column: "lead_id", kind: "uuid" },
    { param: "kind", column: "kind", kind: "enum", values: ENUMS.lead_signal_kind },
    { param: "status", column: "status", kind: "enum", values: ENUMS.lead_signal_status },
  ],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    lead_id: z.uuid(),
    kind: oneOf(ENUMS.lead_signal_kind),
    status: oneOf(ENUMS.lead_signal_status),
    title: trimmed(200),
    description: nullableTrimmed(4000),
    evidence: nullableTrimmed(4000),
    business_impact: nullableTrimmed(2000),
    trigger_event: nullableTrimmed(2000),
    timing: nullableTrimmed(500),
    already_solved: z.boolean(),
  },
  required: ["lead_id", "kind", "title"],
});

const industries = defineResource({
  name: "industries",
  table: "industries",
  deleteMode: "hard",
  leadLink: null,
  columns: ["id", "owner_id", "name", "slug", "color", "created_at", "updated_at"],
  orderBy: ["name", "created_at"],
  defaultOrder: "name",
  fields: {
    name: trimmed(120),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido."),
    color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Color inválido."),
  },
  required: ["name", "slug"],
});

const appointments = defineResource({
  name: "appointments",
  table: "appointments",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: ["id", "owner_id", "lead_id", "title", "notes", "starts_at", "ends_at", "meeting_url", "status", "created_at", "updated_at"],
  orderBy: ["starts_at", "created_at"],
  defaultOrder: "starts_at",
  filters: [
    { param: "lead_id", column: "lead_id", kind: "uuid" },
    { param: "status", column: "status", kind: "enum", values: ENUMS.appointment_status },
  ],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    lead_id: z.union([z.uuid(), z.null()]),
    title: trimmed(200),
    notes: nullableTrimmed(4000),
    starts_at: timestamp,
    ends_at: timestamp,
    meeting_url: nullableTrimmed(500),
    status: oneOf(ENUMS.appointment_status),
  },
  required: ["title", "starts_at", "ends_at"],
});

const messageTemplates = defineResource({
  name: "message_templates",
  table: "message_templates",
  deleteMode: "hard",
  leadLink: null,
  columns: ["id", "owner_id", "name", "channel", "body", "created_at", "updated_at"],
  orderBy: ["name", "created_at"],
  defaultOrder: "name",
  filters: [{ param: "channel", column: "channel", kind: "enum", values: ENUMS.message_channel }],
  fields: {
    name: trimmed(120),
    channel: oneOf(ENUMS.message_channel),
    body: exactText(8000),
  },
  required: ["name", "channel", "body"],
});

const goalFields: Record<string, ZodType> = {
  monthly_revenue_target: positiveMoney,
  avg_ticket: positiveMoney,
  currency: currencyField,
  booking_rate: rate,
  show_rate: rate,
  close_rate: rate,
  working_days_per_month: z.number().int().min(1).max(31),
  working_days_per_week: z.number().int().min(1).max(7),
  status: oneOf(ENUMS.sales_goal_status),
};

const GOAL_COLUMNS = [
  "id",
  "owner_id",
  "monthly_revenue_target",
  "avg_ticket",
  "currency",
  "booking_rate",
  "show_rate",
  "close_rate",
  "working_days_per_month",
  "working_days_per_week",
  "status",
  "created_at",
  "updated_at",
] as const;

const salesGoals = defineResource({
  name: "sales_goals",
  table: "sales_goals",
  deleteMode: "hard",
  leadLink: null,
  columns: GOAL_COLUMNS,
  orderBy: ["created_at", "updated_at"],
  defaultOrder: "created_at",
  filters: [{ param: "status", column: "status", kind: "enum", values: ENUMS.sales_goal_status }],
  fields: goalFields,
  required: [
    "monthly_revenue_target",
    "avg_ticket",
    "booking_rate",
    "show_rate",
    "close_rate",
    "working_days_per_month",
    "working_days_per_week",
  ],
});

/** Alias de sales_goals: el objetivo de facturación del CRM. */
const goals: AdminResource = { ...salesGoals, name: "goals" };

const salesKnowledge = defineResource({
  name: "sales_knowledge",
  table: "sales_knowledge",
  deleteMode: "hard",
  leadLink: "lead_id",
  columns: ["id", "owner_id", "collection", "title", "body", "data", "origin", "tags", "lead_id", "created_at", "updated_at"],
  orderBy: ["created_at", "updated_at", "title"],
  defaultOrder: "created_at",
  filters: [
    { param: "lead_id", column: "lead_id", kind: "uuid" },
    { param: "collection", column: "collection", kind: "enum", values: ENUMS.lead_knowledge_collection },
    { param: "origin", column: "origin", kind: "enum", values: ENUMS.lead_knowledge_origin },
  ],
  refs: [{ column: "lead_id", table: "leads" }],
  fields: {
    collection: oneOf(ENUMS.lead_knowledge_collection),
    title: trimmed(200),
    body: nullableTrimmed(8000),
    data: boundedJson(50_000),
    origin: oneOf(ENUMS.lead_knowledge_origin),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    lead_id: z.union([z.uuid(), z.null()]),
  },
  required: ["collection", "title", "origin"],
});

const RESOURCE_LIST: AdminResource[] = [
  leads,
  leadLists,
  leadActivities,
  leadMessages,
  leadIntel,
  leadSignals,
  industries,
  appointments,
  messageTemplates,
  salesGoals,
  goals,
  salesKnowledge,
];

const RESOURCES = new Map(RESOURCE_LIST.map((resource) => [resource.name, resource]));

const RESOURCE_NAME = /^[a-z][a-z0-9_]{0,40}$/;

export function resolveAdminResource(name: string): AdminResource | null {
  const key = name.trim().toLowerCase();
  if (!RESOURCE_NAME.test(key)) return null;
  return RESOURCES.get(key) ?? null;
}

export function adminCatalog() {
  return RESOURCE_LIST.map((resource) => ({
    resource: resource.name,
    table: resource.table,
    delete: resource.deleteMode,
    leadLink: resource.leadLink,
    writable: resource.writable,
    filters: resource.filters.map((filter) => filter.param),
    orderBy: resource.orderBy,
    defaultOrder: resource.defaultOrder,
  }));
}

export function adminSelect(resource: AdminResource, kind: "list" | "one", includeRaw: boolean): string {
  const hideRaw = kind === "list" && !includeRaw;
  return resource.columns.filter((column) => !(hideRaw && column === "raw")).join(", ");
}

function compact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function agentFromBody(json: unknown): { ok: true; agent: string | null } | { ok: false; error: string } {
  if (json == null) return { ok: true, agent: null };
  if (typeof json !== "object" || Array.isArray(json)) return { ok: false, error: "Body inválido." };
  const agent = (json as Record<string, unknown>).agent;
  if (agent == null) return { ok: true, agent: null };
  if (typeof agent !== "string") return { ok: false, error: "Agente inválido." };
  return { ok: true, agent };
}

export function deletionConfirmed(queryValue: string | null, body: unknown): boolean {
  if (queryValue === "true") return true;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return (body as Record<string, unknown>).confirm === true;
  }
  return false;
}

export type ParseWriteResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string; details?: unknown };

export function parseAdminWrite(resource: AdminResource, body: unknown, mode: "insert" | "update"): ParseWriteResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body inválido." };
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === "agent") continue;
    const blocked = BLOCKED_MESSAGE[key];
    if (blocked) return { ok: false, error: blocked };
    fields[key] = value;
  }
  const schema = mode === "insert" ? resource.insert : resource.update;
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: "Body inválido.", details: parsed.error.issues };
  return { ok: true, row: compact(parsed.data) };
}

export type AdminListQuery = {
  limit: number;
  offset: number;
  order: string;
  ascending: boolean;
  includeRaw: boolean;
  filters: { column: string; value: string | boolean }[];
};

const LIST_META = new Set(["limit", "offset", "order", "dir", "include_raw"]);

export function parseAdminListQuery(
  resource: AdminResource,
  raw: Record<string, string | undefined>,
): { ok: true; query: AdminListQuery } | { ok: false; error: string; details?: unknown } {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || value.trim() === "") continue;
    flat[key] = value.trim();
  }
  const filterByParam = new Map(resource.filters.map((filter) => [filter.param, filter]));
  for (const key of Object.keys(flat)) {
    if (LIST_META.has(key) || filterByParam.has(key)) continue;
    return { ok: false, error: "Filtro no permitido." };
  }

  const pagingInput: Record<string, string> = {};
  if (flat.limit) pagingInput.limit = flat.limit;
  if (flat.offset) pagingInput.offset = flat.offset;
  if (flat.dir) pagingInput.dir = flat.dir;
  if (flat.include_raw) pagingInput.include_raw = flat.include_raw;
  const paging = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(10_000).default(0),
      dir: z.enum(["asc", "desc"]).default("desc"),
      include_raw: z.enum(["true", "false"]).optional(),
    })
    .safeParse(pagingInput);
  if (!paging.success) return { ok: false, error: "Parámetros inválidos.", details: paging.error.issues };

  if (paging.data.include_raw === "true" && !resource.columns.includes("raw")) {
    return { ok: false, error: "Este recurso no tiene raw." };
  }

  let order = resource.defaultOrder;
  if (flat.order) {
    if (!resource.orderBy.includes(flat.order)) return { ok: false, error: "Orden no permitido." };
    order = flat.order;
  }

  const filters: { column: string; value: string | boolean }[] = [];
  for (const filter of resource.filters) {
    const value = flat[filter.param];
    if (value == null) continue;
    if (filter.kind === "uuid") {
      if (!z.uuid().safeParse(value).success) return { ok: false, error: "Filtro inválido." };
      filters.push({ column: filter.column, value });
      continue;
    }
    if (filter.kind === "bool") {
      if (value !== "true" && value !== "false") return { ok: false, error: "Filtro inválido." };
      filters.push({ column: filter.column, value: value === "true" });
      continue;
    }
    const candidate = value.toUpperCase();
    if (!filter.values?.includes(candidate)) return { ok: false, error: "Filtro inválido." };
    filters.push({ column: filter.column, value: candidate });
  }

  return {
    ok: true,
    query: {
      limit: paging.data.limit,
      offset: paging.data.offset,
      order,
      ascending: paging.data.dir === "asc",
      includeRaw: paging.data.include_raw === "true",
      filters,
    },
  };
}

export function adminAuditContent(agent: string, summary: string): string {
  const text = `[${agent}] ${summary}`.replace(/\s+/g, " ").trim();
  return text.length > 4000 ? text.slice(0, 4000) : text;
}

export function describeChanges(changes: Record<string, unknown>, current: Record<string, unknown>): string {
  return Object.keys(changes)
    .filter((key) => key !== "dedupe_key")
    .map((key) => (key === "status" ? `status (${String(current.status)} → ${String(changes.status)})` : key))
    .join(", ");
}

export function sameValue(current: unknown, next: unknown): boolean {
  if (Object.is(current, next)) return true;
  if (current == null || next == null) return false;
  if (typeof current === "number" && typeof next === "string") return next.trim() !== "" && sameValue(current, Number(next));
  if (typeof current === "string" && typeof next === "number") return current.trim() !== "" && Number(current) === next;
  if (typeof current === "string" && typeof next === "string") {
    const left = Date.parse(current);
    const right = Date.parse(next);
    if (!Number.isNaN(left) && left === right) return true;
  }
  if (typeof current === "object" && typeof next === "object") {
    try {
      return JSON.stringify(current) === JSON.stringify(next);
    } catch {
      return false;
    }
  }
  return false;
}

export function changedFields(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!sameValue(current[key], value)) out[key] = value;
  }
  return out;
}

const DEDUPE_INPUTS = ["name", "phone", "website", "city", "source_url"] as const;

export function prepareLeadDedupe(
  current: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): { ok: true; row: Record<string, unknown>; dedupeKey: string | null } | { ok: false; error: string } {
  const merged = { ...(current ?? {}), ...patch };
  const name = typeof merged.name === "string" ? merged.name.trim() : "";
  if (!name) return { ok: false, error: "El lead no tiene nombre." };
  const affects = current == null || DEDUPE_INPUTS.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (!affects) return { ok: true, row: patch, dedupeKey: null };
  const dedupeKey = computeDedupeKey({
    name,
    phone: typeof merged.phone === "string" ? merged.phone : null,
    website: typeof merged.website === "string" ? merged.website : null,
    city: typeof merged.city === "string" ? merged.city : null,
    sourceUrl: typeof merged.source_url === "string" ? merged.source_url : null,
    raw: null,
  });
  if (current && dedupeKey === current.dedupe_key) return { ok: true, row: patch, dedupeKey: null };
  if (current) return { ok: true, row: { ...patch, dedupe_key: dedupeKey }, dedupeKey };
  return { ok: true, row: patch, dedupeKey };
}

export function leadMessageViolation(row: Record<string, unknown>): string | null {
  if (row.generated_by != null && row.sender !== "VENDEDOR") {
    return "generated_by sólo aplica a un mensaje del VENDEDOR.";
  }
  if (row.generated_content != null && row.generated_content !== "" && row.generated_by !== "IA") {
    return "generated_content sólo va con generated_by IA.";
  }
  return null;
}

export function appointmentWindowViolation(row: Record<string, unknown>): string | null {
  if (typeof row.starts_at !== "string" || typeof row.ends_at !== "string") return null;
  const starts = Date.parse(row.starts_at);
  const ends = Date.parse(row.ends_at);
  if (Number.isNaN(starts) || Number.isNaN(ends) || ends <= starts) {
    return "ends_at tiene que ser posterior a starts_at.";
  }
  return null;
}

export function businessViolation(table: AdminTable, row: Record<string, unknown>): string | null {
  if (table === "lead_messages") return leadMessageViolation(row);
  if (table === "appointments") return appointmentWindowViolation(row);
  return null;
}

export function auditSummaryFor(
  resource: AdminResource,
  action: "create" | "update" | "delete",
  changes: Record<string, unknown>,
  current: Record<string, unknown>,
  override?: string,
): string {
  if (override) return override;
  if (action === "delete") return `${resource.name} borrado`;
  if (action === "create") {
    return resource.table === "leads" ? "lead creado vía API admin" : `${resource.name} creado`;
  }
  const described = describeChanges(changes, current);
  if (resource.table === "leads") return described ? `lead actualizado: ${described}` : "lead actualizado";
  return described ? `${resource.name} actualizado: ${described}` : `${resource.name} actualizado`;
}

export const adminLeadStatusSchema = z.strictObject({
  agent: automationAgentIdSchema.optional(),
  lead_id: z.uuid(),
  status: oneOf(leadStatus),
});

export const adminLeadActivitySchema = z.strictObject({
  agent: automationAgentIdSchema.optional(),
  lead_id: z.uuid(),
  type: oneOf(ENUMS.lead_activity_type).default("NOTA"),
  content: exactText(8000),
  occurred_at: timestamp.optional(),
  from_status: oneOfOrNull(leadStatus).optional(),
  to_status: oneOfOrNull(leadStatus).optional(),
});

export const adminLeadMessageSchema = z
  .strictObject({
    agent: automationAgentIdSchema.optional(),
    lead_id: z.uuid(),
    content: exactText(8000),
    sender: oneOf(ENUMS.lead_message_sender),
    channel: oneOf(ENUMS.message_channel).default("WHATSAPP"),
    confirmed: z.boolean().default(true),
    confirmed_at: nullableTimestamp.optional(),
    occurred_at: timestamp.optional(),
    kind: oneOfOrNull(ENUMS.lead_message_kind).optional(),
    generated_by: oneOfOrNull(ENUMS.lead_message_generator).optional(),
    generated_content: z.union([exactText(8000), z.null()]).optional(),
    angle: oneOfOrNull(ENUMS.lead_sales_angle).optional(),
    variant: nullableSmallint.optional(),
    analysis: nullableJson.optional(),
    edit_distance: nullableSmallint.optional(),
    style_excluded: z.boolean().optional(),
  })
  .superRefine((row, ctx) => {
    const violation = leadMessageViolation(row);
    if (violation) ctx.addIssue({ code: "custom", message: violation });
  });
