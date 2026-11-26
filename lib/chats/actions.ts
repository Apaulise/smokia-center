"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { upsertInstagramLead } from "@/lib/automation/instagram-intake";
import { asChats, type ChannelAccountRow, type ChatsClient, type ConversationRow, type QuickReplyRow } from "@/lib/chats/db";
import { syncChannelAccount, type AccountContext, type SyncResult } from "@/lib/chats/ingest";
import { previewOf } from "@/lib/chats/format";
import { fileKindOf } from "@/lib/chats/quick-replies";
import {
  getConversationDetail,
  listConversations,
  listOlderMessages,
  MESSAGE_COLUMNS,
  type ChatMessageView,
  type ConversationDetail,
  type ConversationScope,
  type InboxList,
} from "@/lib/chats/queries";
import { canReply, replyWindow, sendTagFields, windowLabel } from "@/lib/chats/window";
import {
  createWebhook,
  deleteWebhook,
  describeZernioError,
  getAccountHealth,
  listAccounts,
  sendMessage,
  updateWebhookEvents,
} from "@/lib/chats/zernio";
import { syncContactTags } from "@/lib/chats/tags";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";

/** Lo que devuelven las acciones que se llaman a mano (botones): siempre hay resultado. */
export type ChatActionResult = { ok: boolean; message: string; leadId?: string };

/** Para `useActionState` (formularios): arranca en `null` hasta el primer envío. */
export type ChatActionState = ChatActionResult | null;

const UNIQUE_VIOLATION = "23505";

function revalidateChats(leadId?: string | null) {
  revalidatePath("/leads/chats");
  revalidatePath("/configuracion");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

function isLocalUrl(url: string | undefined): boolean {
  return !url || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

function contextOf(account: Pick<ChannelAccountRow, "id" | "owner_id" | "team_id" | "channel" | "zernio_account_id">): AccountContext {
  return {
    id: account.id,
    ownerId: account.owner_id,
    teamId: account.team_id,
    zernioAccountId: account.zernio_account_id,
    channel: account.channel,
  };
}

/** La API key de Zernio de una cuenta (la del dueño o, si está compartida, la que RLS deja leer). */
async function readApiKey(chats: ChatsClient, accountId: string): Promise<string | null> {
  const { data } = await chats.from("channel_secrets").select("api_key_encrypted").eq("channel_account_id", accountId).maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.api_key_encrypted);
  } catch {
    return null;
  }
}

function syncSummary(result: SyncResult): string {
  const parts = [`${result.conversations} conversaciones`, `${result.messages} mensajes nuevos`];
  if (result.pending > 0) parts.push(`${result.pending} con el historial pendiente (volvé a sincronizar en un minuto)`);
  return parts.join(" · ");
}

// ── Conectar ─────────────────────────────────────────────────────────────────

const connectSchema = z.object({
  apiKey: z.string().trim().min(20, "La API key parece incompleta."),
});

/**
 * Conecta las cuentas de Instagram del workspace de Zernio de esta API key:
 * valida la key, registra UN webhook firmado con un secreto que generamos acá,
 * guarda todo cifrado y trae el historial. La API key y el secreto no vuelven al
 * cliente.
 */
