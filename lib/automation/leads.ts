// ⚠️ SERVICE ROLE — saltea RLS. Cada query de este archivo filtra por
// `owner_id` EXPLÍCITAMENTE (CLAUDE.md §4 y lib/supabase/admin.ts). Cualquier
// cambio acá se revisa a mano.

import { z } from "zod";

import { isSalesAngle } from "@/lib/leads/ai/angles";
import { editDistance } from "@/lib/leads/ai/style/diff";
import { passesMeetingGate, meetingGateMessage, recordLeadContact, type LeadsClient } from "@/lib/leads/contact";
import { normalizePhone } from "@/lib/leads/dedupe";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";
import { buildWhatsappLink } from "@/lib/leads/templates";
import type { Database } from "@/lib/supabase/database.types";

const leadStatusSchema = z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]);

/** "true"/"1"/"false"/"0" de un query param. Vacío = el default. */
const queryBool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => (value === undefined ? fallback : value === "true" || value === "1"));

export const listLeadsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((raw) =>
      (raw?.trim() ? raw : "NUEVO,LISTO")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(leadStatusSchema).min(1)),
  /** UUID del rubro, o su nombre (sin distinguir mayúsculas). */
  industry: z.string().trim().min(1).optional(),
  list: z.uuid().optional(),
  city: z.string().trim().min(1).optional(),
  uncontacted: queryBool(false),
  has_phone: queryBool(true),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

const LEAD_SELECT =
  "id, name, phone, status, city, sales_angle, interest_level, last_contacted_at, next_action_at, notes, instagram_url, website, created_at, industries(id, name), lead_lists(id, name)";

interface LeadRowForApi {
  id: string;
  name: string;
  phone: string | null;
  status: LeadStatus;
  city: string | null;
  sales_angle: Database["public"]["Enums"]["lead_sales_angle"] | null;
  interest_level: number | null;
  last_contacted_at: string | null;
  next_action_at: string | null;
  notes: string | null;
  instagram_url: string | null;
  website: string | null;
  created_at: string;
  industries: { id: string; name: string } | null;
  lead_lists: { id: string; name: string } | null;
}

/** snake_case de la base → camelCase de la respuesta (CLAUDE.md §5: se mapea en el borde). */
function toApiLead(row: LeadRowForApi) {
  const phoneE164 = normalizePhone(row.phone);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phoneE164,
    status: row.status,
    city: row.city,
    industry: row.industries ? { id: row.industries.id, name: row.industries.name } : null,
    list: row.lead_lists ? { id: row.lead_lists.id, name: row.lead_lists.name } : null,
    salesAngle: row.sales_angle,
    interestLevel: row.interest_level,
    lastContactedAt: row.last_contacted_at,
    nextActionAt: row.next_action_at,
    notes: row.notes,
    instagramUrl: row.instagram_url,
    website: row.website,
    createdAt: row.created_at,
  };
}

export type ApiLead = ReturnType<typeof toApiLead>;

/** Resuelve el filtro `industry` (UUID o nombre) a IDs de rubro del owner. */
async function resolveIndustryIds(admin: LeadsClient, ownerId: string, industry: string): Promise<string[]> {
  if (z.uuid().safeParse(industry).success) return [industry];
  const { data } = await admin.from("industries").select("id, name").eq("owner_id", ownerId);
  // Comparación en memoria (no `ilike`): el nombre puede traer `%` o `_`.
  const target = industry.trim().toLowerCase();
  return (data ?? []).filter((row) => row.name.trim().toLowerCase() === target).map((row) => row.id);
}

/**
 * Cola de leads para contactar. Los más viejos primero: es una cola, lo que
 * entró antes se trabaja antes.
 */
export async function listLeadsForAutomation(admin: LeadsClient, ownerId: string, query: ListLeadsQuery) {
  let q = admin
    .from("leads")
    .select(LEAD_SELECT, { count: "exact" })
    .eq("owner_id", ownerId)
    .in("status", query.status);

  if (query.industry) {
    const ids = await resolveIndustryIds(admin, ownerId, query.industry);
    if (ids.length === 0) return { leads: [] as ApiLead[], total: 0 };
    q = q.in("industry_id", ids);
  }
  if (query.list) q = q.eq("lead_list_id", query.list);
  if (query.city) q = q.eq("city", query.city);
  if (query.uncontacted) q = q.is("last_contacted_at", null);
  if (query.has_phone) q = q.not("phone", "is", null).neq("phone", "");

  const { data, error, count } = await q.order("created_at", { ascending: true }).limit(query.limit);
  if (error) throw error;
  return { leads: ((data ?? []) as unknown as LeadRowForApi[]).map(toApiLead), total: count ?? 0 };
}

const RECENT_LIMIT = 20;

/** Un lead con sus últimas actividades y mensajes. `null` si no existe o es de otro owner. */
export async function getLeadForAutomation(admin: LeadsClient, ownerId: string, leadId: string) {
  const { data: lead, error } = await admin
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return null;

  const [activities, messages] = await Promise.all([
    admin
      .from("lead_activities")
      .select("id, type, content, from_status, to_status, occurred_at")
      .eq("owner_id", ownerId)
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
    admin
      .from("lead_messages")
      .select("id, sender, channel, kind, content, confirmed, angle, variant, occurred_at")
      .eq("owner_id", ownerId)
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  if (activities.error) throw activities.error;
  if (messages.error) throw messages.error;

  return {
    lead: toApiLead(lead as unknown as LeadRowForApi),
    activities: (activities.data ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      content: a.content,
      fromStatus: a.from_status,
      toStatus: a.to_status,
      occurredAt: a.occurred_at,
    })),
    // Cronológico (más viejo primero), como el hilo de la ficha.
    messages: (messages.data ?? []).reverse().map((m) => ({
      id: m.id,
      sender: m.sender,
      channel: m.channel,
      kind: m.kind,
      content: m.content,
      confirmed: m.confirmed,
      angle: m.angle,
      variant: m.variant,
      occurredAt: m.occurred_at,
    })),
  };
}

