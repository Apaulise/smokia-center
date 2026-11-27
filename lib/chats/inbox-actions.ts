"use server";

// Acciones de la bandeja de §1.26: respuestas rápidas (texto, audio y
// documentos/imágenes), etiquetas (se escriben primero en Zernio, que es la
// fuente de verdad) y seguimiento. Todas con el cliente con RLS del que las usa.

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { asChats, type ChatsClient, type QuickReplyRow, type TagLabelRow } from "@/lib/chats/db";
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_MS,
  audioMimeOf,
  BODY_MAX,
  extensionFor,
  FILE_NAME_MAX,
  fileExtensionFor,
  fileKindOf,
  fileMimeOf,
  fileSizeLimit,
  TITLE_MAX,
  type QuickReplyView,
} from "@/lib/chats/quick-replies";
import { normalizeTag } from "@/lib/chats/tag-view";
import { describeZernioError, getContact, listContacts, setContactTags } from "@/lib/chats/zernio";
import { decrypt } from "@/lib/crypto";
import { updateLeadPlanning } from "@/lib/leads/contact";
import { createClient, requireUser } from "@/lib/supabase/server";

export type InboxActionResult = { ok: boolean; message: string };

const idSchema = z.uuid();
const PREVIEW_TTL_S = 60 * 60;
const BUCKET = "chat-audio";
/** Documentos e imágenes (migración 20261116120000_chat_quick_reply_files.sql). */
const FILE_BUCKET = "chat-files";
const MISSING_FILES_MIGRATION = "Falta aplicar la migración de documentos e imágenes (`npm run db:push`).";

/** Columna, check o bucket que todavía no existen: la migración de archivos no se aplicó. */
function missingFilesSupport(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST204" || error.code === "42703" || error.code === "23514" || /bucket|file_(path|mime|name|size)/i.test(error.message ?? "")));
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /Could not find the table|does not exist/i.test(error.message ?? "")));
}

// ── Respuestas rápidas ───────────────────────────────────────────────────────

function toView(row: QuickReplyRow, previewUrl: string | null): QuickReplyView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    previewUrl,
    durationMs: row.audio_duration_ms,
    mime: row.kind === "ARCHIVO" ? (row.file_mime ?? null) : row.audio_mime,
    fileName: row.file_name ?? null,
    fileSize: row.file_size ?? null,
    useCount: row.use_count,
  };
}

/** Las respuestas rápidas del usuario, con una URL firmada para escuchar cada audio y ver cada archivo. */
export async function listQuickReplies(): Promise<{ ready: boolean; items: QuickReplyView[] }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await asChats(supabase)
    .from("chat_quick_replies")
    .select("*")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { ready: !missingTable(error), items: [] };
  const rows = (data ?? []) as QuickReplyRow[];

  // Un pedido por bucket, los dos a la vez: son independientes.
  const sign = async (bucket: string, paths: string[]) => {
    const signed = new Map<string, string>();
    if (paths.length === 0) return signed;
    const { data: urls } = await supabase.storage.from(bucket).createSignedUrls(paths, PREVIEW_TTL_S);
    for (const entry of urls ?? []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    return signed;
  };
  const present = (path: string | null | undefined): path is string => Boolean(path);
  const [audioUrls, fileUrls] = await Promise.all([
    sign(BUCKET, rows.map((row) => row.audio_path).filter(present)),
    sign(FILE_BUCKET, rows.map((row) => row.file_path).filter(present)),
  ]);
  return {
    ready: true,
    items: rows.map((row) => toView(row, (row.file_path ? fileUrls.get(row.file_path) : row.audio_path ? audioUrls.get(row.audio_path) : null) ?? null)),
  };
}

const textSchema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre.").max(TITLE_MAX, `Hasta ${TITLE_MAX} caracteres.`),
  body: z.string().trim().min(1, "Escribí el mensaje.").max(BODY_MAX, `Instagram acepta hasta ${BODY_MAX} caracteres.`),
});

async function nextSortOrder(chats: ChatsClient, ownerId: string): Promise<number> {
  const { data } = await chats.from("chat_quick_replies").select("sort_order").eq("owner_id", ownerId).order("sort_order", { ascending: false }).limit(1);
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1;
}