export async function connectZernio(_prev: ChatActionState, formData: FormData): Promise<ChatActionState> {
  const user = await requireUser();
  const parsed = connectSchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "API key inválida." };
  const apiKey = parsed.data.apiKey;

  let accounts;
  try {
    accounts = (await listAccounts(apiKey, "instagram")).filter((account) => account.platform === "instagram");
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }
  if (accounts.length === 0) {
    return { ok: false, message: "Esa API key no tiene ninguna cuenta de Instagram conectada en Zernio. Conectala primero en el dashboard de Zernio." };
  }

  const supabase = await createClient();
  const chats = asChats(supabase);

  // Que no pise la conexión de otra persona: el unique de zernio_account_id protege la base,
  // acá se avisa con un mensaje que se entienda.
  for (const account of accounts) {
    const { data: existing } = await chats.from("channel_accounts").select("id, owner_id").eq("zernio_account_id", account.id).maybeSingle();
    if (existing && existing.owner_id !== user.id) {
      return { ok: false, message: `@${account.username ?? account.id} ya la conectó tu socio. Pedile que te comparta el inbox desde su Configuración.` };
    }
  }

  const webhookSecret = randomBytes(32).toString("hex");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const local = isLocalUrl(appUrl);

  // Reconexión: el webhook viejo se reemplaza por uno nuevo, sin dejar dos activos.
  const { data: previous } = await chats.from("channel_secrets").select("webhook_id").eq("owner_id", user.id).not("webhook_id", "is", null);
  const previousIds = [...new Set((previous ?? []).map((row) => row.webhook_id).filter((id): id is string => Boolean(id)))];

  let webhookId: string | null = null;
  if (!local) {
    try {
      webhookId = (
        await createWebhook(apiKey, {
          name: "SmokIA inbox",
          url: `${appUrl!.replace(/\/$/, "")}/api/zernio/webhook`,
          secret: webhookSecret,
          accountIds: accounts.map((account) => account.id),
        })
      ).id;
    } catch (error) {
      return { ok: false, message: `No se pudo registrar el webhook en Zernio. ${describeZernioError(error)}` };
    }
    for (const id of previousIds) {
      try {
        await deleteWebhook(apiKey, id);
      } catch {
        // Si ya no existe o no se puede borrar, no frena la reconexión.
      }
    }
  }

  const saved: Array<{ context: AccountContext; apiKey: string }> = [];
  for (const account of accounts) {
    const row = {
      owner_id: user.id,
      channel: "INSTAGRAM" as const,
      zernio_account_id: account.id,
      handle: account.username,
      display_name: account.displayName,
      login_method: "instagram_login",
      status: "ACTIVA" as const,
      status_detail: null,
    };
    const { data: existing } = await chats.from("channel_accounts").select("id, team_id").eq("zernio_account_id", account.id).eq("owner_id", user.id).maybeSingle();

    let accountRow: { id: string; team_id: string | null } | null = null;
    if (existing) {
      const { data } = await chats.from("channel_accounts").update(row).eq("id", existing.id).eq("owner_id", user.id).select("id, team_id").single();
      accountRow = data;
    } else {
      const { data, error } = await chats.from("channel_accounts").insert(row).select("id, team_id").single();
      if (error?.code === UNIQUE_VIOLATION) {
        return { ok: false, message: `@${account.username ?? account.id} ya está conectada por otro usuario.` };
      }
      accountRow = data;
    }
    if (!accountRow) return { ok: false, message: "No se pudo guardar la cuenta." };

    const { error: secretError } = await chats.from("channel_secrets").upsert(
      {
        owner_id: user.id,
        channel_account_id: accountRow.id,
        api_key_encrypted: encrypt(apiKey),
        webhook_secret_encrypted: encrypt(webhookSecret),
        webhook_id: webhookId,
      },
      { onConflict: "channel_account_id" },
    );
    if (secretError) return { ok: false, message: "No se pudo guardar la conexión." };

    saved.push({
      context: contextOf({ id: accountRow.id, owner_id: user.id, team_id: accountRow.team_id, channel: "INSTAGRAM", zernio_account_id: account.id }),
      apiKey,
    });
  }

  // Salud y primer traído del historial, cuenta por cuenta. Si el token de Meta está vencido
  // no se intenta: Zernio devolvería una lista vacía y parecería que no hay mensajes.
  const notes: string[] = [];
  for (const { context } of saved) {
    const health = await checkHealth(chats, context, apiKey);
    if (!health.ok) {
      notes.push(health.message);
      continue;
    }
    const result = await syncChannelAccount(chats, context, apiKey, { maxFetches: 25 });
    notes.push(result.error ? `No se pudo traer el historial: ${result.error}` : `Historial: ${syncSummary(result)}.`);
  }

  revalidateChats();
  const webhookNote = local
    ? "Estás en localhost: no se registró el webhook (Zernio no alcanza tu máquina). Los mensajes entran sólo al sincronizar; en producción llegan solos."
    : "Webhook registrado en Zernio.";
  return { ok: true, message: [`Conectada: ${accounts.map((a) => `@${a.username ?? a.id}`).join(", ")}.`, webhookNote, ...notes].join(" ") };
}

