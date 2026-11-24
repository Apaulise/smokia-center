"use client";

import { Paperclip, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button, ButtonExternalLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { writeMail } from "@/lib/mail/actions";
import { maxNewAttachmentBytes, type ComposeFields, type ReplyMode } from "@/lib/mail/types";

export type ComposeData = ComposeFields & { draft?: string; draftMessage?: string; source?: string; mode?: ReplyMode };
const inputClass = "min-h-10 w-full rounded-lm-md border border-lm-line-strong bg-lm-ink/5 px-3 py-1.5 text-base md:text-sm focus-visible:lm-focus";
const blank = { to: "", cc: "", bcc: "", subject: "", text: "" };
export const emptyCompose: ComposeData = blank;

export function MailComposerDialog({ email, connection, initial, onClose, onSaved }: {
  email: string; connection: string; initial: ComposeData; onClose: () => void; onSaved: (intent: "send" | "draft") => void;
}) {
  const [fields, setFields] = useState({ ...blank, ...initial });
  const [retained, setRetained] = useState(initial.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const form = useRef<HTMLFormElement>(null);
  const localFiles = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const { confirm, confirmDialog } = useConfirm();
  const dirty = files.length > 0 || retained.length !== (initial.attachments?.length ?? 0)
    || (Object.keys(blank) as (keyof typeof blank)[]).some((key) => fields[key] !== (initial[key] ?? ""));

  async function close() {
    if (lock.current) return;
    if (dirty && !await confirm({
      title: "¿Cerrar sin guardar?", description: "Podés volver al editor y guardar estos cambios como borrador.",
      confirmLabel: "Cerrar editor",
    })) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !form.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = submitter instanceof HTMLButtonElement && submitter.value === "draft" ? "draft" : "send";
    const data = new FormData(form.current);
    for (const file of files) data.append("file", file);
    for (const item of retained) data.append("keep", item.partId);
    if (initial.draft) data.set("draft", initial.draft);
    if (initial.draftMessage) data.set("draftMessage", initial.draftMessage);
    if (initial.source) data.set("source", initial.source);
    if (initial.mode) data.set("mode", initial.mode);
    lock.current = true;
    setStatus({ busy: true, error: "" });
    try {
      const result = await writeMail(connection, data, intent);
      if (!result.ok) {
        setStatus({ busy: false, error: result.error });
        return;
      }
      onSaved(intent);
    } catch {
      setStatus({ busy: false, error: "Se interrumpió la conexión. Si estabas enviando, revisá Enviados antes de reintentar." });
    } finally {
      lock.current = false;
    }
  }

  return <>
    <Dialog open onClose={() => void close()} title={initial.draft ? "Editar borrador" : initial.mode === "forward" ? "Reenviar" : initial.mode ? "Responder" : "Nuevo correo"}
      className="max-w-2xl">
      <form ref={form} onSubmit={submit} className="flex flex-col gap-3">
        <fieldset disabled={status.busy} className="min-w-0 space-y-3">
          <p className="break-all text-sm text-lm-ink-2">Desde {email}</p>
          <div className="grid grid-cols-2 gap-3">
            {([["to", "Para"], ["cc", "CC"], ["bcc", "CCO"], ["subject", "Asunto"]] as const).map(([key, label]) => (
              <label key={key} className={key === "to" || key === "subject" ? "col-span-2" : ""}>
                <span className="mb-1 block text-xs font-medium text-lm-ink-2">{label}</span>
                <input name={key} aria-label={label} className={inputClass} value={fields[key]} readOnly={key === "subject" && initial.mode !== undefined && initial.mode !== "forward"}
                  autoFocus={key === "to" && !initial.to} autoComplete="off" onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-lm-ink-2">Mensaje</span>
            <textarea className={`${inputClass} min-h-36 resize-y`} name="text" aria-label="Mensaje" value={fields.text}
              autoFocus={Boolean(initial.to)} onChange={(e) => setFields({ ...fields, text: e.target.value })} />
          </label>
          {(retained.length > 0 || files.length > 0) && <ul className="flex flex-wrap gap-2">
            {retained.map((file) => <li key={file.partId} className="flex min-w-0 items-center gap-1 rounded-lm-md border border-lm-line px-2 text-xs">
              <span className="max-w-48 truncate">{file.name}</span>
              <Button type="button" variant="ghost" aria-label={`Quitar ${file.name}`} size="sm" onClick={() => setRetained(retained.filter((item) => item !== file))}><X className="size-3" /></Button>
            </li>)}
            {files.map((file, index) => <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-1 rounded-lm-md border border-lm-line px-2 text-xs">
              <span className="max-w-48 truncate">{file.name}</span>
              <Button type="button" variant="ghost" aria-label={`Quitar ${file.name}`} size="sm" onClick={() => setFiles(files.filter((_, position) => index !== position))}><X className="size-3" /></Button>
            </li>)}
          </ul>}
          <input type="file" multiple hidden ref={localFiles} onChange={(event) => {
            const all = files.concat(Array.from(event.target.files ?? []));
            event.target.value = "";
            if (all.length > 20 || all.reduce((total, file) => total + file.size, 0) > maxNewAttachmentBytes) {
              setStatus({ busy: false, error: "Podés agregar hasta 20 archivos y 3 MiB en total. Para archivos más grandes, abrí Gmail." });
              return;
            }
            setFiles(all);
            setStatus({ busy: false, error: "" });
          }} />
        </fieldset>
        {status.error && <p role="alert" className="text-sm text-lm-danger">{status.error}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-lm-line pt-3">
          <Button type="button" className="min-h-10" variant="ghost" disabled={status.busy} onClick={() => localFiles.current?.click()}>
            <Paperclip className="size-4" /> Adjuntar
          </Button>
          <ButtonExternalLink className="min-h-10" variant="ghost" href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`}>
            Abrir Gmail
          </ButtonExternalLink>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="submit" value="draft" className="min-h-10" disabled={status.busy}>Guardar borrador</Button>
            <Button type="submit" value="send" className="min-h-10" variant="primary" disabled={status.busy}>
              <Send className="size-4" /> {status.busy ? "Procesando…" : "Enviar"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
    {confirmDialog}
  </>;
}
