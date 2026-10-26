// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` (CLAUDE.md §4).
//
// Alta de un lead desde la API de automatización. Estado inicial NUEVO, sin
// contacto. El rastro es una actividad NOTA, el mismo tipo que deja la ficha
// cuando alguien anota algo.

import { z } from "zod";

import { automationAgentIdSchema } from "@/lib/automation/agents";
import { getLeadForAutomation, type ApiLead } from "@/lib/automation/leads";
import type { LeadsClient } from "@/lib/leads/contact";
import { computeDedupeKey, normalizePhone } from "@/lib/leads/dedupe";

const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .refine((value) => value == null || value === "" || normalizePhone(value) !== null, {
    message: "Teléfono inválido.",
  });

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .toLowerCase()
  .nullable()
  .optional()
  .refine((value) => value == null || value === "" || z.email().safeParse(value).success, {
    message: "Email inválido.",
  });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createLeadBodySchema = z
  .strictObject({
    /** Quién crea. También puede venir en el header `X-Agent`. */
    agent: automationAgentIdSchema.optional(),
    name: z.string().trim().min(2, "Ponele un nombre al lead.").max(120, "Nombre muy largo."),
    city: optionalText(100),
    website: optionalText(200),
    email: optionalEmail,
    /** Misma normalización que el PATCH. Vacío se guarda como null. */
    phone: phoneSchema,
    notes: optionalText(4000),
    /** Id o nombre de una lista que ya existe. `lista` es el mismo dato. */
    list: optionalText(80),
    lista: optionalText(80),
  })
  .refine(
    (body) => !body.list || !body.lista || body.list.trim().toLowerCase() === body.lista.trim().toLowerCase(),
    { message: "list y lista no coinciden." },
  );

export type CreateLeadBody = z.infer<typeof createLeadBodySchema>;

export type CreateLeadInput = {
  name: string;
  city: string | null;
  website: string | null;
  email: string | null;
  /** Todavía sin normalizar. `null` si no vino. */
  phone: string | null;
  notes: string | null;
  /** Id o nombre de `lead_lists`. `null` si el lead no va a una lista. */
  listRef: string | null;
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** snake_case del body → campos del alta. `list` y `lista` son el mismo dato. */
export function toCreateLeadInput(body: CreateLeadBody): CreateLeadInput {
  return {
    name: body.name,
    city: emptyToNull(body.city),
    website: emptyToNull(body.website),
    email: emptyToNull(body.email),
    phone: emptyToNull(body.phone),
    notes: emptyToNull(body.notes),
    listRef: emptyToNull(body.list) ?? emptyToNull(body.lista),
  };
}

/** Actividad de historial. No es un contacto. */
export const CREATE_LEAD_ACTIVITY_TYPE = "NOTA" as const;

export function createLeadActivityContent(agent: string): string {
  return `[${agent}] lead creado vía API`;
}

type ConflictKind = "phone" | "email" | "name_city" | "website" | "name";

export type CreateLeadResult =
  | {
      ok: true;
      lead: ApiLead;
      agent: string;
      activity: { type: typeof CREATE_LEAD_ACTIVITY_TYPE; content: string };
    }
  | { ok: false; reason: "conflict"; message: string; id: string | null }
  | { ok: false; reason: "invalid_phone" | "invalid_list" | "error"; message: string };

type ExistingLead = { id: string; name: string };

/**
 * Crea el lead de este owner. Si el teléfono, el email, el sitio o el
 * nombre+ciudad ya están en otro lead del mismo owner, no escribe nada y
 * devuelve el id existente.
 */
export async function createLeadForAutomation(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  input: CreateLeadInput,
): Promise<CreateLeadResult> {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) return { ok: false, reason: "invalid_phone", message: "Teléfono inválido." };

  const list = await resolveList(admin, ownerId, input.listRef);
  if (!list.ok) return list;

  const dedupeKey = computeDedupeKey({
    name: input.name,
    phone,
    website: input.website,
    city: input.city,
    sourceUrl: null,
    raw: null,
  });

  const byKey = await findByDedupeKey(admin, ownerId, dedupeKey);
  if (!byKey.ok) return byKey;
  if (byKey.row) return conflict(conflictKind(dedupeKey, input.city), byKey.row);

  if (input.email) {
    const byEmail = await findByEmail(admin, ownerId, input.email);
    if (!byEmail.ok) return byEmail;
    if (byEmail.row) return conflict("email", byEmail.row);
  }

  if (input.city) {
    const byName = await findByNameAndCity(admin, ownerId, input.name, input.city);
    if (!byName.ok) return byName;
    if (byName.row) return conflict("name_city", byName.row);
  }

  const inserted = await admin
    .from("leads")
    .insert({
      owner_id: ownerId,
      name: input.name,
      phone,
      email: input.email,
      website: input.website,
      city: input.city,
      notes: input.notes,
      lead_list_id: list.list?.id ?? null,
      status: "NUEVO",
      dedupe_key: dedupeKey,
      last_contacted_at: null,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      const again = await findByDedupeKey(admin, ownerId, dedupeKey);
      if (!again.ok) return again;
      if (again.row) return conflict(conflictKind(dedupeKey, input.city), again.row);
      return { ok: false, reason: "conflict", message: "Ya existe un lead con esos datos.", id: null };
    }
    return { ok: false, reason: "error", message: "No se pudo crear el lead." };
  }

  const leadId = inserted.data.id;
  const activity = createLeadActivityContent(agent);
  const noted = await admin
    .from("lead_activities")
    .insert({
      owner_id: ownerId,
      lead_id: leadId,
      type: CREATE_LEAD_ACTIVITY_TYPE,
      content: activity,
    })
    .select("id")
    .single();

  if (noted.error || !noted.data) {
    await admin.from("leads").delete().eq("id", leadId).eq("owner_id", ownerId);
    return { ok: false, reason: "error", message: "No se pudo anotar el alta en el historial." };
  }

  let detail: Awaited<ReturnType<typeof getLeadForAutomation>>;
  try {
    detail = await getLeadForAutomation(admin, ownerId, leadId);
  } catch {
    await rollback(admin, ownerId, leadId, noted.data.id);
    return { ok: false, reason: "error", message: "No se pudo leer el lead creado." };
  }
  if (!detail) {
    await rollback(admin, ownerId, leadId, noted.data.id);
    return { ok: false, reason: "error", message: "No se pudo leer el lead creado." };
  }

  return {
    ok: true,
    lead: detail.lead,
    agent,
    activity: { type: CREATE_LEAD_ACTIVITY_TYPE, content: activity },
  };
}

