// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por el owner del webhook
// (CLAUDE.md §4). Cal.com avisa con POST firmado (X-Cal-Signature-256 =
// HMAC-SHA256 del body crudo). BOOKING_* trae los datos en `payload`;
// MEETING_ENDED los trae en la raíz (https://cal.com/docs/developing/guides/automation/webhooks).
//
// La reserva se guarda una vez por `uid`. Un reintento no duplica el turno ni
// baja un lead que ya pasó de la reunión.

import { z } from "zod";

import { looseFrom, isUniqueViolation, rowsOf, schemaMissing } from "@/lib/automation/crm-db";
import { INSTAGRAM_ACQUISITION_SOURCE, INSTAGRAM_LIST_NAME, normalizeInstagramHandle } from "@/lib/automation/instagram-intake";
import { forwardStatus } from "@/lib/automation/lead-progress";
import { asChats } from "@/lib/chats/db";
import { findLeadByInstagramHandle } from "@/lib/chats/lead-link";
import { normalizePhone } from "@/lib/leads/dedupe";
import type { LeadsClient } from "@/lib/leads/contact";
import type { LeadStatus } from "@/lib/leads/status";
import type { Json } from "@/lib/supabase/database.types";

const HANDLED = ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED", "MEETING_ENDED"] as const;
export type CalTrigger = (typeof HANDLED)[number];

const CAL_PROVIDER = "cal.com";
const CAL_LIST_NAME = "Cal.com";

export type CalBooking = {
  eventId: string;
  eventName: CalTrigger;
  uid: string;
  rescheduleUid: string | null;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  meetingUrl: string | null;
  notes: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
};

export type ParsedCal =
  | { kind: "ignore"; event: string }
  | { kind: "invalid"; reason: string }
  | { kind: "booking"; booking: CalBooking };

export type CalApplyResult =
  | { ok: true; duplicate: true }
  | {
      ok: true;
      duplicate: false;
      leadId: string;
      createdLead: boolean;
      appointmentId: string | null;
      status: LeadStatus;
    }
  | { ok: false; reason: "migration" | "error"; message: string };

const responseSchema = z.record(z.string(), z.unknown());

const bodySchema = z.looseObject({
  uid: z.string().optional(),
  rescheduleUid: z.string().nullish(),
  title: z.string().nullish(),
  eventTitle: z.string().nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  length: z.number().nullish(),
  additionalNotes: z.string().nullish(),
  description: z.string().nullish(),
  idempotencyKey: z.string().nullish(),
  location: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  responses: responseSchema.nullish(),
  customInputs: z.record(z.string(), z.unknown()).nullish(),
  videoCallData: z.looseObject({ url: z.string().nullish() }).nullish(),
  organizer: z.looseObject({ email: z.string().nullish(), name: z.string().nullish() }).nullish(),
  attendees: z
    .array(
      z.looseObject({
        email: z.string().nullish(),
        name: z.string().nullish(),
        phoneNumber: z.string().nullish(),
      }),
    )
    .nullish(),
});

function text(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function responseValue(bag: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!bag) return null;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, entry] of Object.entries(bag)) {
    if (!wanted.has(key.toLowerCase())) continue;
    if (typeof entry === "string") return text(entry, 200);
    if (entry && typeof entry === "object" && "value" in entry) {
      const value = (entry as { value?: unknown }).value;
      const direct = text(value, 200);
      if (direct) return direct;
      if (value && typeof value === "object" && "value" in value) {
        return text((value as { value?: unknown }).value, 200);
      }
    }
  }
  return null;
}

function bagValue(bag: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!bag) return null;
  for (const key of keys) {
    const found = text(bag[key], 120);
    if (found) return found;
  }
  return null;
}

function readInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function emailOf(value: string | null): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@") || /\s/.test(email)) return null;
  return email.slice(0, 160);
}

function clip(value: string | null, max: number): string | null {
  return value ? value.slice(0, max) : null;
}

