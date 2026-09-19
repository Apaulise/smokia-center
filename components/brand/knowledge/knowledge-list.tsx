"use client";

import { BookMarked, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { KnowledgeDialog } from "@/components/brand/knowledge/knowledge-dialog";
import { Markdown } from "@/components/brand/markdown";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteKnowledgeNote } from "@/lib/brand/knowledge/actions";
import type { KnowledgeRow } from "@/lib/brand/knowledge/queries";
import {
  COLLECTION_HINT,
  COLLECTION_LABEL,
  ORIGIN_LABEL,
  STATUS_LABEL,
  type KnowledgeCollection,
  type KnowledgeOrigin,
  type KnowledgeStatus,
} from "@/lib/brand/knowledge/schema";

// Cyan = resultado medido (manual §9): sólo lo PROPIO salió de métricas de Agus.
// Violeta = proceso: una hipótesis es algo en camino. Lo que se vio afuera queda neutro.
const ORIGIN_TONE: Record<KnowledgeOrigin, BadgeTone> = { PROPIO: "cyan", MERCADO: "neutral", HIPOTESIS: "violet" };
const STATUS_TONE: Record<KnowledgeStatus, BadgeTone> = { PENDIENTE: "violet", ACTIVO: "cyan", CONCLUIDO: "positive" };

/** El `data` lo escribe el modelo: se muestra como texto, y un link sólo si es http(s). */
function DataValue({ value }: { value: unknown }) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" className="break-all text-cyan hover:underline">
        {value}
      </a>
    );
  }
  if (value === null || value === undefined) return <>—</>;
  if (typeof value === "object") return <>{Array.isArray(value) ? value.map(String).join(", ") : JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

function plainPreview(markdown: string | null) {
  return (markdown ?? "").replace(/[#*_`>|~-]+/g, " ").replace(/\s+/g, " ").trim();
}

function KnowledgeEntry({ note, onEdit }: { note: KnowledgeRow; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = note.data && typeof note.data === "object" && !Array.isArray(note.data) ? Object.entries(note.data) : [];
  const preview = plainPreview(note.body);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteKnowledgeNote(note.id);
    if (!result.ok) {
      setError(result.message);
      setDeleting(false);
      setConfirming(false);
    }
    // Si salió bien, la lista se revalida y esta tarjeta desaparece sola.
  }

  return (
    <details className="group rounded-[20px] border border-line bg-elevated/70">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORIGIN_TONE[note.origin]}>{ORIGIN_LABEL[note.origin]}</Badge>
            {note.status ? <Badge tone={STATUS_TONE[note.status]}>{STATUS_LABEL[note.status]}</Badge> : null}
            <time dateTime={note.created_at} className="text-xs text-muted">
              {new Date(note.created_at).toLocaleDateString("es-AR")}
            </time>
          </div>
          <h3 className="text-base text-ink">{note.title}</h3>
          {preview ? <p className="line-clamp-2 text-sm text-muted group-open:hidden">{preview}</p> : null}
        </div>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-line/60 px-6 py-5">
        {note.body ? <Markdown>{note.body}</Markdown> : <p className="text-sm text-muted">Sin texto.</p>}

        {data.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {data.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium tracking-wide text-muted uppercase">{key.replace(/_/g, " ")}</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  <DataValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {note.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <Badge key={tag} tone="violet">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {note.post_id || note.content_item_id ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {note.post_id ? (
              <Link href={`/marca/contenido/${note.post_id}`} className="text-cyan hover:underline">
                Ver la pieza
              </Link>
            ) : null}
            {note.content_item_id ? (
              <Link href="/marca/ideas" className="text-cyan hover:underline">
                Ver ideas guardadas
              </Link>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-4">
          {confirming ? (
            <>
              <span className="mr-1 text-xs text-muted">¿Borrar esta nota? No se puede deshacer.</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                Borrar
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Borrar
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
                Corregir
              </Button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}

/** La lista de una colección, con el alta y la corrección de notas. */
export function KnowledgeList({
  collection,
  notes,
  searching,
}: {
  collection: KnowledgeCollection;
  notes: KnowledgeRow[];
  /** Hay un texto de búsqueda activo: el vacío significa "sin resultados", no "colección vacía". */
  searching: boolean;
}) {
  const [dialog, setDialog] = useState<{ note: KnowledgeRow | null } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">{COLLECTION_HINT[collection]}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ note: null })}>
          <Plus className="size-3.5" />
          Nueva nota
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="size-5" />}
          title={searching ? "Ninguna nota coincide con la búsqueda" : `Todavía no hay notas en ${COLLECTION_LABEL[collection]}`}
          description={
            searching
              ? "Probá con menos palabras: tienen que aparecer todas en el título o en el texto."
              : "El agente las va escribiendo desde el chat de generación, o las podés cargar vos con “Nueva nota”."
          }
        />
      ) : (
        notes.map((note) => <KnowledgeEntry key={note.id} note={note} onEdit={() => setDialog({ note })} />)
      )}

      {dialog ? (
        <KnowledgeDialog
          key={dialog.note?.id ?? "new"}
          open
          note={dialog.note}
          defaultCollection={collection}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
