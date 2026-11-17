"use client";

import { AudioLines, ExternalLink, FileText, ImageIcon, Loader2, Mic, Paperclip, Pencil, Play, Plus, Square, Trash2, Type, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/leads/ui/button";
import type { QuickReplyKind } from "@/lib/chats/db";
import {
  BODY_MAX,
  FILE_ACCEPT,
  fileKindOf,
  fileMimeOf,
  fileSizeLimit,
  formatDuration,
  formatFileSize,
  QUICK_REPLY_SECTIONS,
  TITLE_MAX,
  type QuickReplyView,
} from "@/lib/chats/quick-replies";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; message: string };

export type QuickReplyActions = {
  /** Guarda un texto nuevo. */
  onSaveText: (title: string, body: string) => Promise<Result>;
  /** Cambia el nombre de una guardada y, si es de texto, su mensaje. */
  onUpdate: (id: string, input: { title: string; body?: string }) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  /** Abre el grabador para guardar un audio nuevo. */
  onRecord: () => void;
  /** Sube y guarda un documento o una imagen. */
  onUploadFile: (file: File, title: string) => Promise<Result>;
};

const SECTION_ICON: Record<QuickReplyKind, LucideIcon> = { TEXTO: Type, AUDIO: AudioLines, ARCHIVO: Paperclip };
const FIELD =
  "w-full rounded-lm-sm border border-lm-line-strong bg-lm-ink/5 px-2.5 font-lm-sans text-[13px] text-lm-ink placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none";
const ROW_ACTION =
  "grid size-7 shrink-0 place-items-center rounded-full text-lm-ink-2 transition-colors duration-150 ease-out hover:bg-lm-ink/10 hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45";

/**
 * El panel de respuestas rápidas del compositor: tres secciones —textos,
 * audios y documentos/imágenes— y, en cada una, lo que hace falta para
 * mantenerla: crear, cambiar el nombre (y el mensaje de un texto) y borrar.
 *
 * Elegir un texto lo pone en el campo para revisarlo; un audio, una imagen o
 * un documento salen con un toque (el compositor da 4 s para deshacer). El
 * teclado lo maneja el campo de texto (↑↓ Enter Esc), así que acá no hay foco
 * propio salvo en los formularios.
 */