/**
 * Arma la reserva a partir del JSON de Cal.com. Los triggers que no pedimos
 * se ignoran (200) para que Cal no reintente.
 */
export function parseCalWebhook(json: unknown, fallbackEventId: string): ParsedCal {
  const root = z.looseObject({ triggerEvent: z.string(), createdAt: z.string().optional(), payload: z.unknown().optional() }).safeParse(json);
  if (!root.success) return { kind: "invalid", reason: "Falta el evento." };
  const trigger = root.data.triggerEvent;
  if (!HANDLED.includes(trigger as CalTrigger)) return { kind: "ignore", event: trigger };

  const flat = trigger === "MEETING_ENDED";
  const source = flat ? json : root.data.payload;
  const body = bodySchema.safeParse(source);
  if (!body.success) return { kind: "invalid", reason: "La reserva no tiene la forma esperada." };
  const data = body.data;
  const uid = text(data.uid, 200);
  if (!uid) return { kind: "invalid", reason: "Falta el id de la reserva." };

  const startsAt = readInstant(data.startTime);
  if (trigger !== "BOOKING_CANCELLED" && !startsAt) return { kind: "invalid", reason: "Falta el horario." };
  let endsAt = readInstant(data.endTime);
  if (startsAt && (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt))) {
    const minutes = data.length && data.length > 0 ? data.length : 30;
    endsAt = new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();
  }

  const organizerEmail = emailOf(text(data.organizer?.email, 160));
  const guest =
    (data.attendees ?? []).find((attendee) => emailOf(text(attendee.email, 160)) !== organizerEmail) ??
    (data.attendees ?? [])[0] ??
    null;
  const responses = data.responses ?? null;
  const guestEmail = emailOf(text(guest?.email, 160)) ?? emailOf(responseValue(responses, ["email", "email_address"]));
  const email = guestEmail && guestEmail !== organizerEmail ? guestEmail : null;
  const name = text(guest?.name, 120) ?? responseValue(responses, ["name", "nombre"]);
  const phone =
    text(guest?.phoneNumber, 40) ??
    responseValue(responses, ["attendeePhoneNumber", "phone", "phoneNumber", "telefono", "whatsapp"]);
  const handle = normalizeInstagramHandle(
    responseValue(responses, ["instagram", "ig", "ig_username", "usuario", "usuario_instagram"]) ??
      bagValue(data.metadata, ["instagram", "ig", "ig_username"]) ??
      bagValue(data.customInputs ?? null, ["instagram", "ig", "ig_username"]),
  );

  const metadata = data.metadata ?? null;
  const utmSource = clip(bagValue(metadata, ["utm_source", "utmSource"]) ?? responseValue(responses, ["utm_source"]), 120);
  const utmCampaign = clip(bagValue(metadata, ["utm_campaign", "utmCampaign"]) ?? responseValue(responses, ["utm_campaign"]), 120);
  const meetingUrl =
    httpsUrl(data.videoCallData?.url) ?? httpsUrl(metadata?.videoCallUrl) ?? httpsUrl(data.location);
  const notes = text(data.additionalNotes, 2000) ?? text(data.description, 2000);
  const createdAt = root.data.createdAt ?? "";
  const eventId = data.idempotencyKey?.trim()
    ? `${trigger}:${data.idempotencyKey.trim()}`
    : `${trigger}:${uid}:${createdAt || fallbackEventId}`;

  return {
    kind: "booking",
    booking: {
      eventId,
      eventName: trigger as CalTrigger,
      uid,
      rescheduleUid: text(data.rescheduleUid, 200),
      title: text(data.title, 120) ?? text(data.eventTitle, 120) ?? "Reunión",
      startsAt,
      endsAt,
      meetingUrl,
      notes,
      name,
      email,
      phone,
      handle,
      utmSource,
      utmCampaign,
    },
  };
}

