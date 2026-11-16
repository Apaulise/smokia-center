// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` explícito
// (CLAUDE.md §4). Este módulo sólo LEE: no manda mensajes a Instagram ni a nadie.
// Un agente que quiera responder propone un borrador a la cola de aprobaciones
// (POST /api/automation/ops, type "approval", channel "instagram") y el envío lo
// hace una persona desde la bandeja de Chats.

import { z } from "zod";

import { asChats, type ChatsClient } from "@/lib/chats/db";
import { readAttachments } from "@/lib/chats/format";
import { replyWindow } from "@/lib/chats/window";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<Database>;

export const listChatsQuerySchema = z.object({
  unread: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;

const CONVERSATION_COLUMNS =
  "id, channel, participant_handle, participant_name, lead_id, status, last_message_at, last_message_preview, last_inbound_at, unread_count, thread_owner";

type ConversationColumns = {
  id: string;
  channel: string;
  participant_handle: string | null;
  participant_name: string | null;
  lead_id: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  thread_owner: string | null;
};

function toApiConversation(row: ConversationColumns) {
  const window = replyWindow(row.last_inbound_at);
  return {
    id: row.id,
    channel: row.channel,
    handle: row.participant_handle,
    name: row.participant_name,
    leadId: row.lead_id,
    status: row.status,
    lastMessageAt: row.last_message_at,
    preview: row.last_message_preview,
    unread: row.unread_count,
    /** `open` (24 h), `human_agent` (hasta 7 días, sólo una persona), `closed` o `none`. */
    replyWindow: { state: window.state, expiresAt: window.expiresAt },
    /** `other` = ManyChat u otra app es dueña del hilo y no se puede responder. */
    threadOwner: row.thread_owner,
  };
}

export async function listChatsForAutomation(admin: Admin, ownerId: string, query: ListChatsQuery) {
  const chats = asChats(admin);
  let request = chats
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("status", "ACTIVA")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(query.limit);
  if (query.unread === "1") request = request.gt("unread_count", 0);

  const { data, error } = await request;
  if (error) return { ok: false as const };
  return { ok: true as const, chats: (data as ConversationColumns[]).map(toApiConversation) };
}

type MessageColumns = {
  id: string;
  direction: string;
  origin: string;
  body: string | null;
  attachments: unknown;
  deleted: boolean;
  occurred_at: string;
};

export async function getLeadChatForAutomation(admin: Admin, ownerId: string, leadId: string, limit = 50) {
  const { data: lead } = await admin.from("leads").select("id").eq("id", leadId).eq("owner_id", ownerId).maybeSingle();
  if (!lead) return { ok: false as const, reason: "not_found" as const };

  const chats: ChatsClient = asChats(admin);
  const { data: conversations, error } = await chats
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(3);
  if (error) return { ok: false as const, reason: "error" as const };

  const result = [];
  for (const conversation of (conversations ?? []) as ConversationColumns[]) {
    const { data: messages } = await chats
      .from("messages")
      .select("id, direction, origin, body, attachments, deleted, occurred_at")
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversation.id)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    result.push({
      ...toApiConversation(conversation),
      messages: ((messages ?? []) as MessageColumns[])
        .slice()
        .reverse()
        .map((message) => ({
          id: message.id,
          direction: message.direction === "IN" ? "incoming" : "outgoing",
          origin: message.origin,
          text: message.deleted ? null : message.body,
          attachments: message.deleted ? [] : readAttachments(message.attachments as never).map((item) => ({ type: item.type, label: item.label })),
          deleted: message.deleted,
          at: message.occurred_at,
        })),
    });
  }
  return { ok: true as const, conversations: result };
}
