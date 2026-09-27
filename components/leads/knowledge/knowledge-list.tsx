"use client";

import { BookMarked, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { KnowledgeDialog } from "@/components/leads/knowledge/knowledge-dialog";
import { Button } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { Chip } from "@/components/leads/ui/status-badge";
import { deleteKnowledgeNote } from "@/lib/leads/knowledge/actions";
import type { KnowledgeRow } from "@/lib/leads/knowledge/queries";
import { COLLECTION_HINT, COLLECTION_LABEL, ORIGIN_LABEL, type KnowledgeCollection, type KnowledgeOrigin } from "@/lib/leads/knowledge/schema";
import { cn } from "@/lib/utils";

// PROPIO = salió de un lead real (verificado); MERCADO = informativo; HIPOTESIS = sin confirmar (borde punteado, como una objeción del Copilot).
const ORIGIN_DOT: Record<KnowledgeOrigin, string> = { PROPIO: "bg-lm-success", MERCADO: "bg-lm-info", HIPOTESIS: "bg-lm-smoke-4" };
const ORIGIN_STYLE: Record<KnowledgeOrigin, string> = {
  PROPIO: "border-transparent bg-lm-success-soft text-lm-ink",
  MERCADO: "border-lm-line text-lm-ink-2",
  HIPOTESIS: "border-dashed border-lm-line-strong text-lm-ink-2",
};

function OriginBadge({ origin }: { origin: KnowledgeOrigin }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-lm-sm border px-2 text-xs font-medium", ORIGIN_STYLE[origin])}>
      <span className={cn("size-1.5 shrink-0 rounded-full", ORIGIN_DOT[origin])} />
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

function DataValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>—</>;
  if (typeof value === "object") return <>{Array.isArray(value) ? value.map(String).join(", ") : JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

function KnowledgeEntry({ note, onEdit }: { note: KnowledgeRow; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = note.data && typeof note.data === "object" && !Array.isArray(note.data) ? Object.entries(note.data) : [];

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteKnowledgeNote(note.id);
    if (!result.ok) {
      setError(result.message);
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <details className="group rounded-lm-lg border border-lm-line-strong bg-lm-surface">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <OriginBadge origin={note.origin} />
            <time dateTime={note.created_at} className="font-mono text-xs text-lm-ink-3">
              {new Date(note.created_at).toLocaleDateString("es-AR")}
            </time>
          </div>
          <h3 className="text-[15px] font-semibold text-lm-ink">{note.title}</h3>
          {note.body ? <p className="line-clamp-2 text-[13px] text-lm-ink-2 group-open:hidden">{note.body}</p> : null}
        </div>
        <ChevronDown className="mt-1 size-4 shrink-0 text-lm-ink-3 transition-transform group-open:rotate-180" strokeWidth={1.5} />
      </summary>

      <div className="flex flex-col gap-4 border-t border-lm-line px-5 py-5">
        {note.body ? <p className="text-[13px] whitespace-pre-line text-lm-ink">{note.body}</p> : <p className="text-[13px] text-lm-ink-3">Sin texto.</p>}

        {data.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {data.map(([key, value]) => (
              <div key={key}>
                <dt className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">{key.replace(/_/g, " ")}</dt>
                <dd className="mt-0.5 text-[13px] text-lm-ink">
                  <DataValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {note.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        ) : null}

        {note.lead_id ? (
          <Link href={`/leads/${note.lead_id}`} className="text-[13px] text-lm-signal-text hover:underline">
            Ver el lead
          </Link>
        ) : null}

        {error ? <p className="text-xs text-lm-danger">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 border-t border-lm-line pt-4">
          {confirming ? (
            <>
              <span className="mr-1 text-xs text-lm-ink-3">¿Borrar esta nota? No se puede deshacer.</span>
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

/** La lista de una colección, con el alta y la corrección de notas (Plan §1.18). */
export function KnowledgeList({ collection, notes, searching }: { collection: KnowledgeCollection; notes: KnowledgeRow[]; searching: boolean }) {
  const [dialog, setDialog] = useState<{ note: KnowledgeRow | null } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-lm-ink-2">{COLLECTION_HINT[collection]}</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ note: null })}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          Nueva nota
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="size-5" strokeWidth={1.5} />}
          title={searching ? "Ninguna nota coincide con la búsqueda" : `Todavía no hay notas en ${COLLECTION_LABEL[collection]}`}
          description={
            searching
              ? "Probá con menos palabras: tienen que aparecer todas en el título o en el texto."
              : "Cargala vos con “Nueva nota”, o guardala desde una señal confirmada en la ficha de un lead."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <KnowledgeEntry key={note.id} note={note} onEdit={() => setDialog({ note })} />
          ))}
        </div>
      )}

      {dialog ? <KnowledgeDialog key={dialog.note?.id ?? "new"} open note={dialog.note} defaultCollection={collection} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