type LeadHit = {
  id: string;
  status: LeadStatus;
  email: string | null;
  phone: string | null;
  instagram_url: string | null;
  acquisition_source: string | null;
  intake: Json | null;
  lead_list_id: string | null;
};

const LEAD_COLUMNS = "id, status, email, phone, instagram_url, acquisition_source, intake, lead_list_id, created_at";

function asLead(row: Record<string, unknown> | null): LeadHit | null {
  if (!row || typeof row.id !== "string" || typeof row.status !== "string") return null;
  return {
    id: row.id,
    status: row.status as LeadStatus,
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    instagram_url: typeof row.instagram_url === "string" ? row.instagram_url : null,
    acquisition_source: typeof row.acquisition_source === "string" ? row.acquisition_source : null,
    intake: (row.intake ?? null) as Json | null,
    lead_list_id: typeof row.lead_list_id === "string" ? row.lead_list_id : null,
  };
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function samePhone(stored: string | null, incoming: string | null): boolean {
  const left = normalizePhone(stored);
  const right = normalizePhone(incoming);
  if (left && right && left === right) return true;
  const a = (stored ?? "").replace(/\D/g, "");
  const b = (incoming ?? "").replace(/\D/g, "");
  return a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
}

async function firstLead(db: LeadsClient, ownerId: string, column: string, value: string): Promise<LeadHit | null> {
  const { data, error } = await db
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("owner_id", ownerId)
    .ilike(column, likeExact(value))
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) return null;
  return asLead((data?.[0] ?? null) as unknown as Record<string, unknown> | null);
}

async function matchLead(db: LeadsClient, ownerId: string, booking: CalBooking): Promise<LeadHit | null> {
  if (booking.handle) {
    const id = await findLeadByInstagramHandle(asChats(db), ownerId, booking.handle);
    if (id) {
      const { data } = await db.from("leads").select(LEAD_COLUMNS).eq("id", id).eq("owner_id", ownerId).maybeSingle();
      const lead = asLead(data as unknown as Record<string, unknown> | null);
      if (lead) return lead;
    }
  }
  if (booking.email) {
    const byEmail = await firstLead(db, ownerId, "email", booking.email);
    if (byEmail) return byEmail;
  }
  if (booking.phone && normalizePhone(booking.phone)) {
    const tail = booking.phone.replace(/\D/g, "").slice(-8);
    const { data } = await db.from("leads").select(LEAD_COLUMNS).eq("owner_id", ownerId).ilike("phone", `%${tail}`).limit(30);
    const hit = (data ?? [])
      .map((row) => asLead(row as unknown as Record<string, unknown>))
      .filter((row): row is LeadHit => row !== null)
      .find((row) => samePhone(row.phone, booking.phone));
    if (hit) return hit;
  }
  if (booking.name && booking.name.trim().length >= 3) {
    return firstLead(db, ownerId, "name", booking.name.trim());
  }
  return null;
}

async function ensureList(db: LeadsClient, ownerId: string, name: string, source: "INSTAGRAM" | "MANUAL"): Promise<string | null> {
  const { data, error } = await db.from("lead_lists").select("id").eq("owner_id", ownerId).eq("name", name).order("created_at", { ascending: true }).limit(1);
  if (error) return null;
  if (data?.[0]) return data[0].id;
  const created = await db
    .from("lead_lists")
    .insert({ owner_id: ownerId, name, source, status: "COMPLETADO", lead_count: 0 })
    .select("id")
    .single();
  if (created.error || !created.data) return null;
  return created.data.id;
}

function withUtm(intake: Json | null, booking: CalBooking): Json | null {
  if (!booking.utmSource && !booking.utmCampaign) return intake;
  const base = intake && typeof intake === "object" && !Array.isArray(intake) ? { ...intake } : {};
  const previous = base.utm && typeof base.utm === "object" && !Array.isArray(base.utm) ? base.utm : {};
  return {
    ...base,
    utm: {
      ...previous,
      ...(booking.utmSource ? { source: booking.utmSource } : {}),
      ...(booking.utmCampaign ? { campaign: booking.utmCampaign } : {}),
    },
  } as Json;
}

