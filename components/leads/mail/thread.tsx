"use client";

import { Archive, ArrowLeft, ArrowUpRight, Download, Forward, Inbox, Mail, Reply, ReplyAll, ShieldAlert, Star, Trash2 } from "lucide-react";
import { Button, ButtonExternalLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Folder, MailChange, MailLabel, MailMessage, ReplyMode } from "@/lib/mail/types";

const timestamp = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

export function MailThread({ email, connection, folder, messages, labels, busy, close, modify, reply }: {
  email: string; connection: string; folder: Folder; messages: MailMessage[]; labels: MailLabel[]; busy: boolean;
  close: () => void; modify: (change: MailChange, label?: string) => void;
  reply: (message: MailMessage, mode: ReplyMode) => void;
}) {
  const current = messages.at(-1);
  if (!current) return <p className="px-5 py-8 text-sm text-lm-ink-2">El hilo está vacío.</p>;
  const active = new Set(messages.flatMap((message) => message.labels));
  const trash = folder === "trash" || messages.every((message) => message.labels.includes("TRASH"));
  const spam = folder === "spam" || messages.every((message) => message.labels.includes("SPAM"));
  return <div className="min-w-0">
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-lm-line bg-lm-bg p-2 sm:p-3">
      <Button type="button" onClick={close} className="min-h-10" variant="ghost" aria-label="Volver a la bandeja" title="Volver a la bandeja"><ArrowLeft className="size-4" /></Button>
      {trash ? <Button className="min-h-10" disabled={busy} onClick={() => modify("restore")}><Inbox className="size-4" /> Restaurar</Button>
        : <>
          <Button variant="ghost" className="min-h-10" disabled={busy} title={active.has("INBOX") ? "Archivar" : "Mover a Recibidos"}
            aria-label={active.has("INBOX") ? "Archivar" : "Mover a Recibidos"} onClick={() => modify(active.has("INBOX") ? "archive" : "inbox")}>
            {active.has("INBOX") ? <Archive className="size-4" /> : <Inbox className="size-4" />}
          </Button>
          <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => modify("unread")} aria-label="Marcar como no leído" title="Marcar como no leído"><Mail className="size-4" /></Button>
          <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => modify(active.has("STARRED") ? "unstar" : "star")}
            aria-label={active.has("STARRED") ? "Quitar destacado" : "Destacar"} title={active.has("STARRED") ? "Quitar destacado" : "Destacar"}>
            <Star className={cn("size-4", active.has("STARRED") && "fill-current text-lm-signal-text")} />
          </Button>
          <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => modify("trash")} aria-label="Mover a la papelera" title="Mover a la papelera"><Trash2 className="size-4" /></Button>
          <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => modify(spam ? "not-spam" : "spam")}
            aria-label={spam ? "Marcar como correo deseado" : "Marcar como spam"} title={spam ? "Marcar como correo deseado" : "Marcar como spam"}>
            <ShieldAlert className="size-4" />
          </Button>
        </>}
      {labels.length > 0 && <select aria-label="Etiquetas del hilo" disabled={busy} value="" className="min-h-10 max-w-36 rounded-lm-md border border-lm-line bg-lm-bg px-2 text-sm"
        onChange={(event) => { const id = event.target.value; if (id) modify(active.has(id) ? "unlabel" : "label", id); }}>
        <option value="">Etiquetas</option>
        {labels.map(({ id, name }) => <option key={id} value={id}>{active.has(id) ? "Quitar " : "Aplicar "}{name}</option>)}
      </select>}
      <ButtonExternalLink variant="ghost" className="ml-auto min-h-10" aria-label="Abrir hilo en Gmail" title="Abrir hilo en Gmail"
        href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(current.threadId)}`}><ArrowUpRight className="size-4" /></ButtonExternalLink>
    </div>
    <div className="px-4 py-5 sm:px-6">
      <h2 className="break-words text-xl font-semibold tracking-tight">{current.subject || "(Sin asunto)"}</h2>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {labels.filter(({ id }) => active.has(id)).map(({ id, name }) => <span className="rounded-lm-sm bg-lm-ink/8 px-2 py-1 text-xs" key={id}>{name}</span>)}
      </div>
      <div className="mt-5 space-y-3">
        {messages.map((message) => <article key={message.id} className="rounded-lm-lg border border-lm-line bg-lm-ink/3 p-4">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{message.from || "Remitente desconocido"}</p>
              <details className="mt-1 max-w-full text-xs text-lm-ink-2">
                <summary className="cursor-pointer">Destinatarios</summary>
                <p className="mt-1 break-words">Para {message.to || "—"}</p>
                {message.cc && <p className="break-words">CC {message.cc}</p>}
                {message.bcc && <p className="break-words">CCO {message.bcc}</p>}
              </details>
            </div>
            {message.date > 0 && <time className="text-xs text-lm-ink-3">{timestamp.format(message.date)}</time>}
          </header>
          {message.html && message.text ? <iframe
            className="mt-4 block min-h-16 w-full rounded-lm-sm bg-white" title={`Correo de ${message.from}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"
            srcDoc={`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color:#252525;background:#fff;}body{margin:12px;font:14px/1.65 system-ui,sans-serif;overflow-wrap:anywhere}a{color:#234cc0}table{max-width:100%;border-collapse:collapse}td,th{padding:2px 5px}pre{white-space:pre-wrap}</style></head><body>${message.html}</body></html>`}
            onLoad={(event) => {
              const frame = event.currentTarget;
              if (frame.contentDocument?.body) frame.style.height = `${Math.max(70, Math.min(frame.contentDocument.body.scrollHeight + 26, 640))}px`;
            }}
          /> : <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text || message.snippet}</p>}
          {message.attachments.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">
            {message.attachments.map((file) => <li key={file.partId} className="min-w-0">
              <a className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lm-md border border-lm-line px-2 text-sm hover:bg-lm-ink/8 focus-visible:lm-focus"
                href={`/leads/correo/adjunto/${encodeURIComponent(message.id)}?parte=${encodeURIComponent(file.partId)}&cuenta=${encodeURIComponent(connection)}`}>
                <Download className="size-4 shrink-0" /><span className="truncate">{file.name}</span>
              </a>
            </li>)}
          </ul>}
          {!trash && !spam && !message.labels.some((label) => label === "TRASH" || label === "SPAM") && <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-10" variant="ghost" disabled={busy} onClick={() => reply(message, "reply")}><Reply className="size-4" /> Responder</Button>
            <Button className="min-h-10" variant="ghost" disabled={busy} onClick={() => reply(message, "reply-all")}><ReplyAll className="size-4" /> A todos</Button>
            <Button className="min-h-10" variant="ghost" disabled={busy} onClick={() => reply(message, "forward")}><Forward className="size-4" /> Reenviar</Button>
          </div>}
        </article>)}
      </div>
    </div>
  </div>;
}