/** Consulta la salud en Zernio y la deja asentada en la cuenta. */
async function checkHealth(
  chats: ChatsClient,
  account: AccountContext,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const health = await getAccountHealth(apiKey, account.zernioAccountId);
    if (!health.tokenValid || health.status === "error") {
      const detail = health.issues[0] ?? "Meta invalidó el acceso a la cuenta.";
      await chats.from("channel_accounts").update({ status: "ERROR", status_detail: detail }).eq("id", account.id).eq("owner_id", account.ownerId);
      return { ok: false, message: `La cuenta necesita reconectarse en Zernio: ${detail}` };
    }
    if (health.canMessage === false) {
      const detail = "Falta el permiso de mensajes de Instagram (instagram_business_manage_messages). Reconectá la cuenta en Zernio y aceptá el acceso a mensajes.";
      await chats.from("channel_accounts").update({ status: "ERROR", status_detail: detail }).eq("id", account.id).eq("owner_id", account.ownerId);
      return { ok: false, message: detail };
    }
    await chats.from("channel_accounts").update({ status: "ACTIVA", status_detail: null }).eq("id", account.id).eq("owner_id", account.ownerId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `No se pudo consultar la salud de la cuenta. ${describeZernioError(error)}` };
  }
}

/**
 * Las conexiones hechas antes de §1.26 tienen el webhook sin los eventos de
 * etiquetas y de ejecuciones: se los suma sin reconectar. Si falla no frena la
 * sincronización (la próxima lo vuelve a intentar).
 */
async function refreshWebhookEvents(chats: ChatsClient, accountId: string, apiKey: string): Promise<string | null> {
  const { data } = await chats.from("channel_secrets").select("webhook_id").eq("channel_account_id", accountId).maybeSingle();
  if (!data?.webhook_id) return null;
  try {
    await updateWebhookEvents(apiKey, data.webhook_id);
    return null;
  } catch (error) {
    return `No se pudo actualizar el webhook de Zernio (${describeZernioError(error)}): las etiquetas llegan igual al sincronizar.`;
  }
}

// ── Sincronizar, probar, compartir, desconectar ──────────────────────────────

const idSchema = z.uuid();

/** Sólo el dueño de la cuenta: sincronizar escribe filas con su owner_id. */
async function ownedAccount(chats: ChatsClient, userId: string, accountId: string) {
  if (!idSchema.safeParse(accountId).success) return null;
  const { data } = await chats
    .from("channel_accounts")
    .select("id, owner_id, team_id, channel, zernio_account_id")
    .eq("id", accountId)
    .eq("owner_id", userId)
    .maybeSingle();
  return data;
}

export async function syncAccountNow(accountId: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const account = await ownedAccount(chats, user.id, accountId);
  if (!account) return { ok: false, message: "No se encontró la cuenta, o no es tuya." };

  const apiKey = await readApiKey(chats, account.id);
  if (!apiKey) return { ok: false, message: "No se pudo leer la API key guardada. Volvé a conectar Zernio." };

  const context = contextOf(account);
  const health = await checkHealth(chats, context, apiKey);
  if (!health.ok) {
    revalidateChats();
    return { ok: false, message: health.message };
  }

  const result = await syncChannelAccount(chats, context, apiKey, { maxFetches: 30 });
  if (result.error) {
    revalidateChats();
    return { ok: false, message: result.error };
  }

  // §1.26: etiquetas de los contactos y, si la conexión es vieja, los eventos nuevos del webhook.
  const tags = await syncContactTags(chats, context, apiKey);
  const webhookNote = await refreshWebhookEvents(chats, account.id, apiKey);
  revalidateChats();
  const notes = [`Listo: ${syncSummary(result)}.`];
  notes.push(tags.error ? `Etiquetas: ${tags.error}` : `Etiquetas actualizadas en ${tags.updated} conversaciones.`);
  if (webhookNote) notes.push(webhookNote);
  return { ok: true, message: notes.join(" ") };
}

export async function checkAccountHealthNow(accountId: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const account = await ownedAccount(chats, user.id, accountId);
  if (!account) return { ok: false, message: "No se encontró la cuenta, o no es tuya." };
  const apiKey = await readApiKey(chats, account.id);
  if (!apiKey) return { ok: false, message: "No se pudo leer la API key guardada. Volvé a conectar Zernio." };

  const health = await checkHealth(chats, contextOf(account), apiKey);
  revalidateChats();
  return health.ok ? { ok: true, message: "La cuenta está bien conectada y con permiso de mensajes." } : { ok: false, message: health.message };
}

