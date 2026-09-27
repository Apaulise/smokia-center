"use client";

import { AlertTriangle, CheckCircle2, Loader2, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input } from "@/components/leads/ui/field";
import { RowMenuTrigger } from "@/components/leads/ui/table";
import { deleteLeadList, renameLeadList } from "@/lib/leads/actions";
import { cn } from "@/lib/utils";

/**
 * Menú "⋯" de una lista (Design System DataTable: "acciones de fila en un
 * menú que aparece en hover, nunca íconos rojos siempre visibles"). Se
 * reutiliza en la tabla y en la grilla de /leads/lista.
 */
export function ListActionsMenu({
  listId,
  listName,
  leadCount,
  variant = "row",
}: {
  listId: string;
  listName: string;
  leadCount: number;
  /** "row": botón ⋯ que sólo se ve en hover (dentro de una fila). "standalone": siempre visible (card). */
  variant?: "row" | "standalone";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <div ref={ref} className="relative inline-block">
      {variant === "row" ? (
        <RowMenuTrigger aria-label="Más acciones" onClick={() => setMenuOpen((v) => !v)}>
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </RowMenuTrigger>
      ) : (
        <button
          type="button"
          aria-label="Más acciones"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex size-7 items-center justify-center rounded-lm-sm text-lm-ink-3 hover:bg-lm-overlay hover:text-lm-ink"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </button>
      )}

      {menuOpen ? (
        <div className="lm-shadow-pop absolute right-0 z-20 mt-1 w-42 overflow-hidden rounded-lm-md border border-lm-line bg-lm-raised py-1 font-lm-sans text-[13px]">
          <button
            type="button"
            onClick={() => {
              setDialog("rename");
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-lm-ink hover:bg-lm-overlay"
          >
            <Pencil className="size-3.5 text-lm-ink-3" strokeWidth={1.5} />
            Renombrar
          </button>
          <div className="my-1 border-t border-lm-line" />
          <button
            type="button"
            onClick={() => {
              setDialog("delete");
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-lm-danger hover:bg-lm-danger-soft"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
            Eliminar lista…
          </button>
        </div>
      ) : null}

      {dialog === "rename" ? (
        <RenameDialog listId={listId} currentName={listName} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteDialog listId={listId} listName={listName} leadCount={leadCount} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function RenameDialog({
  listId,
  currentName,
  onClose,
}: {
  listId: string;
  currentName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(renameLeadList, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title="Editar nombre de la lista">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={listId} />
        <Field label="Nombre" htmlFor={`name-${listId}`}>
          <Input id={`name-${listId}`} name="name" defaultValue={currentName} maxLength={80} required autoFocus />
        </Field>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  listId,
  listName,
  leadCount,
  onClose,
}: {
  listId: string;
  listName: string;
  leadCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteLeadList, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title="Eliminar lista" description={listName}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={listId} />

        <p
          className={cn(
            "flex items-start gap-2 rounded-lm-sm border border-lm-danger-soft bg-lm-danger-soft p-3 text-[13px] text-lm-danger",
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {leadCount > 0
            ? `Esto también borra los ${leadCount} ${leadCount === 1 ? "lead" : "leads"} de esta lista. No se puede deshacer.`
            : "Esta acción no se puede deshacer."}
        </p>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Eliminar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