export async function createTextQuickReply(input: { title: string; body: string }): Promise<InboxActionResult & { item?: QuickReplyView }> {
  const user = await requireUser();
  const parsed = textSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const chats = asChats(await createClient());
  const { data, error } = await chats
    .from("chat_quick_replies")
    .insert({ owner_id: user.id, kind: "TEXTO", title: parsed.data.title, body: parsed.data.body, sort_order: await nextSortOrder(chats, user.id) })
    .select("*")
    .single();
  if (error || !data) return { ok: false, message: missingTable(error) ? "Falta aplicar la migración de respuestas rápidas." : "No se pudo guardar." };
  revalidatePath("/configuracion");
  return { ok: true, message: "Guardada como respuesta rápida.", item: toView(data as QuickReplyRow, null) };
}

/**
 * La ruta donde el navegador sube un audio nuevo. El archivo va directo del
 * navegador a Storage (las Server Actions no aceptan 8 MB), siempre dentro de
 * la carpeta del usuario: lo exige la política del bucket.
 */
export async function prepareAudioUpload(input: { mime: string; name: string; size: number }): Promise<{ ok: true; path: string; mime: string } | { ok: false; message: string }> {
  const user = await requireUser();
  const mime = audioMimeOf(input.mime, input.name);
  if (!mime) return { ok: false, message: "Ese formato no lo acepta Instagram. Subí m4a, mp3, aac o wav." };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > AUDIO_MAX_BYTES) return { ok: false, message: "El audio puede pesar hasta 8 MB." };
  return { ok: true, path: `${user.id}/${randomUUID()}.${extensionFor(mime)}`, mime };
}

const audioSchema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre.").max(TITLE_MAX, `Hasta ${TITLE_MAX} caracteres.`),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(m4a|aac|mp3|wav)$/i, "Ruta inválida."),
  mime: z.string().min(5).max(40),
  durationMs: z.number().int().min(0).max(AUDIO_MAX_MS * 10).nullable(),
});

/** Registra un audio que el navegador ya subió a Storage. */
export async function createAudioQuickReply(input: { title: string; path: string; mime: string; durationMs: number | null }): Promise<InboxActionResult & { item?: QuickReplyView }> {
  const user = await requireUser();
  const parsed = audioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!parsed.data.path.startsWith(`${user.id}/`)) return { ok: false, message: "Ruta inválida." };

  const supabase = await createClient();
  // Que el archivo exista de verdad (y sea del usuario: RLS de Storage) antes de guardar la fila.
  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(parsed.data.path, PREVIEW_TTL_S);
  if (signError || !signed?.signedUrl) return { ok: false, message: "No se encontró el audio subido. Probá de nuevo." };

  const chats = asChats(supabase);
  const { data, error } = await chats
    .from("chat_quick_replies")
    .insert({
      owner_id: user.id,
      kind: "AUDIO",
      title: parsed.data.title,
      audio_path: parsed.data.path,
      audio_mime: parsed.data.mime,
      audio_duration_ms: parsed.data.durationMs,
      sort_order: await nextSortOrder(chats, user.id),
    })
    .select("*")
    .single();
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([parsed.data.path]);
    return { ok: false, message: missingTable(error) ? "Falta aplicar la migración de respuestas rápidas." : "No se pudo guardar el audio." };
  }
  revalidatePath("/configuracion");
  return { ok: true, message: "Audio guardado: ya lo podés mandar con un toque.", item: toView(data as QuickReplyRow, signed.signedUrl) };
}

/**
 * La ruta donde el navegador sube un documento o una imagen nuevos. Igual que
 * los audios: directo del navegador al bucket privado, a la carpeta del usuario.
 */
export async function prepareFileUpload(input: { mime: string; name: string; size: number }): Promise<{ ok: true; path: string; mime: string } | { ok: false; message: string }> {
  const user = await requireUser();
  const mime = fileMimeOf(input.mime, input.name);
  if (!mime) return { ok: false, message: "Instagram sólo acepta imágenes (png, jpg, gif) y PDF por mensaje directo." };
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, message: "El archivo está vacío." };
  if (input.size > fileSizeLimit(mime)) {
    return { ok: false, message: fileKindOf(mime) === "image" ? "La imagen puede pesar hasta 8 MB." : "El PDF puede pesar hasta 25 MB." };
  }
  return { ok: true, path: `${user.id}/${randomUUID()}.${fileExtensionFor(mime)}`, mime };
}

const fileSchema = z.object({
  title: z.string().trim().min(1, "Ponele un nombre.").max(TITLE_MAX, `Hasta ${TITLE_MAX} caracteres.`),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|gif|pdf)$/i, "Ruta inválida."),
  mime: z.enum(["image/png", "image/jpeg", "image/gif", "application/pdf"]),
  name: z.string().trim().max(FILE_NAME_MAX).nullable(),
  size: z.number().int().min(1).max(26_214_400),
});