export async function setChannelSharing(accountId: string, share: boolean): Promise<ChatActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const account = await ownedAccount(chats, user.id, accountId);
  if (!account) return { ok: false, message: "No se encontró la cuenta, o no es tuya." };

  const { error } = await chats.rpc("chats_set_sharing", { p_account: account.id, p_share: share });
  if (error) {
    return {
      ok: false,
      message: /equipo/i.test(error.message)
        ? "Tu usuario todavía no pertenece a ningún equipo. Hay que sembrar el equipo primero (SETUP.md)."
        : "No se pudo cambiar cómo se comparte el inbox.",
    };
  }
  revalidateChats();
  return { ok: true, message: share ? "Inbox compartido con tu equipo." : "Dejaste de compartir el inbox." };
}

export async function disconnectChannelAccount(accountId: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const account = await ownedAccount(chats, user.id, accountId);
  if (!account) return { ok: false, message: "No se encontró la cuenta, o no es tuya." };

  // El webhook es uno por conexión: sólo se borra en Zernio si ninguna otra cuenta lo usa.
  const { data: secret } = await chats.from("channel_secrets").select("api_key_encrypted, webhook_id").eq("channel_account_id", account.id).maybeSingle();
  if (secret?.webhook_id) {
    const { count } = await chats
      .from("channel_secrets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("webhook_id", secret.webhook_id)
      .neq("channel_account_id", account.id);
    if ((count ?? 0) === 0) {
      try {
        await deleteWebhook(decrypt(secret.api_key_encrypted), secret.webhook_id);
      } catch {
        // Si Zernio ya no lo tiene, no frena la desconexión.
      }
    }
  }

  // El borrado arrastra conversaciones, mensajes y secretos (on delete cascade).
  const { error } = await chats.from("channel_accounts").delete().eq("id", account.id).eq("owner_id", user.id);
  if (error) return { ok: false, message: "No se pudo desconectar la cuenta." };
  revalidateChats();
  return { ok: true, message: "Cuenta desconectada. Los mensajes guardados en SmokIA se borraron; en Zernio siguen." };
}

// ── Enviar ───────────────────────────────────────────────────────────────────

const clientIdSchema = z.string().trim().min(8).max(64);

const sendTextSchema = z.object({
  conversationId: z.uuid(),
  // Instagram acepta hasta 1000 caracteres por mensaje de texto.
  text: z.string().trim().min(1, "Escribí un mensaje.").max(1000, "Instagram acepta hasta 1000 caracteres por mensaje."),
  // Una por mensaje, la genera el compositor: reintentar el mismo envío no lo duplica.
  clientId: clientIdSchema,
});

/** Lo que devuelve un envío: el mensaje ya guardado, para reemplazar la burbuja optimista. */
export type SendResult = { ok: boolean; message: string; sent?: ChatMessageView };

type Outgoing =
  | { kind: "text"; text: string }
  /** Un guardado de las respuestas rápidas: audio, imagen o documento. */
  | { kind: "media"; type: "audio" | "image" | "file"; url: string; mime: string; label: string; filename: string | null };

const MEDIA_NOUN: Record<"audio" | "image" | "file", string> = { audio: "audio", image: "imagen", file: "documento" };

/**
 * Responde desde el CRM. Corre con el cliente con RLS del que escribe: si es el
 * socio, sólo puede hacerlo en una conversación que el dueño le compartió. La
 * ventana de 24 h / 7 días se calcula acá con la misma función que usa la UI, y
 * una respuesta fuera de la de 24 h lleva `HUMAN_AGENT` (sólo se permite porque
 * la manda una persona: también un audio, una imagen o un documento guardados, que se envían con un toque).
 */
async function deliver(conversationId: string, clientId: string, outgoing: Outgoing): Promise<SendResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const { data: conversation } = await chats.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (!conversation) return { ok: false, message: "No se encontró la conversación." };

  const { data: account } = await chats
    .from("channel_accounts")
    .select("id, zernio_account_id, status")
    .eq("id", conversation.channel_account_id)
    .maybeSingle();
  if (!account) return { ok: false, message: "No se encontró la cuenta de esta conversación." };
  if (account.status !== "ACTIVA") return { ok: false, message: "La cuenta está desconectada: reconectala en Zernio antes de responder." };

  const window = replyWindow(conversation.last_inbound_at);
  if (!canReply(window)) return { ok: false, message: windowLabel(window) };

  const apiKey = await readApiKey(chats, account.id);
  if (!apiKey) return { ok: false, message: "No se pudo leer la API key de Zernio de esta cuenta." };

  let platformMessageId: string | null = null;
  try {
    const sent = await sendMessage(apiKey, conversation.zernio_conversation_id, {
      accountId: account.zernio_account_id,
      message: outgoing.kind === "text" ? outgoing.text : "",
      ...(outgoing.kind === "media" ? { attachmentUrl: outgoing.url, attachmentType: outgoing.type } : {}),
      idempotencyKey: `smokia-${clientId}`,
      ...sendTagFields(window),
    });
    platformMessageId = sent.messageId;
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }

  const now = new Date().toISOString();
  const body = outgoing.kind === "text" ? outgoing.text : null;
  // El adjunto se guarda sin la URL firmada (vence en una hora): el hilo lo muestra por su tipo y su nombre.
  const attachments =
    outgoing.kind === "media" ? [{ type: outgoing.type, mimeType: outgoing.mime, ...(outgoing.filename ? { filename: outgoing.filename } : {}) }] : [];
  const row = {
    owner_id: conversation.owner_id,
    team_id: conversation.team_id,
    conversation_id: conversation.id,
    // Si Zernio no devolvió el id, una clave propia: el eco del webhook entra como otra fila
    // en el peor caso, pero el mensaje enviado nunca se pierde.
    platform_message_id: platformMessageId ?? `crm-${clientId}`,
    direction: "OUT" as const,
    origin: "CRM" as const,
    sent_by: user.id,
    body,
    attachments,
    delivery_status: "sent" as const,
    occurred_at: now,
  };

  let saved: ChatMessageView | undefined;
  const { data: inserted, error: insertError } = await chats.from("messages").insert(row).select(MESSAGE_COLUMNS).single();
  if (inserted) saved = inserted as ChatMessageView;
  if (insertError?.code === UNIQUE_VIOLATION) {
    // El eco del webhook llegó antes que esta fila: se la marca como enviada desde el CRM.
    const { data: echoed } = await chats
      .from("messages")
      .update({ origin: "CRM", sent_by: user.id })
      .eq("conversation_id", conversation.id)
      .eq("platform_message_id", row.platform_message_id)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();
    if (echoed) saved = echoed as ChatMessageView;
  } else if (insertError) {
    // El mensaje ya salió hacia Instagram; sólo falló dejar el registro.
    return { ok: true, message: "Enviado a Instagram, pero no se pudo guardar en el historial. Sincronizá para verlo." };
  }

  await chats
    .from("conversations")
    .update({ last_message_at: now, last_message_preview: previewOf(body, attachments as unknown as Json), unread_count: 0 })
    .eq("id", conversation.id);

  // Sólo el dueño de la cuenta puede escribir sobre SUS leads (RLS): si respondió el socio, no se espeja.
  if (conversation.lead_id && conversation.owner_id === user.id) {
    const mirrored = outgoing.kind === "media" ? `[${MEDIA_NOUN[outgoing.type]}] ${outgoing.label}` : outgoing.text;
    await mirrorReplyToLead(chats, user.id, conversation.lead_id, mirrored, now);
    // La ficha del lead muestra el contacto nuevo; la bandeja no se revalida: se actualiza sola.
    revalidatePath(`/leads/${conversation.lead_id}`);
  }

  return {
    ok: true,
    message: window.state === "human_agent" ? "Enviado (fuera de las 24 h, con etiqueta de agente humano)." : "Enviado.",
    sent: saved,
  };
}

