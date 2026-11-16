"use client";

import { AudioLines, BookmarkPlus, Loader2, Mic, Play, Send, Square, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { fillQuickReply } from "@/lib/chats/inbox";
import { formatDuration, matchQuickReplies, type QuickReplyView } from "@/lib/chats/quick-replies";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 1000;
/** Lo que dura el "Deshacer" de un audio mandado con un toque, antes de salir de verdad. */
const UNDO_MS = 4000;

/** Borradores por conversación: cambiar de chat no pierde lo que se estaba escribiendo. */
const drafts = new Map<string, string>();

export type ComposerQuickReplies = {
  ready: boolean;
  items: QuickReplyView[];
  /** Manda un audio guardado (después del "Deshacer"). */
  onSendAudio: (reply: QuickReplyView) => void;
  /** Guarda el texto del campo como respuesta rápida. */
  onSaveText: (title: string, body: string) => Promise<{ ok: boolean; message: string }>;
  /** Abre el grabador para guardar un audio nuevo. */
  onRecord: () => void;
  /** Se usó una respuesta (para ordenar por uso). */
  onUsed: (reply: QuickReplyView) => void;
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
 * selector. Un texto se inserta con `{{nombre}}` ya reemplazado, para revisarlo
 * antes de mandar; un audio sale con un toque, con 4 s para deshacer.
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
  const [highlight, setHighlight] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{ reply: QuickReplyView } | null>(null);
  const [saveState, setSaveState] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "/texto" al principio del campo filtra el selector; el botón lo abre sin filtro.
  const slashQuery = text.startsWith("/") && !text.includes("\n") ? text.slice(1) : null;
  const showPicker = quickReplies.ready && (pickerOpen || slashQuery !== null);
  const query = slashQuery ?? "";
  const matches = useMemo(() => (showPicker ? matchQuickReplies(quickReplies.items, query).slice(0, 8) : []), [showPicker, quickReplies.items, query]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      player.current?.pause();
    },
    [],
  );

  if (disabledReason) {
    return (
      <div className="border-t border-lm-line bg-lm-surface px-4 py-3 text-[13px] text-lm-ink-2" role="status">
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
    // Audio: sale solo en 4 s, salvo que se toque "Deshacer".
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingAudio({ reply });
    undoTimer.current = setTimeout(() => {
      setPendingAudio(null);
      quickReplies.onSendAudio(reply);
    }, UNDO_MS);
  }

  function undoAudio() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingAudio(null);
  }

  function togglePreview(reply: QuickReplyView) {
    if (!reply.previewUrl) return;
    if (playing === reply.id) {
      player.current?.pause();
      setPlaying(null);
      return;
    }
    player.current?.pause();
    const audio = new Audio(reply.previewUrl);
    audio.onended = () => setPlaying(null);
    player.current = audio;
    void audio.play().then(
      () => setPlaying(reply.id),
      () => setPlaying(null),
    );
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
    <div className="relative border-t border-lm-line bg-lm-surface px-4 py-3">
      {showPicker ? (
        <div
          className="lm-glass-pop lm-shadow-pop absolute right-4 bottom-full left-4 mb-2 max-h-80 overflow-y-auto rounded-lm-md border border-lm-line-strong p-1.5"
          role="listbox"
          aria-label="Respuestas rápidas"
        >
          <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5">
            <span className="font-lm-sans text-[11px] font-semibold tracking-[0.08em] text-lm-ink-3 uppercase">Respuestas rápidas</span>
            <button type="button" onClick={quickReplies.onRecord} className="inline-flex items-center gap-1 font-lm-sans text-[11.5px] text-lm-ink-2 hover:text-lm-ink focus-visible:lm-focus">
              <Mic className="size-3" strokeWidth={1.5} />
              Grabar un audio
            </button>
          </div>
          {matches.length === 0 ? (
            <p className="px-2 py-3 text-[12.5px] text-lm-ink-3">
              {quickReplies.items.length === 0 ? "Todavía no guardaste respuestas. Escribí una y tocá el marcador para guardarla, o grabá un audio." : "Ninguna coincide."}
            </p>
          ) : (
            matches.map((reply, index) => (
              <div
                key={reply.id}
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                className={cn("flex items-center gap-2 rounded-lm-sm px-2 py-1.5", index === highlight && "bg-lm-raised")}
              >
                <button type="button" onClick={() => choose(reply)} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:lm-focus">
                  {reply.kind === "AUDIO" ? (
                    <AudioLines className="size-3.5 shrink-0 text-lm-ink-2" strokeWidth={1.5} />
                  ) : (
                    <Zap className="size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-lm-sans text-[13px] font-medium text-lm-ink">{reply.title}</span>
                    <span className="block truncate text-[12px] text-lm-ink-3">
                      {reply.kind === "AUDIO" ? `Audio ${formatDuration(reply.durationMs)} · se manda con un toque` : (reply.body ?? "")}
                    </span>
                  </span>
                </button>
                {reply.kind === "AUDIO" && reply.previewUrl ? (
                  <button
                    type="button"
                    onClick={() => togglePreview(reply)}
                    aria-label={playing === reply.id ? "Detener" : `Escuchar ${reply.title}`}
                    className="grid size-7 shrink-0 place-items-center rounded-lm-sm text-lm-ink-2 hover:bg-lm-surface hover:text-lm-ink focus-visible:lm-focus"
                  >
                    {playing === reply.id ? <Square className="size-3" strokeWidth={1.5} /> : <Play className="size-3" strokeWidth={1.5} />}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {pendingAudio ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-3 py-2 text-[12.5px] text-lm-ink" role="status">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-lm-ink-3" />
            <span className="truncate">Mandando el audio «{pendingAudio.reply.title}»…</span>
          </span>
          <button type="button" onClick={undoAudio} className="shrink-0 font-medium text-lm-signal-text underline-offset-2 hover:underline focus-visible:lm-focus">
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
            "grid size-9 shrink-0 place-items-center rounded-lm-sm border border-lm-line-strong text-lm-ink-2 transition-colors duration-150 ease-out hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45",
            showPicker && "bg-lm-raised text-lm-ink",
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
          placeholder="Escribí tu respuesta… (/ para respuestas rápidas)"
          aria-label="Respuesta"
          className="max-h-40 min-h-9 flex-1 resize-none rounded-lm-sm border border-lm-line-strong bg-lm-raised px-3 py-2 font-lm-sans text-[13.5px] leading-[1.35] text-lm-ink [field-sizing:content] placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={!text.trim() || tooLong || slashQuery !== null} className="h-9">
          <Send className="size-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
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
