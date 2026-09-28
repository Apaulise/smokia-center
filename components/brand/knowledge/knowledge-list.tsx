"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { KnowledgeDialog } from "@/components/brand/knowledge/knowledge-dialog";
import { Markdown } from "@/components/brand/markdown";
import { Eyebrow, Tag } from "@/components/brand/ui/card";
import { Button } from "@/components/leads/ui/button";
import { EmptyLine } from "@/components/leads/ui/feedback";
import { deleteKnowledgeNote } from "@/lib/brand/knowledge/actions";
import type { KnowledgeRow } from "@/lib/brand/knowledge/queries";
import {
  COLLECTION_HINT,
  COLLECTION_LABEL,
  ORIGIN_LABEL,
  STATUS_LABEL,
  type KnowledgeCollection,
} from "@/lib/brand/knowledge/schema";
import { cn } from "@/lib/utils";

/** El `data` lo escribe el modelo: se muestra como texto, y un link sólo si es http(s). */
function DataValue({ value }: { value: unknown }) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" className="break-all text-lm-signal-text hover:underline">
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

function KnowledgeEntry({
  note,
  open,
  onToggle,
  onEdit,
}: {
  note: KnowledgeRow;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
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
    <article
      className={cn(
        "rounded-lm-lg border border-lm-line transition-colors duration-150 hover:border-lm-line-strong",
        open ? "bg-lm-raised/60" : "bg-lm-surface/50",
      )}
    >
      {/* La cabecera de la card abre y cierra la nota; el cuerpo abierto queda afuera para que sus links y botones no sean hijos de un botón. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer flex-col gap-2 px-[18px] py-4 focus-visible:lm-focus"
      >
        <div className="flex items-center gap-2.5">
          <Tag tone="solid">{ORIGIN_LABEL[note.origin]}</Tag>
          {note.status ? <Tag>{STATUS_LABEL[note.status]}</Tag> : null}
          <time dateTime={note.created_at} className="flex-1 font-mono text-[11px] text-lm-ink-3">
            {formatDate(note.created_at)}
          </time>
          <ChevronDown className={cn("size-3.5 text-lm-ink-3 transition-transform duration-150", open && "rotate-180")} />
        </div>
        <h3 className="font-lm-sans text-[15px] leading-[1.4] font-medium text-balance">{note.title}</h3>
        {!open && preview ? <p className="line-clamp-2 text-[13px] leading-[1.6] text-lm-ink-2">{preview}</p> : null}
      </div>

      {open ? (
        <div className="px-[18px] pb-4">
          <div className="flex flex-col gap-4">
            {note.body ? <Markdown className="text-[13px] leading-[1.6] text-lm-ink-2">{note.body}</Markdown> : <p className="text-[13px] text-lm-ink-2">Sin texto.</p>}

            {data.length > 0 ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {data.map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <dt>
                      <Eyebrow>{key.replace(/_/g, " ")}</Eyebrow>
                    </dt>
                    <dd className="text-[13px] text-lm-ink">
                      <DataValue value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {note.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-[22px] items-center rounded-lm-sm bg-lm-raised px-2 font-mono text-[11.5px] text-lm-ink-2"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {error ? <p className="text-xs text-lm-danger">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lm-line pt-2 text-xs text-lm-ink-3">
              {note.post_id || note.content_item_id ? (
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {note.post_id ? (
                    <span>
                      Salió de:{" "}
                      <Link href={`/marca/contenido/${note.post_id}`} className="text-lm-smoke-5 transition-colors hover:text-lm-signal-text">
                        la pieza
                      </Link>
                    </span>
                  ) : null}
                  {note.content_item_id ? (
                    <Link href="/marca/planificador" className="text-lm-smoke-5 transition-colors hover:text-lm-signal-text">
                      Ver en el planificador →
                    </Link>
                  ) : null}
                </span>
              ) : null}
              <span className="flex-1" />
              {confirming ? (
                <>
                  <span>¿Borrar esta nota? No se puede deshacer.</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                    Borrar
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="cursor-pointer text-lm-ink-2 transition-colors hover:text-lm-ink"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="cursor-pointer text-lm-ink-2 transition-colors hover:text-lm-danger"
                  >
                    Borrar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * La lista de una colección, con el alta y la corrección de notas. Es cliente
 * porque abre de a una nota por vez; al cambiar de colección o de búsqueda la
 * `key` de la página la remonta y las notas vuelven a estar cerradas.
 *
 * El encabezado (título, buscador, tabs) llega como slots: "Nueva nota" abre
 * el diálogo de este componente, así que tiene que vivir acá.
 */
export function KnowledgeList({
  collection,
  notes,
  searching,
  heading,
  search,
  tabs,
}: {
  collection: KnowledgeCollection;
  notes: KnowledgeRow[];
  /** Hay un texto de búsqueda activo: el vacío significa "sin resultados", no "colección vacía". */
  searching: boolean;
  heading: ReactNode;
  search: ReactNode;
  tabs: ReactNode;
}) {
  const [dialog, setDialog] = useState<{ note: KnowledgeRow | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 px-6 pt-7 lg:px-8">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">{heading}</div>
        {search}
        <Button type="button" className="h-8 px-3 text-[12.5px]" onClick={() => setDialog({ note: null })}>
          + Nueva nota
        </Button>
      </div>

      <div className="px-6 pt-5 lg:px-8">{tabs}</div>

      <div className="flex max-w-[1000px] flex-col gap-2.5 px-6 pt-5 pb-10 lg:px-8">
        <p className="pb-1 text-[12.5px] text-lm-ink-3">{COLLECTION_HINT[collection]}</p>

        {notes.length === 0 ? (
          <EmptyLine>
            {searching
              ? "Ninguna nota coincide con la búsqueda. Probá con menos palabras: tienen que aparecer todas en el título o en el texto."
              : `Todavía no hay notas en ${COLLECTION_LABEL[collection]}. El agente las va escribiendo desde el chat de generación, o las podés cargar vos con “Nueva nota”.`}
          </EmptyLine>
        ) : (
          notes.map((note) => (
            <KnowledgeEntry
              key={note.id}
              note={note}
              open={openId === note.id}
              onToggle={() => setOpenId((current) => (current === note.id ? null : note.id))}
              onEdit={() => setDialog({ note })}
            />
          ))
        )}
      </div>

      {dialog ? (
        <KnowledgeDialog
          key={dialog.note?.id ?? "new"}
          open
          note={dialog.note}
          defaultCollection={collection}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