/** Envía un texto escrito en el compositor. */
export async function sendChatText(input: { conversationId: string; text: string; clientId: string }): Promise<SendResult> {
  const parsed = sendTextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Mensaje inválido." };
  return deliver(parsed.data.conversationId, parsed.data.clientId, { kind: "text", text: parsed.data.text });
}

const sendSavedSchema = z.object({ conversationId: z.uuid(), quickReplyId: z.uuid(), clientId: clientIdSchema });

/** La URL firmada vive lo justo para que Zernio la descargue y se la pase a Instagram. */
const MEDIA_URL_TTL_S = 60 * 60;

/**
 * Manda un guardado de las respuestas rápidas (audio, imagen o documento) con
 * un toque. El archivo está en un bucket privado (`chat-audio` o `chat-files`):
 * se firma una URL de una hora con el cliente del que manda (RLS de Storage:
 * sólo su carpeta) y se le pasa a Zernio. Una imagen sale como imagen (se ve en
 * el chat) y un PDF como documento.
 */
export async function sendChatAttachment(input: { conversationId: string; quickReplyId: string; clientId: string }): Promise<SendResult> {
  const parsed = sendSavedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Respuesta guardada inválida." };
  const user = await requireUser();
  const supabase = await createClient();
  const chats = asChats(supabase);

  // `*`: las columnas de archivo no existen si falta su migración.
  const { data } = await chats.from("chat_quick_replies").select("*").eq("id", parsed.data.quickReplyId).eq("owner_id", user.id).maybeSingle();
  const reply = data as QuickReplyRow | null;
  const media =
    reply?.kind === "AUDIO" && reply.audio_path
      ? { bucket: "chat-audio", path: reply.audio_path, mime: reply.audio_mime ?? "audio/mp4", type: "audio" as const, filename: null }
      : reply?.kind === "ARCHIVO" && reply.file_path
        ? {
            bucket: "chat-files",
            path: reply.file_path,
            mime: reply.file_mime ?? "application/pdf",
            type: fileKindOf(reply.file_mime) === "image" ? ("image" as const) : ("file" as const),
            filename: reply.file_name ?? null,
          }
        : null;
  if (!reply || !media) return { ok: false, message: "No se encontró ese guardado: puede que lo hayas borrado." };

  const { data: signed, error } = await supabase.storage.from(media.bucket).createSignedUrl(media.path, MEDIA_URL_TTL_S);
  if (error || !signed?.signedUrl) return { ok: false, message: `No se pudo preparar ${media.type === "audio" ? "el audio" : "el archivo"} para mandarlo.` };

  const result = await deliver(parsed.data.conversationId, parsed.data.clientId, {
    kind: "media",
    type: media.type,
    url: signed.signedUrl,
    mime: media.mime,
    label: reply.title,
    filename: media.filename,
  });
  if (result.ok) {
    await chats.from("chat_quick_replies").update({ use_count: reply.use_count + 1 }).eq("id", reply.id).eq("owner_id", user.id);
  }
  return result;
}