export function QuickRepliesPanel({
  tab,
  onTabChange,
  matches,
  counts,
  filtered,
  highlight,
  onHighlight,
  onChoose,
  onClose,
  onRefocus,
  actions,
}: {
  /** La sección que se está viendo. */
  tab: QuickReplyKind;
  onTabChange: (kind: QuickReplyKind) => void;
  /** Las guardadas de esa sección que coinciden con lo que se escribió después de la barra. */
  matches: QuickReplyView[];
  /** Cuántas coinciden en cada sección. */
  counts: Record<QuickReplyKind, number>;
  /** Hay un filtro escrito (`/algo`): cambia el mensaje de la sección vacía. */
  filtered: boolean;
  highlight: number;
  onHighlight: (index: number) => void;
  onChoose: (reply: QuickReplyView) => void;
  onClose: () => void;
  /** Devuelve el foco al campo de texto. */
  onRefocus: () => void;
  actions: QuickReplyActions;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Result | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => player.current?.pause(), []);

  const section = QUICK_REPLY_SECTIONS.find((entry) => entry.kind === tab) ?? QUICK_REPLY_SECTIONS[0];

  function resetForms() {
    setEditing(null);
    setConfirming(null);
    setAdding(false);
    setFile(null);
  }

  function changeTab(kind: QuickReplyKind) {
    resetForms();
    setNotice(null);
    onTabChange(kind);
  }

  function togglePreview(reply: QuickReplyView) {
    if (!reply.previewUrl) return;
    player.current?.pause();
    if (playing === reply.id) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(reply.previewUrl);
    audio.onended = () => setPlaying(null);
    player.current = audio;
    void audio.play().then(
      () => setPlaying(reply.id),
      () => setPlaying(null),
    );
  }

  async function run(task: () => Promise<Result>, onOk: () => void) {
    setBusy(true);
    setNotice(null);
    let result: Result;
    try {
      result = await task();
    } catch {
      result = { ok: false, message: "Se cortó la conexión. Probá de nuevo." };
    }
    setBusy(false);
    setNotice(result);
    if (result.ok) onOk();
  }

  function pickFile(picked: File | undefined) {
    if (!picked) return;
    const mime = fileMimeOf(picked.type, picked.name);
    if (!mime) {
      setNotice({ ok: false, message: "Instagram sólo acepta imágenes (png, jpg, gif) y PDF por mensaje directo." });
      return;
    }
    if (picked.size > fileSizeLimit(mime)) {
      setNotice({ ok: false, message: fileKindOf(mime) === "image" ? "La imagen puede pesar hasta 8 MB." : "El PDF puede pesar hasta 25 MB." });
      return;
    }
    setNotice(null);
    resetForms();
    setFile(picked);
  }

  return (
    <div
      className="lm-glass-pop lm-shadow-pop lm-rise absolute right-3 bottom-full left-3 z-10 mb-2 flex max-h-[min(28rem,62vh)] flex-col overflow-hidden rounded-lm-lg border border-lm-line-strong sm:right-4 sm:left-4"
      role="dialog"
      aria-label="Respuestas rápidas"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (editing || confirming || adding || file) resetForms();
        else onClose();
        onRefocus();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5">
        <span className="font-lm-sans text-[11px] font-semibold tracking-[0.08em] text-lm-ink-3 uppercase">Respuestas rápidas</span>
        <button type="button" onClick={onClose} aria-label="Cerrar las respuestas rápidas" className={cn(ROW_ACTION, "size-6 text-lm-ink-3")}>
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Las tres secciones. */}
      <div className="shrink-0 px-3 pt-2 pb-2" role="tablist" aria-label="Secciones de respuestas rápidas">
        <div className="flex gap-0.5 rounded-lm-sm bg-lm-ink/6 p-[3px]">
          {QUICK_REPLY_SECTIONS.map((entry) => {
            const Icon = SECTION_ICON[entry.kind];
            const active = entry.kind === tab;
            return (
              <button
                key={entry.kind}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => changeTab(entry.kind)}
                className={cn(
                  "flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 font-lm-sans text-[12.5px] font-medium transition-colors duration-150 ease-out focus-visible:lm-focus",
                  active ? "bg-lm-overlay text-lm-ink shadow-[0_2px_4px_rgb(0_0_0/0.12)]" : "text-lm-ink-2 hover:text-lm-ink",
                )}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{entry.label}</span>
                <span className={cn("font-mono text-[11px]", active ? "text-lm-ink-2" : "text-lm-ink-3")}>{counts[entry.kind]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1" role="listbox" aria-label={section.label}>
        {matches.length === 0 ? (
          <li className="px-2 py-4 text-[12.5px] text-lm-ink-3">{filtered ? "Ninguna coincide en esta sección." : section.empty}</li>
        ) : (
          matches.map((reply, index) =>
            editing === reply.id ? (
              <li key={reply.id} className="p-1">
                <ReplyForm
                  kind={reply.kind}
                  initialTitle={reply.title}
                  initialBody={reply.body ?? ""}
                  busy={busy}
                  submitLabel="Guardar cambios"
                  onCancel={() => {
                    resetForms();
                    onRefocus();
                  }}
                  onSubmit={(title, body) =>
                    run(
                      () => actions.onUpdate(reply.id, reply.kind === "TEXTO" ? { title, body } : { title }),
                      () => {
                        resetForms();
                        onRefocus();
                      },
                    )
                  }
                />
              </li>
            ) : (
              <li
                key={reply.id}
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => onHighlight(index)}
                className={cn("group flex items-center gap-1 rounded-lm-md px-1.5 py-1.5 transition-colors duration-100", index === highlight && "bg-lm-ink/8")}
              >
                <button type="button" onClick={() => onChoose(reply)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lm-sm text-left focus-visible:lm-focus">
                  <Leading reply={reply} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-lm-sans text-[13px] font-medium text-lm-ink">{reply.title}</span>
                    <span className="block truncate text-[12px] text-lm-ink-3">{sublineOf(reply)}</span>
                  </span>
                </button>

                {confirming === reply.id ? (
                  <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[12px] text-lm-ink-2" role="group" aria-label={`Confirmar el borrado de ${reply.title}`}>
                    ¿Borrar?
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => actions.onDelete(reply.id), resetForms)}
                      className="inline-flex h-7 items-center gap-1 rounded-lm-sm bg-lm-danger-soft px-2 font-medium text-lm-danger hover:bg-lm-danger/25 focus-visible:lm-focus disabled:opacity-55"
                    >
                      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                      Sí, borrar
                    </button>
                    <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="h-7 rounded-lm-sm px-2 text-lm-ink-2 hover:bg-lm-ink/8 hover:text-lm-ink focus-visible:lm-focus">
                      No
                    </button>
                  </span>
                ) : (
                  // En pantallas sin hover (touch) las acciones están siempre a la vista.
                  <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    {reply.kind === "AUDIO" && reply.previewUrl ? (
                      <button type="button" onClick={() => togglePreview(reply)} aria-label={playing === reply.id ? "Detener" : `Escuchar ${reply.title}`} title="Escuchar" className={ROW_ACTION}>
                        {playing === reply.id ? <Square className="size-3" strokeWidth={1.5} /> : <Play className="size-3" strokeWidth={1.5} />}
                      </button>
                    ) : null}
                    {reply.kind === "ARCHIVO" && reply.previewUrl ? (
                      <a href={reply.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${reply.title}`} title="Ver" className={ROW_ACTION}>
                        <ExternalLink className="size-3.5" strokeWidth={1.5} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        resetForms();
                        setNotice(null);
                        setEditing(reply.id);
                      }}
                      aria-label={reply.kind === "TEXTO" ? `Editar ${reply.title}` : `Cambiar el nombre de ${reply.title}`}
                      title={reply.kind === "TEXTO" ? "Editar" : "Cambiar el nombre"}
                      className={ROW_ACTION}
                    >
                      <Pencil className="size-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetForms();
                        setNotice(null);
                        setConfirming(reply.id);
                      }}
                      aria-label={`Borrar ${reply.title}`}
                      title="Borrar"
                      className={cn(ROW_ACTION, "hover:bg-lm-danger-soft hover:text-lm-danger")}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.5} />
                    </button>
                  </span>
                )}
              </li>
            ),
          )
        )}
      </ul>

      {/* Agregar a la sección que se está viendo. */}
      <div className="shrink-0 border-t border-lm-line px-3 py-2.5">
        {tab === "TEXTO" && adding ? (
          <ReplyForm
            kind="TEXTO"
            initialTitle=""
            initialBody=""
            busy={busy}
            submitLabel="Guardar texto"
            onCancel={() => {
              resetForms();
              onRefocus();
            }}
            onSubmit={(title, body) => run(() => actions.onSaveText(title, body), resetForms)}
          />
        ) : tab === "ARCHIVO" && file ? (
          <FileForm
            key={`${file.name}:${file.size}`}
            file={file}
            busy={busy}
            onCancel={() => {
              resetForms();
              onRefocus();
            }}
            onSubmit={(title) => run(() => actions.onUploadFile(file, title), resetForms)}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            {tab === "TEXTO" ? (
              <Button
                size="sm"
                onClick={() => {
                  resetForms();
                  setNotice(null);
                  setAdding(true);
                }}
              >
                <Plus className="size-3.5" strokeWidth={1.5} />
                Nuevo texto
              </Button>
            ) : tab === "AUDIO" ? (
              <Button size="sm" onClick={actions.onRecord}>
                <Mic className="size-3.5" strokeWidth={1.5} />
                Grabar o subir un audio
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  <Plus className="size-3.5" strokeWidth={1.5} />
                  Subir un documento o imagen
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    pickFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </>
            )}
            <span className="text-[11.5px] text-lm-ink-3">
              {tab === "TEXTO" ? "Un texto se pone en el campo para revisarlo antes de mandar." : tab === "AUDIO" ? "Un audio sale con un toque." : "PDF hasta 25 MB · imagen hasta 8 MB."}
            </span>
          </div>
        )}
        {notice?.message ? (
          <p className={cn("mt-2 text-[12px]", notice.ok ? "text-lm-success" : "text-lm-danger")} role={notice.ok ? "status" : "alert"}>
            {notice.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function sublineOf(reply: QuickReplyView): string {
  if (reply.kind === "TEXTO") return reply.body ?? "";
  if (reply.kind === "AUDIO") return ["Audio", formatDuration(reply.durationMs), "se manda con un toque"].filter(Boolean).join(" · ");
  const kind = fileKindOf(reply.mime) === "image" ? "Imagen" : "PDF";
  return [kind, formatFileSize(reply.fileSize), "se manda con un toque"].filter(Boolean).join(" · ");
}

/** El cuadrado de la izquierda: el ícono de la sección o, en una imagen, su miniatura. */
function Leading({ reply }: { reply: QuickReplyView }) {
  const image = reply.kind === "ARCHIVO" && fileKindOf(reply.mime) === "image";
  const Icon = reply.kind === "TEXTO" ? Type : reply.kind === "AUDIO" ? AudioLines : image ? ImageIcon : FileText;
  return (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lm-sm bg-lm-ink/6 text-lm-ink-2">
      <Icon className="size-4" strokeWidth={1.5} />
      {image && reply.previewUrl ? (
        // URL firmada que vence: si falla, queda el ícono de abajo.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={reply.previewUrl}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}

/** Nombre y, en un texto, el mensaje. Sirve para crear un texto y para editar cualquier guardada. */
function ReplyForm({
  kind,
  initialTitle,
  initialBody,
  busy,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  kind: QuickReplyKind;
  initialTitle: string;
  initialBody: string;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const isText = kind === "TEXTO";
  const valid = Boolean(title.trim()) && (!isText || (Boolean(body.trim()) && body.length <= BODY_MAX));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid && !busy) onSubmit(title.trim(), body.trim());
  }

  return (
    <form onSubmit={submit} method="post" className="flex flex-col gap-2 rounded-lm-md border border-lm-line-strong bg-lm-ink/5 p-2.5">
      <input
        // El formulario se abre porque se lo pidió: el foco va al nombre.
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={TITLE_MAX}
        placeholder={isText ? "Nombre, p. ej. «Saludo inicial»" : "Nombre"}
        aria-label="Nombre de la respuesta"
        className={cn(FIELD, "h-8")}
      />
      {isText ? (
        <>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="El mensaje. {{nombre}} se reemplaza por el nombre de la persona."
            aria-label="Mensaje"
            className={cn(FIELD, "max-h-40 min-h-18 resize-y py-2 leading-[1.4]")}
          />
          <p className="flex items-center justify-between gap-2 text-[11.5px] text-lm-ink-3">
            <span>
              <span className="font-mono">{"{{nombre}}"}</span> pone el nombre de la persona.
            </span>
            <span className={cn("font-mono", body.length > BODY_MAX && "text-lm-danger")}>
              {body.length}/{BODY_MAX}
            </span>
          </p>
        </>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!valid || busy}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** El archivo elegido, antes de subirlo: se le pone el nombre con el que se lo va a buscar. */
function FileForm({ file, busy, onCancel, onSubmit }: { file: File; busy: boolean; onCancel: () => void; onSubmit: (title: string) => void }) {
  const [title, setTitle] = useState(() => file.name.replace(/\.[^.]+$/, "").slice(0, TITLE_MAX));
  const image = fileKindOf(fileMimeOf(file.type, file.name)) === "image";
  const Icon = image ? ImageIcon : FileText;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() && !busy) onSubmit(title.trim());
      }}
      method="post"
      className="flex flex-col gap-2 rounded-lm-md border border-lm-line-strong bg-lm-ink/5 p-2.5"
    >
      <p className="flex items-center gap-2 text-[12px] text-lm-ink-2">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <span className="shrink-0 font-mono text-lm-ink-3">{formatFileSize(file.size)}</span>
      </p>
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={TITLE_MAX}
        placeholder={image ? "Nombre, p. ej. «Antes y después»" : "Nombre, p. ej. «Propuesta»"}
        aria-label="Nombre del archivo"
        className={cn(FIELD, "h-8")}
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!title.trim() || busy}>
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {busy ? "Subiendo…" : image ? "Guardar imagen" : "Guardar documento"}
        </Button>
      </div>
    </form>
  );
}