async function createLead(db: LeadsClient, ownerId: string, booking: CalBooking): Promise<{ ok: true; lead: LeadHit; created: boolean } | { ok: false; message: string }> {
  const phone = normalizePhone(booking.phone);
  const dedupeKey = booking.handle
    ? `instagram:${booking.handle}`
    : booking.email
      ? `email:${booking.email}`
      : phone
        ? `phone:${phone}`
        : `cal:${booking.uid}`;
  const listName = booking.handle ? INSTAGRAM_LIST_NAME : CAL_LIST_NAME;
  const list = await ensureList(db, ownerId, listName, booking.handle ? "INSTAGRAM" : "MANUAL");
  if (!list) return { ok: false, message: "No se pudo preparar la lista." };

  const inserted = await db
    .from("leads")
    .insert({
      owner_id: ownerId,
      name: booking.name ?? (booking.handle ? `@${booking.handle}` : "Reserva Cal.com"),
      email: booking.email,
      phone,
      instagram_url: booking.handle ? `https://instagram.com/${booking.handle}` : null,
      acquisition_source: booking.handle ? INSTAGRAM_ACQUISITION_SOURCE : null,
      lead_list_id: list,
      status: "NUEVO",
      dedupe_key: dedupeKey,
      intake: withUtm(null, booking),
    })
    .select(LEAD_COLUMNS)
    .single();
  if (inserted.error?.code === "23505") {
    const { data } = await db.from("leads").select(LEAD_COLUMNS).eq("owner_id", ownerId).eq("dedupe_key", dedupeKey).maybeSingle();
    const lead = asLead(data as unknown as Record<string, unknown> | null);
    if (lead) return { ok: true, lead, created: false };
  }
  if (inserted.error || !inserted.data) return { ok: false, message: "No se pudo crear el lead." };
  const lead = asLead(inserted.data as unknown as Record<string, unknown>);
  if (!lead) return { ok: false, message: "No se pudo leer el lead creado." };
  return { ok: true, lead, created: true };
}

async function enrichLead(db: LeadsClient, ownerId: string, lead: LeadHit, booking: CalBooking): Promise<LeadHit> {
  const patch: { email?: string; phone?: string; instagram_url?: string; acquisition_source?: string; intake?: Json } = {};
  if (!lead.email && booking.email) patch.email = booking.email;
  const phone = normalizePhone(booking.phone);
  if (!lead.phone && phone) patch.phone = phone;
  if (!lead.instagram_url && booking.handle) patch.instagram_url = `https://instagram.com/${booking.handle}`;
  if (!lead.acquisition_source && booking.handle) patch.acquisition_source = INSTAGRAM_ACQUISITION_SOURCE;
  const intake = withUtm(lead.intake, booking);
  if (intake && JSON.stringify(intake) !== JSON.stringify(lead.intake)) patch.intake = intake;
  if (Object.keys(patch).length === 0) return lead;
  const { error } = await db.from("leads").update(patch).eq("id", lead.id).eq("owner_id", ownerId);
  if (error) return lead;
  return { ...lead, ...patch, intake: patch.intake ?? lead.intake };
}

type AppointmentHit = {
  id: string;
  status: string;
  lead_id: string | null;
  starts_at: string;
  ends_at: string;
  external_uid: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
};

function asAppointment(row: Record<string, unknown>): AppointmentHit | null {
  if (typeof row.id !== "string" || typeof row.starts_at !== "string" || typeof row.ends_at !== "string") return null;
  return {
    id: row.id,
    status: typeof row.status === "string" ? row.status : "AGENDADA",
    lead_id: typeof row.lead_id === "string" ? row.lead_id : null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    external_uid: typeof row.external_uid === "string" ? row.external_uid : null,
    utm_source: typeof row.utm_source === "string" ? row.utm_source : null,
    utm_campaign: typeof row.utm_campaign === "string" ? row.utm_campaign : null,
  };
}