/**
 * La respuesta cuenta como contacto del lead: queda en `lead_messages` (canal
 * INSTAGRAM, del vendedor, confirmada) como cualquier mensaje que se registra a
 * mano, así alimenta el seguimiento y las métricas de §1.17, y se actualiza la
 * última fecha de contacto.
 */
async function mirrorReplyToLead(chats: ChatsClient, ownerId: string, leadId: string, text: string, at: string) {
  await chats.from("lead_messages").insert({
    owner_id: ownerId,
    lead_id: leadId,
    sender: "VENDEDOR",
    channel: "INSTAGRAM",
    content: text,
    confirmed: true,
    confirmed_at: at,
    occurred_at: at,
    generated_by: "HUMANO",
    kind: "RESPUESTA",
  });
  await chats.from("leads").update({ last_contacted_at: at }).eq("id", leadId).eq("owner_id", ownerId);
}

// ── Estado de la conversación ────────────────────────────────────────────────

/**
 * Pone en cero los no leídos. Es sólo de SmokIA: no le manda a la persona un
 * "visto" (Zernio puede hacerlo, pero abrir un chat para leerlo no debería
 * avisarle a nadie).
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(conversationId).success) return;
  const chats = asChats(await createClient());
  await chats.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).gt("unread_count", 0);
  // Sin revalidatePath: la bandeja ya lo puso en 0 (optimista) y Realtime avisa a los demás.
}

export async function setConversationArchived(conversationId: string, archived: boolean): Promise<ChatActionResult> {
  await requireUser();
  if (!idSchema.safeParse(conversationId).success) return { ok: false, message: "Conversación inválida." };
  const chats = asChats(await createClient());
  const { error } = await chats
    .from("conversations")
    .update({ status: archived ? "ARCHIVADA" : "ACTIVA" })
    .eq("id", conversationId);
  if (error) return { ok: false, message: "No se pudo cambiar el estado." };
  return { ok: true, message: archived ? "Conversación archivada." : "Conversación restaurada." };
}

// ── Leads ────────────────────────────────────────────────────────────────────

async function ownedConversation(chats: ChatsClient, userId: string, conversationId: string): Promise<ConversationRow | { error: string }> {
  if (!idSchema.safeParse(conversationId).success) return { error: "Conversación inválida." };
  const { data } = await chats.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  if (!data) return { error: "No se encontró la conversación." };
  // Los leads son de cada usuario (RLS): sólo el dueño de la cuenta puede enlazar los suyos.
  if (data.owner_id !== userId) return { error: "Sólo el dueño de la cuenta puede enlazar esta conversación con un lead." };
  return data;
}

/** Busca entre los leads del usuario para enlazar una conversación a mano. */
export async function searchLeadsForLink(query: string): Promise<Array<{ id: string; name: string; status: string }>> {
  await requireUser();
  const term = query.replace(/[,()*%\\:]/g, " ").trim().slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, status")
    .ilike("name", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(8);
  return (data ?? []).map((lead) => ({ id: lead.id, name: lead.name, status: lead.status }));
}

export async function linkConversationToLead(conversationId: string, leadId: string | null): Promise<ChatActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const conversation = await ownedConversation(chats, user.id, conversationId);
  if ("error" in conversation) return { ok: false, message: conversation.error };

  if (leadId !== null) {
    if (!idSchema.safeParse(leadId).success) return { ok: false, message: "Lead inválido." };
    const { data: lead } = await chats.from("leads").select("id").eq("id", leadId).eq("owner_id", user.id).maybeSingle();
    if (!lead) return { ok: false, message: "No se encontró ese lead." };
  }

  const { error } = await chats.from("conversations").update({ lead_id: leadId }).eq("id", conversation.id).eq("owner_id", user.id);
  if (error) return { ok: false, message: "No se pudo enlazar." };
  revalidateChats(leadId ?? conversation.lead_id);
  return { ok: true, message: leadId ? "Conversación enlazada al lead." : "Se quitó el enlace con el lead." };
}

