"use client";

import { BookmarkPlus, Loader2, Send, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { QuickRepliesPanel, type QuickReplyActions } from "@/components/leads/chats/quick-replies-panel";
import { Button } from "@/components/ui/button";
import type { QuickReplyKind } from "@/lib/chats/db";
import { fillQuickReply } from "@/lib/chats/inbox";
import { matchQuickReplies, QUICK_REPLY_SECTIONS, sendableNoun, type QuickReplyView } from "@/lib/chats/quick-replies";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 1000;
/** Lo que dura el "Deshacer" de un guardado mandado con un toque, antes de salir de verdad. */
const UNDO_MS = 4000;

/** Borradores por conversación: cambiar de chat no pierde lo que se estaba escribiendo. */
const drafts = new Map<string, string>();

export type ComposerQuickReplies = QuickReplyActions & {
  ready: boolean;
  items: QuickReplyView[];
  /** Manda un audio, una imagen o un documento guardados (después del "Deshacer"). */
  onSendAttachment: (reply: QuickReplyView) => void;
  /** Se usó una respuesta (para ordenar por uso). */
  onUsed: (reply: QuickReplyView) => void;
  /** Se abrió el panel: renueva las vistas previas si están por vencer. */
  onOpen: () => void;
};

/**
 * El compositor del hilo. Si la conversación no se puede responder (ventana
 * cerrada, cuenta desconectada) no se dibuja el campo: se explica por qué. El
 * servidor vuelve a validar la ventana igual.
 *
 * Enviar es optimista: el texto sale del campo en el acto y la burbuja aparece
 * con "Enviando…" (lo dibuja `InboxClient`). Si falla, la burbuja ofrece
 * reintentar con la misma key, así que no se duplica.
 *
 * Respuestas rápidas: `/` al principio del campo (o el botón del rayo) abre el
 * panel, con sus tres secciones (textos, audios, documentos/imágenes). Un texto
 * se inserta con `{{nombre}}` ya reemplazado, para revisarlo antes de mandar;
 * un audio, una imagen o un documento salen con un toque, con 4 s para deshacer.
 */
export function MessageComposer({
  conversationId,
  disabledReason,
  notice,
  onSend,
  quickReplies,
  participantName,
  participantHandle,
}: {
  conversationId: string;
  /** Si viene, no se puede responder y es el motivo. */
  disabledReason: string | null;
  /** Aviso que no bloquea (p. ej. "sólo mensajes escritos por una persona"). */
  notice: string | null;
  onSend: (text: string) => void;
  quickReplies: ComposerQuickReplies;
  participantName: string | null;
  participantHandle: string | null;
}) {
  const [text, setText] = useState(() => drafts.get(conversationId) ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<QuickReplyKind>("TEXTO");
  const [highlight, setHighlight] = useState(0);
  const [pendingSend, setPendingSend] = useState<QuickReplyView | null>(null);
  const [saveState, setSaveState] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "/texto" al principio del campo filtra el panel; el botón lo abre sin filtro.
  const slashQuery = text.startsWith("/") && !text.includes("\n") ? text.slice(1) : null;
  const showPicker = quickReplies.ready && (pickerOpen || slashQuery !== null);
  const query = slashQuery ?? "";

  // Las coincidencias de cada sección. Con un filtro escrito, si la sección elegida
  // quedó vacía se muestra la primera que tenga algo: no hay que ir a buscarla.
  const sections = useMemo(() => {
    const empty: Record<QuickReplyKind, QuickReplyView[]> = { TEXTO: [], AUDIO: [], ARCHIVO: [] };
    if (!showPicker) return empty;
    for (const reply of matchQuickReplies(quickReplies.items, query)) empty[reply.kind]?.push(reply);
    return empty;
  }, [showPicker, quickReplies.items, query]);
  const activeTab = query && sections[tab].length === 0 ? (QUICK_REPLY_SECTIONS.find((section) => sections[section.kind].length > 0)?.kind ?? tab) : tab;
  const matches = sections[activeTab];
  const counts = { TEXTO: sections.TEXTO.length, AUDIO: sections.AUDIO.length, ARCHIVO: sections.ARCHIVO.length };

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // Cada vez que se abre el panel (botón o «/»), las vistas previas se renuevan si hace falta.
  const { onOpen } = quickReplies;
  useEffect(() => {
    if (showPicker) onOpen();
  }, [showPicker, onOpen]);

  if (disabledReason) {
    return (
      <div className="border-t border-lm-line px-4 py-3 text-[13px] text-lm-ink-2" role="status">
        {disabledReason}
      </div>
    );
  }

  const tooLong = text.length > MAX_LENGTH;

  function updateText(value: string) {
    setText(value);
    setSaveState(null);
    if (value) drafts.set(conversationId, value);
    else drafts.delete(conversationId);
  }

  function submit() {
    const value = text.trim();
    if (!value || tooLong || slashQuery !== null) return;
    onSend(value);
    updateText("");
    textarea.current?.focus();
  }

  function closePicker() {
    setPickerOpen(false);
    setHighlight(0);
    if (slashQuery !== null) updateText("");
  }

  function choose(reply: QuickReplyView) {
    quickReplies.onUsed(reply);
    setPickerOpen(false);
    setHighlight(0);
    if (reply.kind === "TEXTO") {
      updateText(fillQuickReply(reply.body ?? "", participantName, participantHandle));
      requestAnimationFrame(() => {
        const element = textarea.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(element.value.length, element.value.length);
      });
      return;
    }
    if (slashQuery !== null) updateText("");
    // Audio, imagen o documento: sale solo en 4 s, salvo que se toque "Deshacer".
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingSend(reply);
    undoTimer.current = setTimeout(() => {
      setPendingSend(null);
      quickReplies.onSendAttachment(reply);
    }, UNDO_MS);
    textarea.current?.focus();
  }

  function undoSend() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingSend(null);
  }

  async function saveAsQuickReply() {
    const body = text.trim();
    if (!body) return;
    const title = body.split(/\s+/).slice(0, 6).join(" ").slice(0, 60);
    setSaving(true);
    const result = await quickReplies.onSaveText(title, body);
    setSaving(false);
    setSaveState(result);
  }

  return (
    <div className="relative shrink-0 border-t border-lm-line bg-lm-surface px-3 py-2 sm:px-4 lg:bg-transparent lg:py-3">
      {showPicker ? (
        <QuickRepliesPanel
          tab={activeTab}
          onTabChange={(kind) => {
            setTab(kind);
            setHighlight(0);
          }}
          matches={matches}
          counts={counts}
          filtered={Boolean(query)}
          highlight={highlight}
          onHighlight={setHighlight}
          onChoose={choose}
          onClose={closePicker}
          onRefocus={() => textarea.current?.focus()}
          actions={quickReplies}
        />
      ) : null}

      {pendingSend ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-ink/6 px-3 py-2 text-[12.5px] text-lm-ink" role="status">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-lm-ink-3" />
            <span className="truncate">
              Mandando {sendableNoun(pendingSend)} «{pendingSend.title}»…
            </span>
          </span>
          <button type="button" onClick={undoSend} className="shrink-0 font-medium text-lm-signal-text underline-offset-2 hover:underline focus-visible:lm-focus">
            Deshacer
          </button>
        </div>
      ) : null}

      {notice ? <p className="mb-2 text-xs text-lm-ink-3">{notice}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        method="post"
        className="flex items-end gap-2"
      >
        <button
          type="button"
          onClick={() => (showPicker ? closePicker() : setPickerOpen(true))}
          disabled={!quickReplies.ready}
          aria-label="Respuestas rápidas"
          aria-expanded={showPicker}
          title={quickReplies.ready ? "Respuestas rápidas · escribí / al principio" : "Falta aplicar la migración de respuestas rápidas"}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full bg-lm-ink/6 text-lm-ink-2 transition-colors duration-150 ease-out active:bg-lm-ink/15 hover:bg-lm-ink/12 hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45 lg:size-9",
            showPicker && "bg-lm-ink/12 text-lm-ink",
          )}
        >
          <Zap className="size-4" strokeWidth={1.5} />
        </button>
        <textarea
          id="chat-composer-input"
          ref={textarea}
          value={text}
          onChange={(event) => {
            updateText(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (showPicker && matches.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((value) => (value + 1) % matches.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((value) => (value - 1 + matches.length) % matches.length);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const reply = matches[highlight];
                if (reply) choose(reply);
                return;
              }
            }
            if (event.key === "Escape") {
              if (showPicker) {
                event.preventDefault();
                closePicker();
              } else {
                event.currentTarget.blur();
              }
              return;
            }
            // Enter envía; Shift+Enter hace un salto de línea.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Escribí un mensaje…"
          enterKeyHint="send"
          aria-label="Respuesta"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-lm-md border border-lm-line-strong bg-lm-ink/5 px-3 py-2 font-lm-sans text-base leading-[1.35] text-lm-ink [field-sizing:content] placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none lg:min-h-9 lg:text-[13.5px]"
        />
        <Button type="submit" variant="primary" aria-label="Enviar mensaje" disabled={!text.trim() || tooLong || slashQuery !== null} className="h-9 max-sm:size-11 max-sm:rounded-full max-sm:p-0">
          <Send className="size-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>
      <div className={cn("mt-1.5 flex items-center justify-between gap-3 text-xs", !text.length && !saveState && "max-sm:hidden")}>
        <span className={cn(saveState ? (saveState.ok ? "text-lm-success" : "text-lm-danger") : "text-lm-ink-3")} role="status">
          {saveState?.message ?? (
            <span className="hidden sm:inline">Enter envía · Shift+Enter, salto de línea · ↑↓ J K para moverte · E archiva</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {quickReplies.ready && text.trim() && slashQuery === null ? (
            <button
              type="button"
              onClick={saveAsQuickReply}
              disabled={saving}
              className="inline-flex items-center gap-1 text-lm-ink-3 hover:text-lm-ink focus-visible:lm-focus disabled:opacity-60"
              title="Guardar este texto como respuesta rápida"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <BookmarkPlus className="size-3" strokeWidth={1.5} />}
              Guardar
            </button>
          ) : null}
          <span className={cn("font-mono", tooLong ? "text-lm-danger" : "text-lm-ink-3")}>
            {text.length}/{MAX_LENGTH}
          </span>
        </span>
      </div>
    </div>
  );
}