export const contactBodySchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("WHATSAPP"),
  /** El mensaje que se mandó, tal cual. */
  content: z.string().trim().min(1).max(4000),
  /** Estado nuevo. Sin él: CONTACTADO si el lead estaba en NUEVO/LISTO; si ya estaba más adelante no se toca. */
  status: leadStatusSchema.optional(),
  next_action_at: z.iso.datetime({ offset: true }).optional(),
  /** Nota interna para el timeline (no es el mensaje). */
  note: z.string().trim().max(2000).optional(),
  /**
   * Si el mensaje salió de `POST .../opening-message`: el ángulo, la variante y
   * el texto que propuso la IA. Con esto el mensaje queda registrado igual que
   * "Confirmar y marcar como enviado" de la ficha (cuenta para el antisesgo de
   * ángulos, §1.19, y para el bucle de estilo si se editó, §1.20.1).
   */
  opening: z
    .object({
      angle: z.string().refine(isSalesAngle, "Ángulo inválido."),
      variant: z.number().int().min(1).max(9),
      generated_content: z.string().trim().min(1).max(600),
    })
    .optional(),
});

export type ContactBody = z.infer<typeof contactBodySchema>;

export type ContactResult =
  | { ok: true; leadId: string; previousStatus: LeadStatus; status: LeadStatus; lastContactedAt: string; messageId: string }
  | { ok: false; status: 404 | 409 | 500; message: string };

/**
 * "Le mandé este mensaje": deja el mensaje en la conversación (`lead_messages`,
 * VENDEDOR, confirmado — lo que el copiloto lee para el seguimiento) y
 * registra el contacto con el mismo núcleo que "Registré un WhatsApp" de la
 * ficha (`recordLeadContact`): actividad en el timeline, `last_contacted_at`,
 * estado y próxima acción.
 */
export async function recordAutomationContact(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  body: ContactBody,
): Promise<ContactResult> {
  const { data: lead } = await admin
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!lead) return { ok: false, status: 404, message: "Lead no encontrado." };

  // Mismo criterio que confirmLeadOpening: el default sólo avanza desde NUEVO/LISTO, nunca retrocede un lead.
  const advances = lead.status === "NUEVO" || lead.status === "LISTO";
  const targetStatus: LeadStatus | null = body.status ?? (advances ? "CONTACTADO" : null);

  if (targetStatus && targetStatus !== lead.status && !(await passesMeetingGate(admin, leadId, targetStatus, ownerId))) {
    return { ok: false, status: 409, message: meetingGateMessage(targetStatus) };
  }

  // Primer mensaje saliente confirmado → apertura; si ya hubo alguno, seguimiento.
  const { count: priorOutbound } = await admin
    .from("lead_messages")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("lead_id", leadId)
    .eq("sender", "VENDEDOR")
    .eq("confirmed", true);

  const now = new Date().toISOString();
  const aiColumns = body.opening
    ? {
        generated_by: "IA" as const,
        angle: body.opening.angle as Database["public"]["Enums"]["lead_sales_angle"],
        variant: body.opening.variant,
        // Sólo hay par de estilo si el humano cambió el texto (como styleColumns de la ficha).
        ...(body.opening.generated_content !== body.content
          ? {
              generated_content: body.opening.generated_content,
              edit_distance: editDistance(body.opening.generated_content, body.content),
            }
          : {}),
      }
    : {};

  const { data: message, error: messageError } = await admin
    .from("lead_messages")
    .insert({
      owner_id: ownerId,
      lead_id: leadId,
      sender: "VENDEDOR",
      channel: body.channel,
      content: body.content,
      kind: body.opening || !priorOutbound ? "APERTURA" : "SEGUIMIENTO",
      ...aiColumns,
      confirmed: true,
      confirmed_at: now,
      occurred_at: now,
    })
    .select("id")
    .single();
  if (messageError || !message) return { ok: false, status: 500, message: "No se pudo registrar el mensaje." };

  const result = await recordLeadContact(admin, ownerId, {
    leadId,
    currentStatus: lead.status,
    type: body.channel,
    content: body.note,
    newStatus: targetStatus,
    nextActionAt: body.next_action_at,
  });
  if (!result.ok) return { ok: false, status: 500, message: result.message };

  return {
    ok: true,
    leadId,
    previousStatus: lead.status,
    status: result.newStatus ?? lead.status,
    lastContactedAt: result.lastContactedAt,
    messageId: message.id,
  };
}

export const statusBodySchema = z.object({ status: leadStatusSchema });

/** Link `wa.me` con el mensaje ya cargado, o `null` si el lead no tiene teléfono usable. */
export function whatsappLinkFor(phone: string | null, message: string): string | null {
  const e164 = normalizePhone(phone);
  return e164 ? buildWhatsappLink(e164, message) : null;
}
