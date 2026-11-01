import { occurredWindow } from "@/lib/automation/occurred-at";
import { isSameMessage } from "@/lib/automation/message-identity";
import type { LeadsClient } from "@/lib/leads/contact";
import type { Json } from "@/lib/supabase/database.types";

export interface StoredMessageHit {
  id: string;
  occurred_at: string;
  analysis: Json | null;
}

/**
 * Misma fila si el canal, el texto (sin importar espacios de más) y la hora
 * caen en ±2 minutos. La ventana usa el índice (owner, lead, occurred_at).
 */
export async function findDuplicateMessage(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  sender: "VENDEDOR" | "LEAD",
  channel: "WHATSAPP" | "EMAIL" | "INSTAGRAM",
  content: string,
  occurredAt: string,
): Promise<StoredMessageHit | null> {
  const window = occurredWindow(occurredAt);
  const { data, error } = await admin
    .from("lead_messages")
    .select("id, content, channel, occurred_at, analysis")
    .eq("owner_id", ownerId)
    .eq("lead_id", leadId)
    .eq("sender", sender)
    .eq("channel", channel)
    .gte("occurred_at", window.from)
    .lte("occurred_at", window.to)
    .limit(20);
  if (error) throw error;
  const hit = (data ?? []).find((row) =>
    isSameMessage(
      { content: row.content, channel: row.channel, occurredAt: row.occurred_at },
      { content, channel, occurredAt },
    ),
  );
  if (!hit) return null;
  return { id: hit.id, occurred_at: hit.occurred_at, analysis: hit.analysis };
}
