"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reconcileScrapeJob } from "@/lib/apify/reconcile";
import { startApifyRun } from "@/lib/apify/client";
import { decrypt } from "@/lib/crypto";
import type { AppointmentStatus } from "@/lib/leads/appointments";
import { computeDedupeKey } from "@/lib/leads/dedupe";
import { buildIcsCalendar } from "@/lib/leads/ics";
import { type CommandPaletteResults, listAppointmentsForIcs, searchCommandPalette } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import { mapCsvRow, parseCsv } from "@/lib/providers/csv";
import { getProvider } from "@/lib/providers/registry";
import type { LeadSource } from "@/lib/providers/types";
import { APIFY_KEY_SETTING, actorOverrideKey } from "@/lib/settings/constants";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ActionState = { ok: boolean; message: string } | null;
export type GenerateState = { ok: true; jobId: string } | { ok: false; message: string } | null;

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

const baseSchema = z.object({
  source: z.string().trim().min(1, "Elegí una fuente."),
  name: z.string().trim().min(2, "Ponele un nombre a la lista.").max(80, "Nombre muy largo."),
  industryId: z.string().trim().uuid().optional().or(z.literal("")),
});

/**
 * Apify valida el requestUrl del webhook contra su propio servidor y
 * rechaza la corrida entera (400) si apunta a localhost — no es que el aviso
 * simplemente no llegue. Por eso en desarrollo no se registra webhook: la
 * importación entra sólo por la reconciliación (CLAUDE.md gotchas).
 */
function buildWebhookUrl(jobId: string, secret: string): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(appUrl)) return undefined;
  return `${appUrl}/api/apify/webhook?jobId=${jobId}&secret=${secret}`;
}

/**
 * No puede haber dos listas con el mismo nombre (ignorando mayúsculas/espacios).
 * Se compara en memoria en vez de con `ilike` porque el nombre puede traer
 * `%` o `_`, que `ilike` interpreta como comodines.
 */
async function isDuplicateListName(name: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("lead_lists").select("id, name");
  const target = name.trim().toLowerCase();
  return (data ?? []).some((row) => row.id !== excludeId && row.name.trim().toLowerCase() === target);
}

/**
 * Lanza una generación de leads vía Apify (Google Maps, Instagram, LinkedIn).
 * Plan §1.2, paso 2: crea lead_lists(PENDIENTE) + scrape_jobs, descifra el
 * token y arranca la corrida con el webhook ya registrado.
 */
