"use client";

import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Input } from "@/components/leads/ui/field";
import { deleteCompetitor, refreshCompetitor, updateCompetitorResultsLimit } from "@/lib/brand/competitors/actions";
import { estimateRunCostUsd, MAX_RESULTS_LIMIT } from "@/lib/brand/competitors/schema";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** Botón de ícono de 28px: gris hasta el hover; el de eliminar vira al rojo suave. */
function IconAction({
  label,
  title,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 cursor-pointer place-items-center rounded-lm-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
        danger ? "hover:bg-lm-danger-soft hover:text-lm-danger" : "hover:bg-lm-ink/5 hover:text-lm-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Actualizar (cuesta plata: dice cuánto), editar cuántas trae, y dejar de seguir (con confirmación: borra las publicaciones traídas). */
export function CompetitorRowActions({
  id,
  username,
  resultsLimit,
  running,
}: {
  id: string;
  username: string;
  resultsLimit: number;
  running: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refresh" | "delete" | "limit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(resultsLimit));

  const parsedLimit = Number(limit);
  const validLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= MAX_RESULTS_LIMIT;

  async function handleRefresh() {
    setBusy("refresh");
    setError(null);
    const result = await refreshCompetitor(id);
    setBusy(null);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  async function handleSaveLimit() {
    setBusy("limit");
    setError(null);
    const result = await updateCompetitorResultsLimit({ id, resultsLimit: parsedLimit });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`¿Dejar de seguir a @${username}? Se borran las publicaciones que se trajeron.`)) return;
    setBusy("delete");
    setError(null);
    const result = await deleteCompetitor(id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-0.5 text-lm-ink-3">
        <IconAction
          label={`Actualizar @${username}`}
          title={`Trae de nuevo ${resultsLimit} publicaciones: unos ${usd.format(estimateRunCostUsd(resultsLimit))} (estimado)`}
          disabled={busy !== null || running}
          onClick={handleRefresh}
        >
          {busy === "refresh" ? <Loader2 className="size-[13px] animate-spin" /> : <RefreshCw className="size-[13px]" />}
        </IconAction>
        <IconAction
          label={`Editar cuántas publicaciones trae @${username}`}
          title="Cuántas publicaciones trae la próxima actualización"
          disabled={busy !== null}
          onClick={() => {
            setLimit(String(resultsLimit));
            setError(null);
            setEditing(true);
          }}
        >
          <Pencil className="size-[13px]" />
        </IconAction>
        <IconAction
          label={`Dejar de seguir a @${username}`}
          title="Dejar de seguir"
          danger
          disabled={busy !== null}
          onClick={handleDelete}
        >
          {busy === "delete" ? <Loader2 className="size-[13px] animate-spin" /> : <Trash2 className="size-[13px]" />}
        </IconAction>
      </div>
      {error ? <p className="max-w-56 text-right text-xs text-lm-danger">{error}</p> : null}

      <Dialog
        open={editing}
        onClose={busy === "limit" ? () => undefined : () => setEditing(false)}
        title={`Publicaciones por corrida de @${username}`}
        description="Se aplica a la próxima actualización. No trae nada ahora."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-lm-ink-2">Publicaciones a traer</label>
            <Input type="number" min={1} max={MAX_RESULTS_LIMIT} value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus />
            <p className="mt-1 text-xs text-lm-ink-2">
              Apify cobra por resultado.{" "}
              {validLimit
                ? `Cada actualización de esta cuenta va a costar unos ${usd.format(estimateRunCostUsd(parsedLimit))} (estimado).`
                : `Entre 1 y ${MAX_RESULTS_LIMIT}.`}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy === "limit"}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleSaveLimit} disabled={busy === "limit" || !validLimit}>
              {busy === "limit" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