async function findAppointment(db: LeadsClient, ownerId: string, uids: string[]): Promise<{ hit: AppointmentHit | null; missing: boolean }> {
  const { rows, error } = await rowsOf(
    looseFrom(db, "appointments")
      .select("id, status, lead_id, starts_at, ends_at, external_uid, utm_source, utm_campaign")
      .eq("owner_id", ownerId)
      .eq("external_provider", CAL_PROVIDER)
      .in("external_uid", uids)
      .limit(5),
  );
  if (error) return { hit: null, missing: schemaMissing(error) };
  const hits = rows.map(asAppointment).filter((row): row is AppointmentHit => row !== null);
  const preferred = hits.find((row) => row.external_uid === uids[0]) ?? hits[0] ?? null;
  return { hit: preferred, missing: false };
}

function appointmentStatus(trigger: CalTrigger, current: string | null): "AGENDADA" | "REALIZADA" | "CANCELADA" {
  if (trigger === "BOOKING_CANCELLED") return "CANCELADA";
  if (trigger === "MEETING_ENDED") return "REALIZADA";
  if (current === "REALIZADA") return "REALIZADA";
  return "AGENDADA";
}

function leadTarget(trigger: CalTrigger): LeadStatus | null {
  if (trigger === "MEETING_ENDED") return "REUNION_REALIZADA";
  if (trigger === "BOOKING_CANCELLED") return null;
  return "REUNION_AGENDADA";
}