/**
 * Crea (o encuentra) el lead de esta persona con el mismo alta que usa el embudo
 * de Instagram (§1.21 / ManyChat): cae en "Instagram orgánico" como "Respondió"
 * y deja una nota en su timeline. Si ya había un lead con ese @, lo enlaza.
 */
export async function createLeadFromConversation(conversationId: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const chats = asChats(supabase);
  const conversation = await ownedConversation(chats, user.id, conversationId);
  if ("error" in conversation) return { ok: false, message: conversation.error };
  if (conversation.lead_id) return { ok: false, message: "Esta conversación ya tiene un lead." };
  if (!conversation.participant_handle) {
    return {
      ok: false,
      message: "Todavía no tenemos el @ de esta persona (Zernio lo manda con su próximo mensaje). Enlazala a un lead existente o esperá a que escriba.",
    };
  }

  const result = await upsertInstagramLead(supabase, user.id, "crm", {
    manychatId: null,
    handle: conversation.participant_handle,
    name: conversation.participant_name,
    stage: "respondio",
    fields: {},
    utm: {},
    zernioContactId: null,
    signal: null,
  });
  if (!result.ok) return { ok: false, message: result.message };

  await chats.from("conversations").update({ lead_id: result.lead.id }).eq("id", conversation.id).eq("owner_id", user.id);
  revalidatePath("/leads/lista");
  revalidatePath("/leads");
  revalidateChats(result.lead.id);
  return {
    ok: true,
    message: result.created ? "Lead creado y enlazado." : "Ya existía un lead con ese @: quedó enlazado.",
    leadId: result.lead.id,
  };
}

// ── Lecturas para la bandeja (cliente) ───────────────────────────────────────
// La bandeja es una isla de cliente: elegir un chat no navega, pide el hilo con
// estas acciones y lo guarda en memoria. Leen con RLS, igual que la página.

const scopeSchema = z.enum(["activas", "archivadas"]);

export async function loadConversation(conversationId: string): Promise<ConversationDetail | null> {
  await requireUser();
  if (!idSchema.safeParse(conversationId).success) return null;
  return getConversationDetail(conversationId);
}