/** Registra un documento o una imagen que el navegador ya subió a Storage. */
export async function createFileQuickReply(input: { title: string; path: string; mime: string; name: string | null; size: number }): Promise<InboxActionResult & { item?: QuickReplyView }> {
  const user = await requireUser();
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!parsed.data.path.startsWith(`${user.id}/`)) return { ok: false, message: "Ruta inválida." };
  if (parsed.data.size > fileSizeLimit(parsed.data.mime)) return { ok: false, message: "El archivo pesa más de lo que acepta Instagram." };

  const supabase = await createClient();
  // Que el archivo exista de verdad (y sea del usuario: RLS de Storage) antes de guardar la fila.
  const { data: signed, error: signError } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(parsed.data.path, PREVIEW_TTL_S);
  if (signError || !signed?.signedUrl) return { ok: false, message: "No se encontró el archivo subido. Probá de nuevo." };

  const chats = asChats(supabase);
  const { data, error } = await chats
    .from("chat_quick_replies")
    .insert({
      owner_id: user.id,
      kind: "ARCHIVO",
      title: parsed.data.title,
      file_path: parsed.data.path,
      file_mime: parsed.data.mime,
      file_name: parsed.data.name || null,
      file_size: parsed.data.size,
      sort_order: await nextSortOrder(chats, user.id),
    })
    .select("*")
    .single();
  if (error || !data) {
    await supabase.storage.from(FILE_BUCKET).remove([parsed.data.path]);
    return { ok: false, message: missingFilesSupport(error) || missingTable(error) ? MISSING_FILES_MIGRATION : "No se pudo guardar el archivo." };
  }
  revalidatePath("/configuracion");
  return {
    ok: true,
    message: fileKindOf(parsed.data.mime) === "image" ? "Imagen guardada: ya la podés mandar con un toque." : "Documento guardado: ya lo podés mandar con un toque.",
    item: toView(data as QuickReplyRow, signed.signedUrl),
  };
}

/** Cambia el nombre de una respuesta rápida y, si es de texto, también su mensaje. */
export async function renameQuickReply(id: string, input: { title: string; body?: string }): Promise<InboxActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Respuesta inválida." };
  const title = z.string().trim().min(1).max(TITLE_MAX).safeParse(input.title);
  if (!title.success) return { ok: false, message: "El nombre no puede quedar vacío." };
  const patch: Partial<QuickReplyRow> = { title: title.data };
  if (input.body !== undefined) {
    const body = z.string().trim().min(1).max(BODY_MAX).safeParse(input.body);
    if (!body.success) return { ok: false, message: "El mensaje no puede quedar vacío." };
    patch.body = body.data;
  }
  const chats = asChats(await createClient());
  // El mensaje sólo existe en las de texto: en un audio o un archivo el check de la tabla lo deja pasar, pero no se usa.
  if (patch.body !== undefined) {
    const { data: current } = await chats.from("chat_quick_replies").select("kind").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!current) return { ok: false, message: "No se encontró esa respuesta." };
    if (current.kind !== "TEXTO") delete patch.body;
  }
  const { data, error } = await chats.from("chat_quick_replies").update(patch).eq("id", id).eq("owner_id", user.id).select("id");
  if (error) return { ok: false, message: "No se pudo guardar." };
  if (!data || data.length === 0) return { ok: false, message: "No se encontró esa respuesta." };
  revalidatePath("/configuracion");
  return { ok: true, message: "Guardado." };
}

export async function moveQuickReply(id: string, direction: "up" | "down"): Promise<InboxActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Respuesta inválida." };
  const chats = asChats(await createClient());
  const { data } = await chats.from("chat_quick_replies").select("id, sort_order").eq("owner_id", user.id).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{ id: string; sort_order: number }>;
  const index = rows.findIndex((row) => row.id === id);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swap < 0 || swap >= rows.length) return { ok: true, message: "" };
  const reordered = rows.slice();
  [reordered[index], reordered[swap]] = [reordered[swap], reordered[index]];
  for (const [position, row] of reordered.entries()) {
    if (row.sort_order !== position) await chats.from("chat_quick_replies").update({ sort_order: position }).eq("id", row.id).eq("owner_id", user.id);
  }
  revalidatePath("/configuracion");
  return { ok: true, message: "" };
}