async function saveAppointment(
  db: LeadsClient,
  ownerId: string,
  leadId: string,
  booking: CalBooking,
  existing: AppointmentHit | null,
): Promise<{ ok: true; id: string; status: string } | { ok: false; reason: "migration" | "error"; message: string }> {
  const startsAt = booking.startsAt ?? existing?.starts_at ?? null;
  const endsAt = booking.endsAt ?? existing?.ends_at ?? null;
  if (!startsAt || !endsAt) return { ok: true, id: existing?.id ?? "", status: existing?.status ?? "CANCELADA" };
  const status = appointmentStatus(booking.eventName, existing?.status ?? null);
  const row: Record<string, unknown> = {
    lead_id: leadId,
    title: booking.title,
    notes: booking.notes,
    meeting_url: booking.meetingUrl,
    starts_at: startsAt,
    ends_at: endsAt,
    status,
    external_provider: CAL_PROVIDER,
    external_uid: booking.uid,
    utm_source: booking.utmSource ?? existing?.utm_source ?? null,
    utm_campaign: booking.utmCampaign ?? existing?.utm_campaign ?? null,
  };
  if (existing) {
    const { error } = await looseFrom(db, "appointments").update(row).eq("id", existing.id).eq("owner_id", ownerId);
    if (error) {
      return schemaMissing(error)
        ? { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." }
        : { ok: false, reason: "error", message: "No se pudo actualizar la reserva." };
    }
    return { ok: true, id: existing.id, status };
  }
  const result = await looseFrom(db, "appointments").insert({ ...row, owner_id: ownerId }).select("id");
  if (isUniqueViolation(result.error)) {
    const again = await findAppointment(db, ownerId, [booking.uid]);
    if (again.hit) return { ok: true, id: again.hit.id, status };
  }
  if (result.error || !result.data?.[0] || typeof result.data[0].id !== "string") {
    return schemaMissing(result.error)
      ? { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." }
      : { ok: false, reason: "error", message: "No se pudo guardar la reserva." };
  }
  return { ok: true, id: result.data[0].id, status };
}

async function noteLead(
  db: LeadsClient,
  ownerId: string,
  lead: LeadHit,
  booking: CalBooking,
  appointmentStatusValue: string,
): Promise<{ ok: true; status: LeadStatus } | { ok: false; message: string }> {
  const target = leadTarget(booking.eventName);
  const next = target ? forwardStatus(lead.status, target) : null;
  if (next) {
    const { error } = await db.from("leads").update({ status: next }).eq("id", lead.id).eq("owner_id", ownerId);
    if (error) return { ok: false, message: "No se pudo cambiar el estado del lead." };
  }
  const content =
    booking.eventName === "BOOKING_CANCELLED"
      ? `Reserva cancelada: ${booking.title}`
      : booking.eventName === "BOOKING_RESCHEDULED"
        ? `Reunión reprogramada: ${booking.title}`
        : booking.eventName === "MEETING_ENDED"
          ? `Reunión realizada: ${booking.title}`
          : `Reunión agendada: ${booking.title}`;
  const { error } = await db.from("lead_activities").insert({
    owner_id: ownerId,
    lead_id: lead.id,
    type: booking.eventName === "BOOKING_CANCELLED" ? "NOTA" : "REUNION",
    content,
    from_status: next ? lead.status : null,
    to_status: next,
  });
  if (error) return { ok: false, message: "No se pudo anotar la reserva." };
  void appointmentStatusValue;
  return { ok: true, status: next ?? lead.status };
}

async function claim(db: LeadsClient, ownerId: string, booking: CalBooking): Promise<"claimed" | "duplicate" | "migration" | "error"> {
  const { error } = await looseFrom(db, "webhook_deliveries").insert({
    owner_id: ownerId,
    provider: "cal",
    event_id: booking.eventId,
    event_name: booking.eventName,
  });
  if (!error) return "claimed";
  if (isUniqueViolation(error)) return "duplicate";
  if (schemaMissing(error)) return "migration";
  return "error";
}

async function release(db: LeadsClient, ownerId: string, eventId: string): Promise<void> {
  await looseFrom(db, "webhook_deliveries").delete().eq("owner_id", ownerId).eq("provider", "cal").eq("event_id", eventId);
}

export async function applyCalBooking(db: LeadsClient, ownerId: string, booking: CalBooking): Promise<CalApplyResult> {
  const claimed = await claim(db, ownerId, booking);
  if (claimed === "duplicate") return { ok: true, duplicate: true };
  if (claimed === "migration") return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
  if (claimed === "error") return { ok: false, reason: "error", message: "No se pudo registrar la entrega." };

  try {
    const found = await matchLead(db, ownerId, booking);
    const ensured = found ? { ok: true as const, lead: await enrichLead(db, ownerId, found, booking), created: false } : await createLead(db, ownerId, booking);
    if (!ensured.ok) {
      await release(db, ownerId, booking.eventId);
      return { ok: false, reason: "error", message: ensured.message };
    }

    const uids = [booking.uid, booking.rescheduleUid].filter((uid): uid is string => Boolean(uid));
    const existing = await findAppointment(db, ownerId, uids);
    if (existing.missing) {
      await release(db, ownerId, booking.eventId);
      return { ok: false, reason: "migration", message: "Falta aplicar la migración de webhooks." };
    }
    const saved = await saveAppointment(db, ownerId, ensured.lead.id, booking, existing.hit);
    if (!saved.ok) {
      await release(db, ownerId, booking.eventId);
      return saved;
    }
    const noted = await noteLead(db, ownerId, ensured.lead, booking, saved.status);
    if (!noted.ok) {
      await release(db, ownerId, booking.eventId);
      return { ok: false, reason: "error", message: noted.message };
    }
    return {
      ok: true,
      duplicate: false,
      leadId: ensured.lead.id,
      createdLead: ensured.created,
      appointmentId: saved.id || null,
      status: noted.status,
    };
  } catch (error) {
    await release(db, ownerId, booking.eventId);
    console.error("cal webhook: falló la reserva", error instanceof Error ? error.name : "error");
    return { ok: false, reason: "error", message: "No se pudo procesar la reserva." };
  }
}