export async function loadConversationList(scope: ConversationScope, search?: string): Promise<InboxList> {
  await requireUser();
  const parsedScope = scopeSchema.safeParse(scope);
  return listConversations(parsedScope.success ? parsedScope.data : "activas", typeof search === "string" ? search.slice(0, 60) : undefined);
}

export async function loadOlderMessages(conversationId: string, before: string): Promise<{ messages: ChatMessageView[]; hasOlder: boolean }> {
  await requireUser();
  if (!idSchema.safeParse(conversationId).success || Number.isNaN(Date.parse(before))) return { messages: [], hasOlder: false };
  return listOlderMessages(conversationId, new Date(before).toISOString());
}

// ── Sincronización automática (cliente) ──────────────────────────────────────
// Mientras la bandeja está abierta, la isla de cliente pide esto cada tanto
// (components/leads/chats/use-inbox-realtime.ts) para traer de Zernio lo que
// el webhook no haya avisado todavía: en desarrollo (Zernio no alcanza
// `localhost`, CLAUDE.md §11) es la única vía para que entren mensajes sin
// tocar "Sincronizar" a mano; en producción es la red de seguridad si algún
// webhook se perdió. A propósito liviano (maxFetches chico) para poder correr
// cada 20 s sin pasarse con la API de Zernio; las etiquetas y el refresco de
// eventos del webhook van aparte, limitados en frecuencia (ver más abajo).

const POLL_MAX_FETCHES = 15;

// Las etiquetas (listar contactos de Zernio, hasta 10 páginas) son más pesadas
// que los mensajes: se piden a lo sumo una vez por minuto por cuenta. El mapa
// vive en la instancia del servidor; si otra instancia lo repite no pasa nada,
// la sincronización es idempotente.
const TAG_SYNC_EVERY_MS = 60_000;
const lastTagSync = new Map<string, number>();
// El webhook se actualiza una vez por cuenta y por instancia: así las conexiones
// hechas antes de §1.26 reciben los eventos de etiquetas sin apretar "Sincronizar".
const webhookRefreshed = new Set<string>();

export async function pollInboxNow(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  // RLS: sólo las cuentas propias y las que el socio compartió.
  const { data: accounts } = await chats
    .from("channel_accounts")
    .select("id, owner_id, team_id, channel, zernio_account_id, status")
    .eq("channel", "INSTAGRAM")
    .eq("status", "ACTIVA");
  if (!accounts || accounts.length === 0) return { ok: true };

  // La cuenta puede ser propia o estar compartida por un socio. El cliente
  // normal ya hizo esa autorización mediante RLS arriba, pero la ingesta de
  // un DM entrante siempre escribe con el owner de la cuenta. Un socio sólo
  // tiene permiso RLS para enviar sus propios mensajes salientes; si usáramos
  // `chats` acá, no podría recuperar un webhook perdido. Para una cuenta
  // propia conservamos RLS (también permite probar en localhost sin service
  // role); el admin sólo se crea si hace falta una cuenta compartida.
  let admin: ChatsClient | null = null;
  if (accounts.some((account) => account.owner_id !== user.id)) {
    try {
      admin = asChats(createAdminClient());
    } catch {
      return { ok: false };
    }
  }

  let ok = true;
  for (const account of accounts) {
    try {
      const apiKey = await readApiKey(chats, account.id);
      if (!apiKey) continue;
      const writer = account.owner_id === user.id ? chats : admin;
      if (!writer) {
        ok = false;
        continue;
      }
      const context = contextOf(account);
      const result = await syncChannelAccount(writer, context, apiKey, { maxFetches: POLL_MAX_FETCHES });
      if (result.error) {
        ok = false;
        continue;
      }
      if (!webhookRefreshed.has(account.id)) {
        webhookRefreshed.add(account.id);
        await refreshWebhookEvents(chats, account.id, apiKey);
      }
      const last = lastTagSync.get(account.id) ?? 0;
      if (Date.now() - last >= TAG_SYNC_EVERY_MS) {
        lastTagSync.set(account.id, Date.now());
        await syncContactTags(writer, context, apiKey);
      }
    } catch {
      ok = false;
    }
  }
  return { ok };
}
