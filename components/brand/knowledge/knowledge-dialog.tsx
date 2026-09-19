"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveKnowledgeNote } from "@/lib/brand/knowledge/actions";
import type { KnowledgeRow } from "@/lib/brand/knowledge/queries";
import {
  COLLECTION_HINT,
  COLLECTION_LABEL,
  KNOWLEDGE_COLLECTIONS,
  KNOWLEDGE_ORIGINS,
  KNOWLEDGE_STATUSES,
  ORIGIN_LABEL,
  STATUS_LABEL,
  type KnowledgeCollection,
  type KnowledgeOrigin,
  type KnowledgeStatus,
} from "@/lib/brand/knowledge/schema";

/**
 * Alta y corrección de una nota. Con `note` corrige la existente; sin `note`
 * crea una en `defaultCollection`. Se remonta con una `key` distinta por nota
 * (ver knowledge-list.tsx), así el estado arranca de cero sin lógica de reseteo.
 *
 * El `data` de cada colección no se edita acá: lo escribe el agente y se ve
 * tal cual en la nota.
 */
export function KnowledgeDialog({
  open,
  note,
  defaultCollection,
  onClose,
}: {
  open: boolean;
  note: KnowledgeRow | null;
  defaultCollection: KnowledgeCollection;
  onClose: () => void;
}) {
  const [collection, setCollection] = useState<KnowledgeCollection>(note?.collection ?? defaultCollection);
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [origin, setOrigin] = useState<KnowledgeOrigin>(note?.origin ?? "PROPIO");
  const [status, setStatus] = useState<KnowledgeStatus>(note?.status ?? "PENDIENTE");
  const [tags, setTags] = useState(note?.tags.join(" ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveKnowledgeNote({
      id: note?.id,
      collection,
      title,
      body,
      origin,
      status: collection === "EXPERIMENTOS" ? status : undefined,
      tags,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={note ? "Corregir nota" : "Nueva nota"}
      description={COLLECTION_HINT[collection]}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-collection">
            Colección
          </label>
          {/* Una nota no cambia de colección: mover algo de RADAR a WINNERS es escribir otra nota. */}
          <Select
            id="knowledge-collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value as KnowledgeCollection)}
            disabled={note !== null}
          >
            {KNOWLEDGE_COLLECTIONS.map((c) => (
              <option key={c} value={c}>
                {COLLECTION_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-title">
            Título
          </label>
          <Input
            id="knowledge-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Corto y fácil de buscar"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-body">
            Nota
          </label>
          <Textarea id="knowledge-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-36" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-origin">
              Origen
            </label>
            <Select id="knowledge-origin" value={origin} onChange={(e) => setOrigin(e.target.value as KnowledgeOrigin)}>
              {KNOWLEDGE_ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABEL[o]}
                </option>
              ))}
            </Select>
          </div>
          {collection === "EXPERIMENTOS" ? (
            <div>
              <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-status">
                Estado
              </label>
              <Select id="knowledge-status" value={status} onChange={(e) => setStatus(e.target.value as KnowledgeStatus)}>
                {KNOWLEDGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="knowledge-tags">
            Etiquetas
          </label>
          <Input id="knowledge-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hook reels ia" />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
