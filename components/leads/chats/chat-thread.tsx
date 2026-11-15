"use client";

import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, BadgeCheck, Clock, Loader2, PanelRight, Paperclip, RotateCcw } from "lucide-react";
import { Fragment, memo } from "react";

import { Avatar } from "@/components/leads/chats/conversation-list";
import { MessageComposer, type ComposerQuickReplies } from "@/components/leads/chats/message-composer";
import { ThreadScroller } from "@/components/leads/chats/thread-scroller";
import { IconButton } from "@/components/leads/ui/button";
import { chatDayKey, formatChatClock, formatChatDay, readAttachments } from "@/lib/chats/format";
import type { ThreadMessage } from "@/lib/chats/inbox";
import type { ConversationDetail } from "@/lib/chats/queries";
import { canReply, formatWindowLeft, replyWindow, windowLabel } from "@/lib/chats/window";
import type { Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ProfileView = { isFollower: boolean | null; followerCount: number | null; isVerified: boolean | null };

function readProfile(value: Json | null): ProfileView {
  const profile = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bool = (key: string) => (typeof profile[key] === "boolean" ? (profile[key] as boolean) : null);
  return {
    isFollower: bool("isFollower"),
    isVerified: bool("isVerified"),
    followerCount: typeof profile.followerCount === "number" ? profile.followerCount : null,
  };
}

/** Quién escribió un mensaje nuestro, para que los dos socios sepan quién respondió. */
function senderLabel(message: ThreadMessage, members: Record<string, string>, currentUserId: string): string | null {
  if (message.direction === "IN") return null;
  switch (message.origin) {
    case "CRM": {
      if (message.sent_by === currentUserId) return "Vos";
      return (message.sent_by && members[message.sent_by]) || "Alguien del equipo";
    }
    case "AUTOMATIZACION":
      return "Automatización";
    case "ZERNIO":
      return "Zernio";
    case "APP":
      return "Desde Instagram u otra app";
    default:
      return null;
  }
}

function deliveryLabel(status: ThreadMessage["delivery_status"]): { text: string; danger: boolean } | null {
  switch (status) {
    case "read":
    case "played":
      return { text: "Leído", danger: false };
    case "delivered":
      return { text: "Entregado", danger: false };
    case "failed":
      return { text: "No se pudo enviar", danger: true };
    default:
      return null;
  }
}

const Bubble = memo(function Bubble({
  message,
  who,
  onRetry,
}: {
  message: ThreadMessage;
  who: string | null;
  onRetry: (message: ThreadMessage) => void;
}) {
  const outgoing = message.direction === "OUT";
  const attachments = readAttachments(message.attachments);
  const delivery = outgoing && !message.local ? deliveryLabel(message.delivery_status) : null;

  return (
    <div className={cn("flex flex-col gap-1", outgoing ? "items-end" : "items-start", message.local === "sending" && "opacity-70")}>
      <div
        className={cn(
          "max-w-[min(34rem,85%)] rounded-lm-md px-3 py-2 text-[13.5px] leading-[1.45] break-words whitespace-pre-wrap",
          outgoing ? "bg-lm-signal-soft text-lm-ink" : "bg-lm-raised text-lm-ink",
          message.local === "failed" && "ring-1 ring-lm-danger",
        )}
      >
        {message.deleted ? (
          <span className="text-lm-ink-3 italic">La persona eliminó este mensaje.</span>
        ) : (
          <>
            {message.body ? <p>{message.body}</p> : null}
            {attachments.map((attachment, index) => {
              const spaced = message.body || index > 0 ? "mt-1.5" : "";
              if (attachment.url && attachment.type === "audio") {
                return <audio key={index} controls preload="none" src={attachment.url} className={cn("h-9 w-64 max-w-full", spaced)} />;
              }
              if (attachment.url && attachment.type === "image") {
                return (
                  <a key={index} href={attachment.url} target="_blank" rel="noopener noreferrer" className={cn("block", spaced)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attachment.url} alt="Imagen del mensaje" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="max-h-56 rounded-lm-sm object-cover" />
                  </a>
                );
              }
              return (
                <p key={index} className={cn("flex items-center gap-1.5 text-[12.5px]", spaced)}>
                  <Paperclip className="size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                  {attachment.url ? (
                    <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-lm-signal-text underline-offset-2 hover:underline">
                      {attachment.label}
                    </a>
                  ) : (
                    <span>{attachment.label}</span>
                  )}
                </p>
              );
            })}
            {!message.body && attachments.length === 0 ? <span className="text-lm-ink-3 italic">Mensaje sin contenido que se pueda mostrar.</span> : null}
          </>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 px-1 font-mono text-[11px] text-lm-ink-3">
        <span>{formatChatClock(message.occurred_at)}</span>
        {who ? <span className="font-lm-sans">· {who}</span> : null}
        {message.edited && !message.deleted ? <span className="font-lm-sans">· editado</span> : null}
        {message.standby ? <span className="font-lm-sans">· hilo de otra app</span> : null}
        {message.local === "sending" ? <span className="font-lm-sans">· Enviando…</span> : null}
        {delivery ? <span className={cn("font-lm-sans", delivery.danger && "text-lm-danger")}>· {delivery.text}</span> : null}
      </p>
      {message.local === "failed" ? (
        <p className="flex max-w-[min(34rem,85%)] flex-wrap items-center justify-end gap-x-2 px-1 text-right text-[12px] text-lm-danger" role="alert">
          {message.error ?? "No se pudo enviar."}
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="inline-flex items-center gap-1 font-medium text-lm-ink underline-offset-2 hover:underline focus-visible:lm-focus"
          >
            <RotateCcw className="size-3" strokeWidth={1.5} />
            Reintentar
          </button>
        </p>
      ) : null}
    </div>
  );
});

export type ThreadState = {
  detail: ConversationDetail;
  messages: ThreadMessage[];
  hasOlder: boolean;
  loadingOlder?: boolean;
};

/**
 * El hilo de una conversación: encabezado con quién es y cuánto queda para
 * responder, mensajes agrupados por día (hora de Argentina) y el compositor.
 * Es presentación: el envío optimista, el caché y Realtime los maneja
 * `InboxClient`.
 */
export function ChatThread({
  thread,
  onSend,
  onRetry,
  onLoadOlder,
  onArchive,
  onBack,
  onTogglePanel,
  panelOpen,
  quickReplies,
  now,
}: {
  thread: ThreadState;
  onSend: (text: string) => void;
  onRetry: (message: ThreadMessage) => void;
  onLoadOlder: () => void;
  onArchive: () => void;
  onBack: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  quickReplies: ComposerQuickReplies;
  now: number;
}) {
  const { detail, messages } = thread;
  const { conversation, account, members, currentUserId } = detail;
  const reply = replyWindow(conversation.last_inbound_at, now);
  const profile = readProfile(conversation.participant_profile);
  const title = conversation.participant_name || (conversation.participant_handle ? `@${conversation.participant_handle}` : "Sin nombre");
  const first = messages[0];
  const last = messages[messages.length - 1];
  const archived = conversation.status === "ARCHIVADA";

  const accountDown = account.status !== "ACTIVA";
  const disabledReason = accountDown
    ? `La cuenta @${account.handle ?? "instagram"} está desconectada: ${account.status_detail ?? "reconectala en Zernio"}. No se puede responder hasta entonces.`
    : !canReply(reply)
      ? windowLabel(reply)
      : null;
  const notice = reply.state === "human_agent" ? windowLabel(reply) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-lm-line px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconButton size="sm" aria-label="Volver a los chats" onClick={onBack} className="border-transparent bg-transparent lg:hidden">
            <ArrowLeft className="size-4" strokeWidth={1.5} />
          </IconButton>
          <Avatar name={conversation.participant_name} handle={conversation.participant_handle} picture={conversation.participant_picture} size="lg" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate font-lm-sans text-[15px] font-semibold text-lm-ink">
              <span className="truncate">{title}</span>
              {profile.isVerified ? <BadgeCheck className="size-4 shrink-0 text-lm-info" strokeWidth={1.5} aria-label="Verificado" /> : null}
            </h2>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-lm-ink-3">
              {conversation.participant_handle ? <span>@{conversation.participant_handle}</span> : null}
              {profile.isFollower === true ? <span>Te sigue</span> : null}
              {profile.followerCount != null ? <span className="font-mono">{profile.followerCount.toLocaleString("es-AR")} seguidores</span> : null}
              <span
                className={cn("inline-flex items-center gap-1", reply.state === "open" && reply.msLeft <= 2 * 3_600_000 && "text-lm-danger")}
                title="Ventana para responder, contada desde su último mensaje"
              >
                <Clock className="size-3" strokeWidth={1.5} />
                {reply.state === "open"
                  ? `Podés responder · ${formatWindowLeft(reply.msLeft)}`
                  : reply.state === "human_agent"
                    ? `Sólo respuesta humana · ${formatWindowLeft(reply.msLeft)}`
                    : "No se puede responder"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton size="sm" aria-label={archived ? "Volver a la bandeja" : "Archivar (E)"} title={archived ? "Volver a la bandeja" : "Archivar · E"} onClick={onArchive}>
            {archived ? <ArchiveRestore className="size-3.5" strokeWidth={1.5} /> : <Archive className="size-3.5" strokeWidth={1.5} />}
          </IconButton>
          <IconButton
            size="sm"
            aria-label={panelOpen ? "Ocultar el panel del contacto" : "Ver el panel del contacto"}
            aria-pressed={panelOpen}
            title="Contacto, etiquetas y seguimiento"
            onClick={onTogglePanel}
            className={cn(panelOpen && "bg-lm-raised text-lm-ink")}
          >
            <PanelRight className="size-3.5" strokeWidth={1.5} />
          </IconButton>
        </div>
      </header>

      {conversation.thread_owner === "other" ? (
        <p className="flex items-start gap-2 border-b border-lm-line bg-lm-surface px-4 py-2 text-xs text-lm-ink-2" role="status">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
          Otra app (ManyChat o el Inbox de Instagram) es dueña de este hilo: ves los mensajes, pero Instagram no deja responder desde acá hasta que lo devuelva.
        </p>
      ) : null}

      <ThreadScroller
        conversationId={conversation.id}
        firstMessageKey={first?.id ?? "vacio"}
        lastMessageKey={last?.id ?? "vacio"}
        lastIsOwn={last?.direction === "OUT" && Boolean(last.local)}
      >
        {thread.hasOlder ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={thread.loadingOlder}
              className="inline-flex h-7 items-center gap-1.5 rounded-lm-sm border border-lm-line px-2.5 font-lm-sans text-xs text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus disabled:opacity-60"
            >
              {thread.loadingOlder ? <Loader2 className="size-3 animate-spin" /> : null}
              Ver anteriores
            </button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-lm-ink-3">Todavía no hay mensajes guardados de esta conversación. Probá sincronizar desde Configuración.</p>
        ) : (
          <MessageGroups messages={messages} members={members} currentUserId={currentUserId} onRetry={onRetry} />
        )}
      </ThreadScroller>

      <MessageComposer
        key={conversation.id}
        conversationId={conversation.id}
        disabledReason={disabledReason}
        notice={notice}
        onSend={onSend}
        quickReplies={quickReplies}
        participantName={conversation.participant_name}
        participantHandle={conversation.participant_handle}
      />
    </div>
  );
}