export async function deleteQuickReply(id: string): Promise<InboxActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Respuesta inválida." };
  const supabase = await createClient();
  const chats = asChats(supabase);
  // `*` y no las columnas por nombre: las de archivo no existen si falta su migración.
  const { data } = await chats.from("chat_quick_replies").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  const row = data as QuickReplyRow | null;
  const { error } = await chats.from("chat_quick_replies").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return { ok: false, message: "No se pudo borrar." };
  // Primero la fila, después el archivo: si el segundo paso falla queda un archivo suelto en
  // Storage (que nadie ve), nunca una respuesta que apunta a un archivo que ya no está.
  if (row?.audio_path) await supabase.storage.from(BUCKET).remove([row.audio_path]);
  if (row?.file_path) await supabase.storage.from(FILE_BUCKET).remove([row.file_path]);
  revalidatePath("/configuracion");
  return { ok: true, message: row?.kind === "AUDIO" ? "Audio borrado." : row?.kind === "ARCHIVO" ? "Archivo borrado." : "Respuesta borrada." };
}

export async function markQuickReplyUsed(id: string): Promise<void> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return;
  const chats = asChats(await createClient());
  const { data } = await chats.from("chat_quick_replies").select("use_count, kind").eq("id", id).eq("owner_id", user.id).maybeSingle();
  // Los audios y los archivos suben su contador al mandarse de verdad (sendChatAttachment), no al elegirlos.
  if (!data || data.kind !== "TEXTO") return;
  await chats.from("chat_quick_replies").update({ use_count: (data.use_count as number) + 1 }).eq("id", id).eq("owner_id", user.id);
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

/** La conversación con la API key de su cuenta (la del dueño, o la compartida que RLS deja leer). */
async function conversationWithKey(chats: ChatsClient, conversationId: string) {
  const { data: conversation } = await chats
    .from("conversations")
    .select("id, owner_id, channel_account_id, participant_external_id, zernio_contact_id, tags")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;
  const [{ data: account }, { data: secret }] = await Promise.all([
    chats.from("channel_accounts").select("id, zernio_account_id, channel").eq("id", conversation.channel_account_id).maybeSingle(),
    chats.from("channel_secrets").select("api_key_encrypted").eq("channel_account_id", conversation.channel_account_id).maybeSingle(),
  ]);
  if (!account || !secret) return null;
  let apiKey: string;
  try {
    apiKey = decrypt(secret.api_key_encrypted);
  } catch {
    return null;
  }
  return { conversation, account, apiKey };
}

/** El contacto de Zernio de la conversación: el guardado o, si falta, el que tiene su id de Instagram. */
async function resolveContactId(
  apiKey: string,
  account: { zernio_account_id: string; channel: string },
  conversation: { participant_external_id: string | null; zernio_contact_id: string | null },
): Promise<string | null> {
  if (conversation.zernio_contact_id) return conversation.zernio_contact_id;
  if (!conversation.participant_external_id) return null;
  for (let page = 0; page < 10; page += 1) {
    const { contacts, hasMore } = await listContacts(apiKey, { accountId: account.zernio_account_id, platform: account.channel.toLowerCase(), limit: 100, skip: page * 100 });
    const found = contacts.find((contact) => contact.platformIdentifier === conversation.participant_external_id);
    if (found) return found.id;
    if (!hasMore) break;
  }
  return null;
}

const tagChangeSchema = z.object({ conversationId: z.uuid(), add: z.array(z.string()).max(10).default([]), remove: z.array(z.string()).max(10).default([]) });

/**
 * Agrega o saca etiquetas. Lee el contacto de Zernio, aplica el cambio sobre
 * SU set (no sobre el de SmokIA, que puede estar atrasado) y lo escribe entero:
 * así no se pisa una etiqueta que un workflow acaba de poner. Recién después
 * actualiza la fila. Lo puede hacer el dueño o el socio si la cuenta está
 * compartida (RLS de equipo de `conversations`).
 */
export async function changeConversationTags(input: { conversationId: string; add?: string[]; remove?: string[] }): Promise<InboxActionResult & { tags?: string[] }> {
  await requireUser();
  const parsed = tagChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Etiquetas inválidas." };
  const add = parsed.data.add.map(normalizeTag).filter((tag): tag is string => Boolean(tag));
  const remove = new Set(parsed.data.remove);
  if (add.length === 0 && remove.size === 0) return { ok: false, message: "Escribí una etiqueta." };

  const chats = asChats(await createClient());
  const found = await conversationWithKey(chats, parsed.data.conversationId);
  if (!found) return { ok: false, message: "No se encontró la conversación o su cuenta de Zernio." };
  const { conversation, account, apiKey } = found;

  let tags: string[];
  let contactId: string | null;
  try {
    contactId = await resolveContactId(apiKey, account, conversation);
    if (!contactId) return { ok: false, message: "Zernio todavía no tiene el contacto de esta persona. Probá sincronizar desde Configuración." };
    const current = (await getContact(apiKey, contactId)).tags;
    const next = [...new Set([...current.filter((tag) => !remove.has(tag)), ...add])];
    tags = (await setContactTags(apiKey, contactId, next)).tags;
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }

  const { error } = await chats
    .from("conversations")
    .update({ zernio_contact_id: contactId, tags, tags_synced_at: new Date().toISOString() })
    .eq("id", conversation.id);
  if (error) return { ok: false, message: "Se guardó en Zernio, pero no en ALTAB. Sincronizá para verla." };
  return { ok: true, message: "Etiquetas actualizadas.", tags };
}

