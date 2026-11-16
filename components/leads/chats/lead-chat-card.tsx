import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { formatChatTime, readAttachments } from "@/lib/chats/format";
import type { ChatMessageView, ConversationListItem } from "@/lib/chats/queries";
import { cn } from "@/lib/utils";

function lineOf(message: ChatMessageView): string {
  if (message.deleted) return "Mensaje eliminado";
  const text = (message.body ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 90 ? `${text.slice(0, 89)}…` : text;
  const attachment = readAttachments(message.attachments)[0];
  return attachment ? `[${attachment.label.toLowerCase()}]` : "";
}

/**
 * Los últimos mensajes de Instagram de este lead en la ficha, y la entrada al
 * chat completo (donde se responde). Sólo aparece si hay una conversación
 * enlazada: la ficha de un lead de otro canal queda igual que antes.
 */
export function LeadChatCard({
  conversation,
  messages,
}: {
  conversation: ConversationListItem;
  messages: ChatMessageView[];
}) {
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <ul className="flex flex-col gap-1.5">
        {messages.map((message) => (
          <li key={message.id} className={cn("flex flex-col", message.direction === "OUT" ? "items-end" : "items-start")}>
            <span
              className={cn(
                "max-w-full truncate rounded-lm-sm px-2 py-1 text-[12.5px]",
                message.direction === "OUT" ? "bg-lm-signal-soft text-lm-ink" : "bg-lm-raised text-lm-ink",
              )}
            >
              {lineOf(message) || "…"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 text-xs text-lm-ink-3">
        <span>{conversation.last_message_at ? `Último: ${formatChatTime(conversation.last_message_at)}` : ""}</span>
        {conversation.unread_count > 0 ? (
          <span className="font-mono text-lm-signal-text">{conversation.unread_count} sin leer</span>
        ) : null}
      </div>
      <Link
        href={`/leads/chats?c=${conversation.id}`}
        className="inline-flex h-8 items-center justify-center gap-2 rounded-lm-sm border border-lm-line-strong bg-lm-surface px-3 font-lm-sans text-[13px] font-medium text-lm-ink hover:bg-lm-raised"
      >
        <MessageSquare className="size-3.5" strokeWidth={1.5} />
        Abrir el chat
      </Link>
    </div>
  );
}