async function rollback(admin: LeadsClient, ownerId: string, leadId: string, activityId: string) {
  await admin.from("lead_activities").delete().eq("id", activityId).eq("owner_id", ownerId).eq("lead_id", leadId);
  await admin.from("leads").delete().eq("id", leadId).eq("owner_id", ownerId);
}

function conflict(kind: ConflictKind, row: ExistingLead): CreateLeadResult {
  const message =
    kind === "phone"
      ? `Ese teléfono ya está en "${row.name}".`
      : kind === "email"
        ? `Ya hay un lead con ese email: "${row.name}".`
        : kind === "name_city"
          ? `Ya hay un lead con ese nombre en esa ciudad: "${row.name}".`
          : kind === "website"
            ? `Ya hay un lead con ese sitio: "${row.name}".`
            : `Ya hay un lead con ese nombre: "${row.name}".`;
  return { ok: false, reason: "conflict", message, id: row.id };
}

function conflictKind(dedupeKey: string, city: string | null): ConflictKind {
  if (dedupeKey.startsWith("phone:")) return "phone";
  if (dedupeKey.startsWith("domain:")) return "website";
  return city ? "name_city" : "name";
}

/** Valor literal para `ilike`: `%`, `_` y `\` dejan de ser comodines. */
function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function sameText(left: string | null | undefined, right: string): boolean {
  return (left ?? "").trim().toLowerCase() === right.trim().toLowerCase();
}

type Lookup<T> = { ok: true; row: T | null } | { ok: false; reason: "error"; message: string };

async function findByDedupeKey(admin: LeadsClient, ownerId: string, dedupeKey: string): Promise<Lookup<ExistingLead>> {
  const { data, error } = await admin
    .from("leads")
    .select("id, name")
    .eq("owner_id", ownerId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: "No se pudo crear el lead." };
  return { ok: true, row: data };
}

async function findByEmail(admin: LeadsClient, ownerId: string, email: string): Promise<Lookup<ExistingLead>> {
  const { data, error } = await admin
    .from("leads")
    .select("id, name, email, created_at")
    .eq("owner_id", ownerId)
    .ilike("email", ilikeExact(email))
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return { ok: false, reason: "error", message: "No se pudo crear el lead." };
  const match = (data ?? []).find((row) => sameText(row.email, email));
  return { ok: true, row: match ? { id: match.id, name: match.name } : null };
}

async function findByNameAndCity(
  admin: LeadsClient,
  ownerId: string,
  name: string,
  city: string,
): Promise<Lookup<ExistingLead>> {
  const { data, error } = await admin
    .from("leads")
    .select("id, name, city, created_at")
    .eq("owner_id", ownerId)
    .ilike("name", ilikeExact(name))
    .ilike("city", ilikeExact(city))
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return { ok: false, reason: "error", message: "No se pudo crear el lead." };
  const match = (data ?? []).find((row) => sameText(row.name, name) && sameText(row.city, city));
  return { ok: true, row: match ? { id: match.id, name: match.name } : null };
}

async function resolveList(
  admin: LeadsClient,
  ownerId: string,
  listRef: string | null,
): Promise<{ ok: true; list: { id: string; name: string } | null } | { ok: false; reason: "invalid_list" | "error"; message: string }> {
  if (!listRef) return { ok: true, list: null };

  if (z.uuid().safeParse(listRef).success) {
    const { data, error } = await admin
      .from("lead_lists")
      .select("id, name")
      .eq("owner_id", ownerId)
      .eq("id", listRef)
      .maybeSingle();
    if (error) return { ok: false, reason: "error", message: "No se pudo leer la lista." };
    if (!data) return { ok: false, reason: "invalid_list", message: "Lista no encontrada." };
    return { ok: true, list: data };
  }

  const { data, error } = await admin
    .from("lead_lists")
    .select("id, name")
    .eq("owner_id", ownerId)
    .ilike("name", ilikeExact(listRef));
  if (error) return { ok: false, reason: "error", message: "No se pudo leer la lista." };
  const matches = (data ?? []).filter((row) => sameText(row.name, listRef));
  if (matches.length === 0) return { ok: false, reason: "invalid_list", message: "Lista no encontrada." };
  if (matches.length > 1) {
    return { ok: false, reason: "invalid_list", message: "Hay más de una lista con ese nombre. Pasá el id." };
  }
  return { ok: true, list: matches[0] };
}
