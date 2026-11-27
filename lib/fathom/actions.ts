"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { missingCrm } from "@/lib/crm/db";
import { encrypt } from "@/lib/crypto";
import type { ActionState } from "@/lib/settings/actions";
import { FATHOM_KEY_SETTING } from "@/lib/settings/constants";
import { createClient, requireUser } from "@/lib/supabase/server";
import { FathomError, getFathomSummary, listFathomMeetings, readFathomKey } from "./client";
import { fathomLink, meetingChoice, meetingContext, meetingStage, recordingId } from "./model";

function fathomMessage(error: unknown) {
  return error instanceof FathomError ? error.message : "No se pudo completar la operación con Fathom.";
}

export async function saveFathomKey(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const key = z.string().trim().min(10).max(512).regex(/^[\x21-\x7e]+$/).safeParse(form.get("apiKey"));
  if (!key.success) return { ok: false, message: "Ingresá una API key de Fathom válida." };
  try {
    const db = await createClient();
    const { error } = await db.from("settings").upsert({
      key: FATHOM_KEY_SETTING, owner_id: user.id, value_encrypted: encrypt(key.data),
    }, { onConflict: "owner_id,key" });
    if (error) return { ok: false, message: "No se pudo guardar la API key." };
    revalidatePath("/configuracion");
    return { ok: true, message: "API key guardada." };
  } catch {
    return { ok: false, message: "No se pudo guardar la clave cifrada." };
  }
}

export async function testFathomKey(): Promise<ActionState> {
  const user = await requireUser();
  try {
    const key = await readFathomKey(await createClient(), user.id);
    if (!key) return { ok: false, message: "Todavía no cargaste una API key de Fathom." };
    await listFathomMeetings(key, null);
    return { ok: true, message: "Conexión con Fathom verificada." };
  } catch (error) {
    return { ok: false, message: fathomMessage(error) };
  }
}

export async function deleteFathomKey() {
  const user = await requireUser();
  await (await createClient()).from("settings").delete().eq("owner_id", user.id).eq("key", FATHOM_KEY_SETTING);
  revalidatePath("/configuracion");
}

async function meetingSession(input: unknown) {
  const user = await requireUser();
  const context = meetingContext.safeParse(input);
  if (!context.success) throw new FathomError("No se encontró el lead o cliente.");
  const db = await createClient();
  const { id, kind } = context.data;
  const target = kind === "lead"
    ? await db.from("leads").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle()
    : await db.from("crm_clients").select("id").eq("id", id).maybeSingle();
  if (target.error || !target.data) throw new FathomError("No tenés acceso a esta ficha.");

  const key = await readFathomKey(db, user.id);
  if (!key) throw new FathomError("Conectá tu cuenta de Fathom en Configuración.");
  return { db, key, context: context.data };
}

const cursorSchema = z.string().min(1).max(2048).nullable();

export async function loadFathomMeetings(context: unknown, input: unknown) {
  try {
    const cursor = cursorSchema.safeParse(input);
    if (!cursor.success) throw new FathomError("Volvé a abrir el selector de reuniones.");
    const { key } = await meetingSession(context);
    const page = await listFathomMeetings(key, cursor.data);
    return {
      ok: true as const,
      meetings: page.items.map((meeting) => meetingChoice(meeting, cursor.data)),
      next: page.next_cursor || null,
    };
  } catch (error) {
    return { ok: false as const, message: fathomMessage(error) };
  }
}

const importFields = z.object({ cursor: cursorSchema, id: recordingId, stage: meetingStage });

export async function importFathomMeeting(input: unknown, selection: unknown) {
  try {
    const fields = importFields.safeParse(selection);
    if (!fields.success) throw new FathomError("Elegí una reunión y su tipo de llamada.");
    const { key, db, context } = await meetingSession(input);
    const { id, cursor, stage } = fields.data;
    const page = await listFathomMeetings(key, cursor, true);
    const meeting = page.items.find((option) => option.recording_id === id);
    if (!meeting) throw new FathomError("La lista de reuniones cambió. Volvé a abrir el selector.");
    const summary = meeting.default_summary?.markdown_formatted?.trim() || await getFathomSummary(key, id);
    if (!summary) throw new FathomError("Fathom todavía está preparando el resumen.");
    if (summary.length > 200_000) throw new FathomError("El resumen es demasiado extenso para guardarlo en el CRM.");

    const { title, at } = meetingChoice(meeting, cursor);
    const { data, error } = await db.from("crm_meeting_notes").insert({
      lead_id: context.kind === "lead" ? context.id : null,
      client_id: context.kind === "client" ? context.id : null,
      recording_id: id,
      stage,
      title,
      meeting_at: at,
      fathom_url: fathomLink(meeting.url),
      summary,
      action_items: meeting.action_items ?? [],
    }).select("lead_id,client_id").single();
    if (error?.code === "23505") return { ok: true as const, message: "Esta minuta ya estaba en la ficha." };
    if (missingCrm(error)) throw new FathomError("Falta aplicar la migración de minutas del CRM.");
    if (error || !data) throw new FathomError("No se pudo guardar la minuta en esta ficha.");
    if (data.lead_id) revalidatePath(`/leads/${data.lead_id}`);
    if (data.client_id) revalidatePath(`/leads/clientes/${data.client_id}`);
    return { ok: true as const, message: "Minuta importada." };
  } catch (error) {
    return { ok: false as const, message: fathomMessage(error) };
  }
}
