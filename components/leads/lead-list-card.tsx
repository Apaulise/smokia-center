"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Pencil, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteLeadList, renameLeadList } from "@/lib/leads/actions";
import { CSV_PROVIDER_META, getProvider } from "@/lib/providers/registry";
import type { LeadListOverviewRow } from "@/lib/leads/queries";

const JOB_STATUS_LABEL: Record<LeadListOverviewRow["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

const JOB_STATUS_TONE: Record<LeadListOverviewRow["status"], BadgeTone> = {
  PENDIENTE: "neutral",
  EN_CURSO: "cyan",
  COMPLETADO: "positive",
  FALLIDO: "danger",
};

function sourceLabel(source: LeadListOverviewRow["source"]) {
  if (source === "CSV" || source === "MANUAL") return CSV_PROVIDER_META.label;
  return getProvider(source)?.label ?? source;
}

/** Una lista en la previsualización de /leads/lista: elegir, renombrar o borrar sin entrar a sus leads. */
export function LeadListCard({ list }: { list: LeadListOverviewRow }) {
  const leadCount = list.leads[0]?.count ?? 0;

  return (
    <Card>
      <CardHeader
        title={list.name}
        description={new Date(list.created_at).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
        action={<Badge tone={JOB_STATUS_TONE[list.status]}>{JOB_STATUS_LABEL[list.status]}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{sourceLabel(list.source)}</Badge>
          {list.industries ? <Badge color={list.industries.color}>{list.industries.name}</Badge> : null}
        </div>

        <p className="tabular text-sm text-muted">
          {leadCount} {leadCount === 1 ? "lead" : "leads"}
        </p>

        <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-4">
          <ButtonLink href={`/leads/lista/${list.id}`} variant="secondary" size="sm">
            Ver leads
            <ArrowRight className="size-3.5" />
          </ButtonLink>
          <div className="flex items-center gap-1">
            <RenameButton listId={list.id} currentName={list.name} />
            <DeleteButton listId={list.id} listName={list.name} leadCount={leadCount} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RenameButton({ listId, currentName }: { listId: string; currentName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label="Editar nombre" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
      </Button>

      {open ? <RenameForm listId={listId} currentName={currentName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RenameForm({
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
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={listId} />
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor={`name-${listId}`}>
            Nombre
          </label>
          <Input id={`name-${listId}`} name="name" defaultValue={currentName} maxLength={80} required autoFocus />
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
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

function DeleteButton({ listId, listName, leadCount }: { listId: string; listName: string; leadCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label="Eliminar lista" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5 text-danger" />
      </Button>

      {open ? (
        <DeleteForm listId={listId} listName={listName} leadCount={leadCount} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function DeleteForm({
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
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={listId} />

        <p className="flex items-start gap-2 rounded-[12px] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {leadCount > 0
            ? `Esto también borra los ${leadCount} ${leadCount === 1 ? "lead" : "leads"} de esta lista. No se puede deshacer.`
            : "Esta acción no se puede deshacer."}
        </p>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
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
