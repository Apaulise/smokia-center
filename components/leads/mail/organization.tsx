"use client";

import { Check, FolderInput, FolderPlus, Inbox, Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Folder, MailLabel } from "@/lib/mail/types";

export function NewMailLabel({ busy, error, close, save }: {
  busy: boolean; error: string; close: () => void; save: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return <Dialog open title="Nueva carpeta" description="Se creará como etiqueta en Gmail."
    onClose={() => { if (!busy) close(); }}>
    <form method="post" className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim() && !busy) save(name.trim());
    }}>
      <label className="block space-y-2 text-sm">
        <span>Nombre de la carpeta</span>
        <input maxLength={100} required value={name} disabled={busy}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 w-full rounded-lm-md border border-lm-line-strong bg-lm-ink/5 px-3 text-base text-lm-ink focus-visible:lm-focus" />
      </label>
      {error && <p role="alert" className="text-sm text-lm-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" className="min-h-11" disabled={busy} onClick={close}>Cancelar</Button>
        <Button type="submit" className="min-h-11" variant="primary" disabled={busy || !name.trim()}>
          {busy ? "Creando…" : "Crear carpeta"}
        </Button>
      </div>
    </form>
  </Dialog>;
}

export function OrganizeMail({ labels, active, folder, busy, error, close, create, apply, move }: {
  labels: MailLabel[]; active: ReadonlySet<string>; folder: Folder; busy: boolean; error: string;
  close: () => void; create: () => void; apply: (id: string) => void; move: (id: string) => void;
}) {
  const [mode, setMode] = useState<"label" | "move">("label");
  const moving = mode === "move";
  const destinations = moving ? labels.filter(({ id }) => folder !== `label:${id}`) : labels;
  return <Dialog open title="Organizar correo" onClose={() => { if (!busy) close(); }}>
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" aria-pressed={!moving} variant={moving ? "ghost" : "secondary"} disabled={busy} onClick={() => setMode("label")}>
          <Tag className="size-4" /> Etiquetar
        </Button>
        <Button className="min-h-11" aria-pressed={moving} variant={moving ? "secondary" : "ghost"} disabled={busy} onClick={() => setMode("move")}>
          <FolderInput className="size-4" /> Mover a
        </Button>
      </div>
      <p className="text-sm text-lm-ink-2">
        {moving ? "Elegí el destino. Se conservan las demás etiquetas del correo." : "Aplicá o quitá etiquetas del correo."}
      </p>
      {error && <p role="alert" className="text-sm text-lm-danger">{error}</p>}
      <div className="max-h-[min(44dvh,18rem)] overflow-y-auto overscroll-contain">
        {moving && folder !== "inbox" && <Button variant="ghost" className="min-h-11 w-full justify-start" disabled={busy} onClick={() => move("INBOX")}>
          <Inbox className="size-4 shrink-0" /> Recibidos
        </Button>}
        {destinations.map(({ id, name }) => <Button key={id} variant="ghost" disabled={busy}
          className="min-h-11 w-full justify-start" aria-pressed={moving ? undefined : active.has(id)} title={name}
          onClick={() => moving ? move(id) : apply(id)}>
          <Tag className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate text-left">{name}</span>
          {!moving && active.has(id) && <Check className="size-4 shrink-0 text-lm-signal-text" aria-hidden />}
        </Button>)}
        {destinations.length === 0 && !moving && <p className="py-3 text-sm text-lm-ink-2">Todavía no tenés etiquetas.</p>}
      </div>
      <Button disabled={busy} className="min-h-11" onClick={create}><FolderPlus className="size-4" /> Nueva carpeta</Button>
    </div>
  </Dialog>;
}
