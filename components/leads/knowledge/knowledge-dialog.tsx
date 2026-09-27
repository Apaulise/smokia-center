"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { saveKnowledgeNote } from "@/lib/leads/knowledge/actions";
import type { KnowledgeRow } from "@/lib/leads/knowledge/queries";
import {
  COLLECTION_HINT,
  COLLECTION_LABEL,
  KNOWLEDGE_COLLECTIONS,
  KNOWLEDGE_ORIGINS,
  ORIGIN_LABEL,
  type KnowledgeCollection,
  type KnowledgeOrigin,
} from "@/lib/leads/knowledge/schema";

/**
 * Alta y corrección de una nota (Plan §1.18) — calco de
 * `components/brand/knowledge/knowledge-dialog.tsx`, sin `status` (esta
 * memoria no tiene una colección tipo EXPERIMENTOS).
 */
export function KnowledgeDialog({
  open,
  note,
  defaultCollection,
  defaultLeadId,
  prefill,
  onClose,
}: {
  open: boolean;
  note: KnowledgeRow | null;
  defaultCollection: KnowledgeCollection;
  defaultLeadId?: string;
  /** Sólo se usa cuando `note` es null: precarga una nota nueva (Plan §1.18, "Guardar en memoria global" desde una señal). */
  prefill?: { title: string; body: string };
  onClose: () => void;
}) {
  const [collection, setCollection] = useState<KnowledgeCollection>(note?.collection ?? defaultCollection);
  const [title, setTitle] = useState(note?.title ?? prefill?.title ?? "");
  const [body, setBody] = useState(note?.body ?? prefill?.body ?? "");
  const [origin, setOrigin] = useState<KnowledgeOrigin>(note?.origin ?? "PROPIO");
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
      tags,
      leadId: note?.lead_id ?? defaultLeadId,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={note ? "Corregir nota" : "Nueva nota"} description={COLLECTION_HINT[collection]}>
      <div className="flex flex-col gap-4">
        <Field label="Colección" htmlFor="sales-knowledge-collection">
          <Select
            id="sales-knowledge-collection"
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
        </Field>
        <Field label="Título" htmlFor="sales-knowledge-title">
          <Input id="sales-knowledge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Corto y fácil de buscar" autoFocus />
        </Field>
        <Field label="Nota" htmlFor="sales-knowledge-body">
          <Textarea id="sales-knowledge-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-36" />
        </Field>
        <Field label="Origen" htmlFor="sales-knowledge-origin">
          <Select id="sales-knowledge-origin" value={origin} onChange={(e) => setOrigin(e.target.value as KnowledgeOrigin)}>
            {KNOWLEDGE_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {ORIGIN_LABEL[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Etiquetas" htmlFor="sales-knowledge-tags">
          <Input id="sales-knowledge-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rubro objecion angulo" />
        </Field>
        {error ? <p className="text-xs text-lm-danger">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
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