export async function generateLeadList(
  _prevState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const user = await requireUser();

  const base = baseSchema.safeParse({
    source: formData.get("source"),
    name: formData.get("name"),
    industryId: formData.get("industryId") || undefined,
  });
  if (!base.success) {
    return { ok: false, message: base.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const provider = getProvider(base.data.source as LeadSource);
  if (!provider) {
    return { ok: false, message: "Fuente desconocida." };
  }

  const criteriaInput = Object.fromEntries(provider.fields.map((field) => [field.name, formData.get(field.name)]));
  const criteria = provider.criteriaSchema.safeParse(criteriaInput);
  if (!criteria.success) {
    return { ok: false, message: criteria.error.issues[0]?.message ?? "Revisá los criterios." };
  }

  const supabase = await createClient();

  const { data: keyRow } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", APIFY_KEY_SETTING)
    .maybeSingle();
  if (!keyRow) {
    return { ok: false, message: "Cargá tu API key de Apify en Configuración antes de generar una lista." };
  }

  let token: string;
  try {
    token = decrypt(keyRow.value_encrypted);
  } catch {
    return { ok: false, message: "La API key guardada no se pudo leer. Volvé a cargarla en Configuración." };
  }

  const { data: actorRow } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", actorOverrideKey(provider.id))
    .maybeSingle();
  const actorId = actorRow ? decrypt(actorRow.value_encrypted) : provider.defaultActorId;
  if (!actorId) {
    return { ok: false, message: `Configurá el actor de Apify para ${provider.label} en Configuración.` };
  }

  if (await isDuplicateListName(base.data.name)) {
    return { ok: false, message: "Ya existe una lista con ese nombre." };
  }

  const input = provider.buildInput(criteria.data);

  const { data: list, error: listError } = await supabase
    .from("lead_lists")
    .insert({
      owner_id: user.id,
      name: base.data.name,
      source: provider.id,
      criteria: criteria.data as unknown as Json,
      status: "PENDIENTE",
      industry_id: base.data.industryId || null,
    })
    .select("id")
    .single();
  if (listError || !list) {
    return { ok: false, message: "No se pudo crear la lista." };
  }

  const webhookSecret = randomBytes(24).toString("hex");

  const { data: job, error: jobError } = await supabase
    .from("scrape_jobs")
    .insert({
      owner_id: user.id,
      lead_list_id: list.id,
      provider: provider.id,
      actor_id: actorId,
      input: input as unknown as Json,
      webhook_secret: webhookSecret,
      status: "PENDIENTE",
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return { ok: false, message: "No se pudo crear el trabajo de importación." };
  }

  const webhookUrl = buildWebhookUrl(job.id, webhookSecret);

  try {
    const run = await startApifyRun({ token, actorId, input, webhookUrl });
    await supabase
      .from("scrape_jobs")
      .update({
        apify_run_id: run.id,
        apify_dataset_id: run.defaultDatasetId,
        status: "EN_CURSO",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await supabase.from("lead_lists").update({ status: "EN_CURSO" }).eq("id", list.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    await supabase.from("scrape_jobs").update({ status: "FALLIDO", error: message }).eq("id", job.id);
    await supabase.from("lead_lists").update({ status: "FALLIDO" }).eq("id", list.id);
    return { ok: false, message: `Apify rechazó la corrida: ${message}` };
  }

  revalidatePath("/leads/generar");
  return { ok: true, jobId: job.id };
}

/**
 * Reconciliación manual disparada desde la UI ("chequeo al abrir la
 * pantalla", Plan §1.2 paso 5) — necesaria en desarrollo porque Apify no
 * puede alcanzar localhost y el webhook nunca llega.
 *
 * El chequeo de pertenencia pasa por el cliente con RLS antes de delegar en
 * el reconciliador (que usa el cliente admin): así no se puede reconciliar el
 * job de otro usuario adivinando el id.
 */
export async function reconcileJob(jobId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: job } = await supabase.from("scrape_jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return;

  await reconcileScrapeJob(jobId);
  revalidatePath("/leads/generar");
}

const csvSchema = z.object({
  name: z.string().trim().min(2, "Ponele un nombre a la lista.").max(80, "Nombre muy largo."),
  content: z.string().min(1, "El archivo está vacío."),
  industryId: z.string().trim().uuid().optional().or(z.literal("")),
});

/**
 * CSV/manual: sin Apify de por medio, así que no hay scrape_job — se importa
 * en el mismo request. Misma deduplicación que el resto (owner_id+dedupe_key).
 */
export async function importCsvLeads(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const file = formData.get("file");
  const content = file instanceof File ? await file.text() : "";

  const parsed = csvSchema.safeParse({
    name: formData.get("name"),
    content,
    industryId: formData.get("industryId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const industryId = parsed.data.industryId || null;

  const rows = parseCsv(parsed.data.content);
  const leads = new Map<string, LeadInsert>();
  for (const row of rows) {
    const normalized = mapCsvRow(row);
    if (!normalized) continue;
    const dedupeKey = computeDedupeKey(normalized);
    leads.set(dedupeKey, {
      owner_id: user.id,
      name: normalized.name,
      phone: normalized.phone ?? null,
      email: normalized.email ?? null,
      website: normalized.website ?? null,
      address: normalized.address ?? null,
      city: normalized.city ?? null,
      region: normalized.region ?? null,
      country: normalized.country ?? null,
      industry_id: industryId,
      raw: normalized.raw as Json,
      dedupe_key: dedupeKey,
    });
  }

  if (leads.size === 0) {
    return { ok: false, message: "No se encontró ninguna fila con al menos un nombre." };
  }

  if (await isDuplicateListName(parsed.data.name)) {
    return { ok: false, message: "Ya existe una lista con ese nombre." };
  }

  const supabase = await createClient();

  // Igual que en la reconciliación de Apify: cuántos de estos dedupe_key ya
  // existían antes de este import, para reportar los realmente nuevos.
  const dedupeKeys = [...leads.keys()];
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("dedupe_key")
    .in("dedupe_key", dedupeKeys);
  const existingKeys = new Set((existingLeads ?? []).map((row) => row.dedupe_key));
  const newCount = dedupeKeys.filter((key) => !existingKeys.has(key)).length;

  const { data: list, error: listError } = await supabase
    .from("lead_lists")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      source: "CSV",
      status: "COMPLETADO",
      lead_count: leads.size,
      industry_id: industryId,
    })
    .select("id")
    .single();
  if (listError || !list) {
    return { ok: false, message: "No se pudo crear la lista." };
  }

  const { error: upsertError } = await supabase
    .from("leads")
    .upsert(
      [...leads.values()].map((lead) => ({ ...lead, lead_list_id: list.id })),
      { onConflict: "owner_id,dedupe_key" },
    );
  if (upsertError) {
    return { ok: false, message: `No se pudo importar: ${upsertError.message}` };
  }

  revalidatePath("/leads/generar");
  const existingCount = leads.size - newCount;
  const suffix = existingCount > 0 ? ` (${existingCount} ya existían y se actualizaron)` : "";
  return { ok: true, message: `Se importaron ${newCount} leads nuevos${suffix}.` };
}

// ── Listas manuales, vacías o con un lead (Plan §1.21) ──────────────────────

/**
 * Una lista sin proveedor de por medio (`source: 'MANUAL'`, en el enum desde
 * la migración inicial): "Nueva lista" vacía, o la que arma al vuelo el alta
 * manual de un lead cuando no hay una que sirva. `lead_count` queda en 0 a
 * propósito — la UI nunca lo lee para mostrar el conteo (usa el join
 * `leads(count)` de `listLeadListsOverview`, que si se ajusta al borrar), así
 * que no hace falta pisarlo cuando el primer lead entra un instante después.
 */
async function createManualList(
  userId: string,
  name: string,
  industryId: string | null,
): Promise<{ id: string } | { error: string }> {
  if (await isDuplicateListName(name)) {
    return { error: "Ya existe una lista con ese nombre." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_lists")
    .insert({ owner_id: userId, name, source: "MANUAL", status: "COMPLETADO", lead_count: 0, industry_id: industryId })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la lista." };
  return { id: data.id };
}

const emptyListSchema = z.object({
  name: z.string().trim().min(2, "Ponele un nombre a la lista.").max(80, "Nombre muy largo."),
  industryId: z.string().trim().uuid().optional().or(z.literal("")),
});

/** "Nueva lista" de `/leads/lista`: una lista manual vacía, sin scraping ni CSV, para ir cargándole leads uno por uno. */
export async function createEmptyLeadList(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = emptyListSchema.safeParse({
    name: formData.get("name"),
    industryId: formData.get("industryId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const result = await createManualList(user.id, parsed.data.name, parsed.data.industryId || null);
  if ("error" in result) return { ok: false, message: result.error };

  revalidatePath("/leads/lista");
  return { ok: true, message: "Lista creada." };
}

// ── Alta manual de un lead (Plan §1.21) ─────────────────────────────────────

export type CreateLeadState = { ok: true; leadId: string } | { ok: false; message: string } | null;

const manualLeadSchema = z.object({
  name: z.string().trim().min(2, "Ponele un nombre al lead.").max(120, "Nombre muy largo."),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  industryId: z.string().trim().uuid().optional().or(z.literal("")),
  leadListId: z.string().trim().uuid().optional().or(z.literal("")),
  newListName: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.string().refine((value): value is LeadStatus => (LEAD_STATUSES as string[]).includes(value), "Estado inválido."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Un lead contactado por fuera de la app (mensaje directo, referido, etc.) y
 * cargado a mano para que entre al mismo seguimiento que uno scrapeado — no
 * hay proveedor de por medio, así que no crea `scrape_job`. La lista es
 * obligatoria: un lead "suelto" no tenía ninguna pantalla que lo mostrara
 * después de crearlo (`/leads/lista/[id]` es por lista), así que si no hay
 * una que sirva, esta misma acción crea una (`source: 'MANUAL'`, ya
 * contemplado en el enum desde la migración inicial) con sólo un nombre.
 * Misma deduplicación que el resto (`owner_id` + `dedupe_key`, CLAUDE.md §4),
 * pero acá un choque no se pisa en silencio como en la importación por
 * lotes: es un solo lead cargado a propósito, así que se avisa en vez de
 * sobreescribir.
 */
export async function createLeadManually(_prevState: CreateLeadState, formData: FormData): Promise<CreateLeadState> {
  const user = await requireUser();

  const parsed = manualLeadSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    website: formData.get("website") || undefined,
    city: formData.get("city") || undefined,
    industryId: formData.get("industryId") || undefined,
    leadListId: formData.get("leadListId") || undefined,
    newListName: formData.get("newListName") || undefined,
    status: formData.get("status"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!parsed.data.leadListId && !parsed.data.newListName) {
    return { ok: false, message: "Elegí una lista o creá una nueva." };
  }

  const phone = parsed.data.phone || null;
  const email = parsed.data.email || null;
  const website = parsed.data.website || null;
  const city = parsed.data.city || null;
  const industryId = parsed.data.industryId || null;
  const notes = parsed.data.notes || null;

  const dedupeKey = computeDedupeKey({ name: parsed.data.name, phone, website, city, raw: null });

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("leads")
    .select("id, name")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      message: `Ya hay un lead con ese teléfono o sitio: "${existing.name}". Buscalo en Listas en vez de cargarlo de nuevo.`,
    };
  }

  let leadListId = parsed.data.leadListId || null;
  if (!leadListId) {
    // Validado arriba: sin leadListId, newListName no puede estar vacío.
    const result = await createManualList(user.id, parsed.data.newListName as string, industryId);
    if ("error" in result) return { ok: false, message: result.error };
    leadListId = result.id;
  }

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      phone,
      email,
      website,
      city,
      industry_id: industryId,
      lead_list_id: leadListId,
      status: parsed.data.status,
      notes,
      dedupe_key: dedupeKey,
      last_contacted_at: parsed.data.status === "NUEVO" ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, message: "No se pudo cargar el lead." };
  }

  if (parsed.data.status !== "NUEVO") {
    await supabase.from("lead_activities").insert({
      owner_id: user.id,
      lead_id: inserted.id,
      type: "CAMBIO_ESTADO",
      from_status: "NUEVO",
      to_status: parsed.data.status,
    });
  }

  // Misma regla que `updateLeadNotes`: la nota deja rastro en el timeline.
  // Necesario acá porque, a diferencia de ese formulario, ésta es la
  // primera vez que la nota existe — no hay un "antes" con el que compararla.
  if (notes) {
    await supabase.from("lead_activities").insert({
      owner_id: user.id,
      lead_id: inserted.id,
      type: "NOTA",
      content: notes,
    });
  }

  revalidatePath("/leads/lista");
  revalidatePath("/leads");
  revalidatePath("/leads/seguimiento");
  return { ok: true, leadId: inserted.id };
}

// ── Previsualización de listas (Plan §1.3) ──────────────────────────────────

const renameListSchema = z.object({
  id: z.string().trim().uuid(),
  name: z.string().trim().min(2, "Ponele un nombre a la lista.").max(80, "Nombre muy largo."),
});

/** Renombrar desde la previsualización de /leads/lista. */
export async function renameLeadList(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();

  const parsed = renameListSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (await isDuplicateListName(parsed.data.name, parsed.data.id)) {
    return { ok: false, message: "Ya existe una lista con ese nombre." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lead_lists").update({ name: parsed.data.name }).eq("id", parsed.data.id);
  if (error) {
    return { ok: false, message: "No se pudo renombrar la lista." };
  }

  revalidatePath("/leads/lista");
  return { ok: true, message: "Lista renombrada." };
}

const deleteListSchema = z.object({ id: z.string().trim().uuid() });

/**
 * Borra la lista y, con ella, sus leads (pedido explícito: una lista vacía no
 * deja huérfanos). `lead_activities` cae en cascada por FK; los turnos
 * agendados sólo pierden la referencia al lead (`on delete set null`), no se
 * borran — la reunión ya sucedió o está agendada independientemente de la lista.
 */
export async function deleteLeadList(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();

  const parsed = deleteListSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, message: "Lista inválida." };
  }

  const supabase = await createClient();
  const { data: list } = await supabase.from("lead_lists").select("id").eq("id", parsed.data.id).maybeSingle();
  if (!list) {
    return { ok: false, message: "La lista no existe." };
  }

  const { error: leadsError } = await supabase.from("leads").delete().eq("lead_list_id", parsed.data.id);
  if (leadsError) {
    return { ok: false, message: "No se pudieron borrar los leads de la lista." };
  }

  const { error: listError } = await supabase.from("lead_lists").delete().eq("id", parsed.data.id);
  if (listError) {
    return { ok: false, message: "No se pudo borrar la lista." };
  }

  revalidatePath("/leads/lista");
  return { ok: true, message: "Lista eliminada." };
}

// ── Lista de leads y seguimiento (Plan §1.3) ────────────────────────────────

/**
 * REUNION_AGENDADA y REUNION_REALIZADA sólo los pone la agenda
 * (stage-engine.ts, Plan §1.5): un cambio manual a uno de estos dos sin un
 * turno real cargado en `appointments` dejaría el pipeline (y el dashboard)
 * contando reuniones que no existen.
 */
const MEETING_STATUS_GATE: Partial<Record<LeadStatus, AppointmentStatus[]>> = {
  REUNION_AGENDADA: ["AGENDADA", "CONFIRMADA", "REALIZADA"],
  REUNION_REALIZADA: ["REALIZADA"],
};

function meetingGateMessage(status: LeadStatus): string {
  return status === "REUNION_REALIZADA"
    ? "No se puede marcar como reunión realizada: este lead no tiene ningún turno marcado como Realizada en la agenda. Andá a Agenda → Lista, marcá el turno como Realizada y el lead avanza solo."
    : "No se puede pasar a reunión agendada: este lead no tiene ningún turno cargado en la agenda. Agendalo primero desde la ficha del lead.";
}

/** IDs de `leadIds` con al menos un turno en `appointments` cuyo estado está en `statuses`. */
async function leadIdsWithAppointment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadIds: string[],
  statuses: AppointmentStatus[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const { data } = await supabase.from("appointments").select("lead_id").in("lead_id", leadIds).in("status", statuses);
  return new Set((data ?? []).map((row) => row.lead_id).filter((id): id is string => id !== null));
}

/**
 * Cambio de estado inline (tabla y kanban). Cada cambio queda registrado en
 * `lead_activities` solo, sin que quien lo hace se acuerde de anotarlo
 * (CLAUDE.md §1.3 / Plan §1.1). Bloquea el paso a reunión agendada/realizada
 * sin un turno real (ver `MEETING_STATUS_GATE`).
 */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: current } = await supabase.from("leads").select("status").eq("id", leadId).maybeSingle();
  if (!current) return { ok: false, message: "No se encontró el lead." };
  if (current.status === status) return { ok: true, message: "" };

  const requiredStatuses = MEETING_STATUS_GATE[status];
  if (requiredStatuses) {
    const withAppointment = await leadIdsWithAppointment(supabase, [leadId], requiredStatuses);
    if (!withAppointment.has(leadId)) {
      return { ok: false, message: meetingGateMessage(status) };
    }
  }

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) return { ok: false, message: "No se pudo cambiar el estado." };

  await supabase.from("lead_activities").insert({
    owner_id: user.id,
    lead_id: leadId,
    type: "CAMBIO_ESTADO",
    from_status: current.status,
    to_status: status,
  });

  revalidatePath("/leads/lista");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Estado actualizado." };
}

export async function bulkAssignIndustry(leadIds: string[], industryId: string | null) {
  if (leadIds.length === 0) return;
  await requireUser();
  const supabase = await createClient();
  await supabase.from("leads").update({ industry_id: industryId }).in("id", leadIds);
  revalidatePath("/leads/lista");
}

export type BulkStatusState = { ok: boolean; message: string; skippedIds: string[] } | null;

/** Igual que `updateLeadStatus` pero en lote: aplica a los leads que pasan el gate y reporta los que no. */
export async function bulkUpdateStatus(leadIds: string[], status: LeadStatus): Promise<BulkStatusState> {
  if (leadIds.length === 0) return null;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: current } = await supabase.from("leads").select("id, status").in("id", leadIds);
  const changed = (current ?? []).filter((row) => row.status !== status);
  if (changed.length === 0) return null;

  const requiredStatuses = MEETING_STATUS_GATE[status];
  let allowed = changed;
  let skippedIds: string[] = [];

  if (requiredStatuses) {
    const withAppointment = await leadIdsWithAppointment(
      supabase,
      changed.map((row) => row.id),
      requiredStatuses,
    );
    allowed = changed.filter((row) => withAppointment.has(row.id));
    skippedIds = changed.filter((row) => !withAppointment.has(row.id)).map((row) => row.id);
  }

  if (allowed.length > 0) {
    await supabase
      .from("leads")
      .update({ status })
      .in(
        "id",
        allowed.map((row) => row.id),
      );

    await supabase.from("lead_activities").insert(
      allowed.map((row) => ({
        owner_id: user.id,
        lead_id: row.id,
        type: "CAMBIO_ESTADO" as const,
        from_status: row.status,
        to_status: status,
      })),
    );

    revalidatePath("/leads/lista");
  }

  if (skippedIds.length === 0) return { ok: true, message: "Estado actualizado.", skippedIds };

  const message =
    allowed.length > 0
      ? `Se aplicó a ${allowed.length} de ${changed.length} leads. ${skippedIds.length} no tienen turno cargado en la agenda y quedaron sin cambios.`
      : meetingGateMessage(status);

  return { ok: false, message, skippedIds };
}

export async function bulkDeleteLeads(leadIds: string[]) {
  if (leadIds.length === 0) return;
  await requireUser();
  const supabase = await createClient();
  await supabase.from("leads").delete().in("id", leadIds);
  revalidatePath("/leads/lista");
}

export type ExportState = { ok: true; csv: string; filename: string } | { ok: false; message: string };

/** Genera el CSV en el servidor (RLS de por medio) — el cliente sólo arma el Blob y dispara la descarga. */
export async function exportLeadsCsv(leadIds: string[]): Promise<ExportState> {
  if (leadIds.length === 0) return { ok: false, message: "No hay leads seleccionados." };
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("name, phone, email, website, address, city, region, status, source_url, notes, industries(name)")
    .in("id", leadIds);
  if (error || !data) return { ok: false, message: "No se pudo exportar." };

  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = [
    "Nombre",
    "Teléfono",
    "Email",
    "Sitio web",
    "Dirección",
    "Ciudad",
    "Región",
    "Estado",
    "Rubro",
    "URL de origen",
    "Notas",
  ];
  const rows = data.map((lead) =>
    [
      lead.name,
      lead.phone,
      lead.email,
      lead.website,
      lead.address,
      lead.city,
      lead.region,
      STATUS_LABEL[lead.status],
      lead.industries?.name ?? "",
      lead.source_url,
      lead.notes,
    ]
      .map(escape)
      .join(","),
  );
  const csv = [header.map(escape).join(","), ...rows].join("\n");

  return { ok: true, csv, filename: `leads-${new Date().toISOString().slice(0, 10)}.csv` };
}

// ── Ficha del lead (Plan §1.3) ───────────────────────────────────────────────

const contactActivitySchema = z.object({
  leadId: z.string().uuid(),
  type: z.enum(["WHATSAPP", "EMAIL", "LLAMADA", "NOTA", "REUNION"]),
  content: z.string().trim().max(2000).optional(),
  newStatus: z.string().trim().optional(),
  nextActionAt: z.string().trim().optional(),
});

/**
 * Registra el resultado de una acción de contacto en un clic (Plan §1.3):
 * queda la actividad en el timeline y, si se eligió avanzar de estado, el
 * lead se actualiza en el mismo paso.
 */
export async function logContactActivity(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = contactActivitySchema.safeParse({
    leadId: formData.get("leadId"),
    type: formData.get("type"),
    content: formData.get("content") || undefined,
    newStatus: formData.get("newStatus") || undefined,
    nextActionAt: formData.get("nextActionAt") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("status")
    .eq("id", parsed.data.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, message: "Lead no encontrado." };

  const newStatus =
    parsed.data.newStatus && parsed.data.newStatus !== lead.status
      ? (parsed.data.newStatus as LeadStatus)
      : null;

  const { error: activityError } = await supabase.from("lead_activities").insert({
    owner_id: user.id,
    lead_id: parsed.data.leadId,
    type: parsed.data.type,
    content: parsed.data.content || null,
    from_status: newStatus ? lead.status : null,
    to_status: newStatus,
  });
  if (activityError) return { ok: false, message: "No se pudo registrar la actividad." };

  const update: Database["public"]["Tables"]["leads"]["Update"] = {
    last_contacted_at: new Date().toISOString(),
  };
  if (newStatus) update.status = newStatus;
  if (parsed.data.nextActionAt) update.next_action_at = new Date(parsed.data.nextActionAt).toISOString();

  await supabase.from("leads").update(update).eq("id", parsed.data.leadId);

  revalidatePath(`/leads/${parsed.data.leadId}`);
  revalidatePath("/leads/lista");
  return { ok: true, message: "Actividad registrada." };
}

const notesSchema = z.object({
  leadId: z.string().uuid(),
  notes: z.string().trim().max(4000).optional(),
  nextActionAt: z.string().trim().optional(),
});

export async function updateLeadNotes(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = notesSchema.safeParse({
    leadId: formData.get("leadId"),
    notes: formData.get("notes") || undefined,
    nextActionAt: formData.get("nextActionAt") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const supabase = await createClient();
  const newNote = parsed.data.notes?.trim() || null;

  const update: Database["public"]["Tables"]["leads"]["Update"] = {
    next_action_at: parsed.data.nextActionAt ? new Date(parsed.data.nextActionAt).toISOString() : null,
  };
  // El cuadro es un registro, no un campo "nota actual" (corrección de
  // diseño, Plan §1.21): un guardado sin texto nuevo (por ejemplo, para
  // tocar sólo la próxima acción) no debe borrar la última nota guardada en
  // `leads.notes` — ese campo queda como caché de "la más reciente" para
  // el CSV, y sólo se pisa cuando hay una nota nueva de verdad.
  if (newNote) update.notes = newNote;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", parsed.data.leadId)
    .select("id");
  if (error) return { ok: false, message: "No se pudo guardar." };
  // RLS filtra en silencio: un UPDATE que no matchea ninguna fila no es un
  // error de Postgres, así que sin este chequeo se reporta éxito sin haber
  // escrito nada.
  if (!data || data.length === 0) return { ok: false, message: "No se encontró el lead." };

  // Toda nota no vacía queda en el timeline — es el historial completo, no
  // sólo la prueba de que se guardó. El cuadro se vacía del lado del cliente
  // después de esto (`LeadNotesForm`), así que cada guardado es siempre una
  // nota nueva: no hace falta comparar contra la anterior.
  if (newNote) {
    await supabase.from("lead_activities").insert({
      owner_id: user.id,
      lead_id: parsed.data.leadId,
      type: "NOTA",
      content: newNote,
    });
  }

  revalidatePath(`/leads/${parsed.data.leadId}`);
  return { ok: true, message: "Guardado." };
}

const appointmentSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(2, "Ponele un título.").max(120, "Título muy largo."),
  startsAt: z.string().trim().min(1, "Elegí fecha y hora."),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(30),
  notes: z.string().trim().max(2000).optional(),
  meetingUrl: z.union([z.string().trim().url("URL inválida."), z.literal("")]).optional(),
});

/**
 * Inserta el turno y, si cuelga de un lead, avanza su estado a AGENDADO (si
 * no lo estaba ya) y deja constancia en el timeline. Usado tanto por el botón
 * "Agendar" de la ficha del lead como por "Nuevo turno" en /leads/agenda.
 */
async function insertAppointmentAndAdvanceLead(params: {
  userId: string;
  leadId: string | null;
  title: string;
  notes: string | null;
  meetingUrl: string | null;
  startsAt: Date;
  endsAt: Date;
}): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert({
    owner_id: params.userId,
    lead_id: params.leadId,
    title: params.title,
    notes: params.notes,
    meeting_url: params.meetingUrl,
    starts_at: params.startsAt.toISOString(),
    ends_at: params.endsAt.toISOString(),
  });
  if (error) return { ok: false, message: "No se pudo agendar." };

  if (params.leadId) {
    const { data: lead } = await supabase.from("leads").select("status").eq("id", params.leadId).maybeSingle();
    const advancesStatus = lead && lead.status !== "REUNION_AGENDADA";
    if (advancesStatus) {
      await supabase.from("leads").update({ status: "REUNION_AGENDADA" }).eq("id", params.leadId);
    }
    await supabase.from("lead_activities").insert({
      owner_id: params.userId,
      lead_id: params.leadId,
      type: "REUNION",
      content: `Reunión agendada: ${params.title}`,
      from_status: advancesStatus ? lead.status : null,
      to_status: advancesStatus ? "REUNION_AGENDADA" : null,
    });
    revalidatePath(`/leads/${params.leadId}`);
  }

  revalidatePath("/leads/lista");
  revalidatePath("/leads/agenda");
  return { ok: true, message: "Reunión agendada." };
}

/** Botón "Agendar" de la ficha (Plan §1.3): crea un turno ligado al lead y avanza el estado. */
export async function createAppointmentForLead(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = appointmentSchema.safeParse({
    leadId: formData.get("leadId"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    notes: formData.get("notes") || undefined,
    meetingUrl: formData.get("meetingUrl") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Fecha inválida." };
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);

  return insertAppointmentAndAdvanceLead({
    userId: user.id,
    leadId: parsed.data.leadId,
    title: parsed.data.title,
    notes: parsed.data.notes || null,
    meetingUrl: parsed.data.meetingUrl || null,
    startsAt,
    endsAt,
  });
}

// ── Agenda (Plan §1.5) ───────────────────────────────────────────────────────

const agendaAppointmentSchema = z.object({
  leadId: z.string().trim().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2, "Ponele un título.").max(120, "Título muy largo."),
  startsAt: z.string().trim().min(1, "Elegí fecha y hora."),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(30),
  notes: z.string().trim().max(2000).optional(),
  meetingUrl: z.union([z.string().trim().url("URL inválida."), z.literal("")]).optional(),
});

/** "Nuevo turno" en /leads/agenda: igual que agendar desde la ficha, pero el lead es opcional. */
export async function createAppointment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = agendaAppointmentSchema.safeParse({
    leadId: formData.get("leadId") || undefined,
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    notes: formData.get("notes") || undefined,
    meetingUrl: formData.get("meetingUrl") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Fecha inválida." };
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);

  return insertAppointmentAndAdvanceLead({
    userId: user.id,
    leadId: parsed.data.leadId || null,
    title: parsed.data.title,
    notes: parsed.data.notes || null,
    meetingUrl: parsed.data.meetingUrl || null,
    startsAt,
    endsAt,
  });
}

const appointmentUpdateSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().trim().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(2, "Ponele un título.").max(120, "Título muy largo."),
  startsAt: z.string().trim().min(1, "Elegí fecha y hora."),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(30),
  notes: z.string().trim().max(2000).optional(),
  meetingUrl: z.union([z.string().trim().url("URL inválida."), z.literal("")]).optional(),
  status: z.enum(["AGENDADA", "CONFIRMADA", "REALIZADA", "NO_ASISTIO", "CANCELADA"]),
  newLeadStatus: z.string().trim().optional(),
});

/** Editar un turno existente (Plan §1.5). Si cambia a REALIZADA con lead asociado, puede avanzar su estado. */
export async function updateAppointment(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = appointmentUpdateSchema.safeParse({
    id: formData.get("id"),
    leadId: formData.get("leadId") || undefined,
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    notes: formData.get("notes") || undefined,
    meetingUrl: formData.get("meetingUrl") || undefined,
    status: formData.get("status"),
    newLeadStatus: formData.get("newLeadStatus") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Fecha inválida." };
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000);
  const leadId = parsed.data.leadId || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      lead_id: leadId,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      meeting_url: parsed.data.meetingUrl || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: parsed.data.status,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "No se pudo guardar." };

  if (leadId && parsed.data.newLeadStatus) {
    const { data: lead } = await supabase.from("leads").select("status").eq("id", leadId).maybeSingle();
    if (lead && lead.status !== parsed.data.newLeadStatus) {
      const newStatus = parsed.data.newLeadStatus as LeadStatus;
      await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
      await supabase.from("lead_activities").insert({
        owner_id: user.id,
        lead_id: leadId,
        type: "CAMBIO_ESTADO",
        from_status: lead.status,
        to_status: newStatus,
      });
    }
    revalidatePath(`/leads/${leadId}`);
  }

  revalidatePath("/leads/agenda");
  return { ok: true, message: "Turno actualizado." };
}

/** Cambio de estado rápido (chips de mes/semana, fila de la lista) — sin tocar el lead. */
export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("appointments").update({ status }).eq("id", id);
  revalidatePath("/leads/agenda");
}

/**
 * Marcar "realizada" desde el control rápido: ofrece avanzar el estado del
 * lead en el mismo paso (Plan §1.5) sin abrir el formulario completo de edición.
 */
export async function markAppointmentDone(id: string, newLeadStatus?: LeadStatus) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: appt } = await supabase.from("appointments").select("lead_id").eq("id", id).maybeSingle();
  if (!appt) return;

  await supabase.from("appointments").update({ status: "REALIZADA" }).eq("id", id);

  if (appt.lead_id && newLeadStatus) {
    const { data: lead } = await supabase.from("leads").select("status").eq("id", appt.lead_id).maybeSingle();
    if (lead && lead.status !== newLeadStatus) {
      await supabase.from("leads").update({ status: newLeadStatus }).eq("id", appt.lead_id);
      await supabase.from("lead_activities").insert({
        owner_id: user.id,
        lead_id: appt.lead_id,
        type: "CAMBIO_ESTADO",
        from_status: lead.status,
        to_status: newLeadStatus,
      });
    }
    revalidatePath(`/leads/${appt.lead_id}`);
  }

  revalidatePath("/leads/agenda");
}

/** Arrastrar y soltar en la grilla de mes/semana: mueve el turno preservando su duración. */
export async function moveAppointment(id: string, startsAtIso: string) {
  await requireUser();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!current) return;

  const durationMs = new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime();
  const newStart = new Date(startsAtIso);
  const newEnd = new Date(newStart.getTime() + durationMs);

  await supabase
    .from("appointments")
    .update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() })
    .eq("id", id);
  revalidatePath("/leads/agenda");
}

export async function deleteAppointment(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("appointments").delete().eq("id", id);
  revalidatePath("/leads/agenda");
}

export type IcsExportState = { ok: true; ics: string; filename: string } | { ok: false; message: string };

/** Genera el .ics en el servidor (RLS de por medio) — el cliente arma el Blob y dispara la descarga. */
export async function exportAgendaIcs(): Promise<IcsExportState> {
  await requireUser();
  const rows = await listAppointmentsForIcs();
  const ics = buildIcsCalendar(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      meeting_url: row.meeting_url,
      status: row.status,
      leadName: row.leads?.name ?? null,
    })),
  );

  return { ok: true, ics, filename: `agenda-${new Date().toISOString().slice(0, 10)}.ics` };
}

/** Búsqueda del ⌘K (Sidebar §01.B). Sólo lectura, pero vive acá porque la dispara un client component. */
export async function searchCommandPaletteAction(query: string): Promise<CommandPaletteResults> {
  await requireUser();
  return searchCommandPalette(query);
}