/** Los mensajes por día. `content-visibility` deja de pintar los días que no están a la vista. */
function MessageGroups({
  messages,
  members,
  currentUserId,
  onRetry,
}: {
  messages: ThreadMessage[];
  members: Record<string, string>;
  currentUserId: string;
  onRetry: (message: ThreadMessage) => void;
}) {
  const groups: Array<{ key: string; label: string; items: ThreadMessage[] }> = [];
  for (const message of messages) {
    const key = chatDayKey(message.occurred_at);
    const group = groups[groups.length - 1];
    if (group && group.key === key) group.items.push(message);
    else groups.push({ key, label: formatChatDay(message.occurred_at), items: [message] });
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, index) => (
        <section
          key={group.key}
          className={cn("flex flex-col gap-3", index < groups.length - 1 && "[contain-intrinsic-size:auto_480px] [content-visibility:auto]")}
          aria-label={group.label}
        >
          <p className="py-1 text-center font-lm-sans text-[11px] font-semibold tracking-[0.08em] text-lm-ink-3 uppercase">{group.label}</p>
          {group.items.map((message) => (
            <Fragment key={message.id}>
              <Bubble message={message} who={senderLabel(message, members, currentUserId)} onRetry={onRetry} />
            </Fragment>
          ))}
        </section>
      ))}
    </div>
  );
}