/** Vuelve a leer de Zernio las etiquetas de una conversación (botón del panel). */
export async function refreshConversationTags(conversationId: string): Promise<InboxActionResult & { tags?: string[] }> {
  await requireUser();
  if (!idSchema.safeParse(conversationId).success) return { ok: false, message: "Conversación inválida." };
  const chats = asChats(await createClient());
  const found = await conversationWithKey(chats, conversationId);
  if (!found) return { ok: false, message: "No se encontró la conversación o su cuenta de Zernio." };
  try {
    const contactId = await resolveContactId(found.apiKey, found.account, found.conversation);
    if (!contactId) return { ok: false, message: "Zernio todavía no tiene el contacto de esta persona." };
    const { tags } = await getContact(found.apiKey, contactId);
    await chats.from("conversations").update({ zernio_contact_id: contactId, tags, tags_synced_at: new Date().toISOString() }).eq("id", conversationId);
    return { ok: true, message: "Etiquetas al día.", tags };
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }
}

// ── Catálogo de etiquetas ────────────────────────────────────────────────────

const labelSchema = z.object({
  tag: z.string().trim().min(1).max(64),
  label: z.string().trim().max(60).nullable(),
  stage: z.enum(["TOFU", "MOFU", "BOFU"]).nullable(),
});

export async function saveTagLabel(input: { tag: string; label: string | null; stage: "TOFU" | "MOFU" | "BOFU" | null }): Promise<InboxActionResult & { row?: TagLabelRow }> {
  const user = await requireUser();
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };
  const { data, error } = await asChats(await createClient())
    .from("chat_tag_labels")
    .upsert({ owner_id: user.id, tag: parsed.data.tag, label: parsed.data.label || null, stage: parsed.data.stage }, { onConflict: "owner_id,tag" })
    .select("*")
    .single();
  if (error || !data) return { ok: false, message: missingTable(error) ? "Falta aplicar la migración de etiquetas." : "No se pudo guardar." };
  revalidatePath("/leads/chats");
  return { ok: true, message: "Guardado.", row: data as TagLabelRow };
}

// ── Seguimiento ──────────────────────────────────────────────────────────────

const followUpSchema = z.object({
  conversationId: z.uuid(),
  at: z.string().nullable(),
  note: z.string().trim().max(280).nullable(),
});

/**
 * Agenda (o borra) el seguimiento de una conversación. Si tiene un lead
 * enlazado y es del usuario, también lo deja como próxima acción del lead, así
 * aparece en el centro de seguimiento (§1.20).
 */
export async function setConversationFollowUp(input: { conversationId: string; at: string | null; note: string | null }): Promise<InboxActionResult> {
  const user = await requireUser();
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Fecha inválida." };
  const at = parsed.data.at && !Number.isNaN(Date.parse(parsed.data.at)) ? new Date(parsed.data.at).toISOString() : null;

  const supabase = await createClient();
  const chats = asChats(supabase);
  const { data: conversation, error } = await chats
    .from("conversations")
    .update({ follow_up_at: at, follow_up_note: at ? parsed.data.note || null : null })
    .eq("id", parsed.data.conversationId)
    .select("id, owner_id, lead_id")
    .maybeSingle();
  if (error) return { ok: false, message: /column/i.test(error.message) ? "Falta aplicar la migración de etiquetas y seguimiento." : "No se pudo guardar." };
  if (!conversation) return { ok: false, message: "No se encontró la conversación." };

  if (conversation.lead_id && conversation.owner_id === user.id) {
    await updateLeadPlanning(supabase, user.id, conversation.lead_id, { nextActionAt: at });
    revalidatePath(`/leads/${conversation.lead_id}`);
    revalidatePath("/leads/seguimiento");
  }
  return { ok: true, message: at ? "Seguimiento agendado." : "Seguimiento borrado." };
}
