"use client";

import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteCompetitor, refreshCompetitor, updateCompetitorResultsLimit } from "@/lib/brand/competitors/actions";
import { estimateRunCostUsd, MAX_RESULTS_LIMIT } from "@/lib/brand/competitors/schema";

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

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
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy !== null || running}
          onClick={handleRefresh}
          title={`Trae de nuevo ${resultsLimit} publicaciones: unos ${usd.format(estimateRunCostUsd(resultsLimit))} (estimado)`}
        >
          {busy === "refresh" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Actualizar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Editar cuántas publicaciones trae @${username}`}
          title="Cuántas publicaciones trae la próxima actualización"
          disabled={busy !== null}
          onClick={() => {
            setLimit(String(resultsLimit));
            setError(null);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`Dejar de seguir a @${username}`} disabled={busy !== null} onClick={handleDelete}>
          {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
      {error ? <p className="max-w-56 text-right text-xs text-danger">{error}</p> : null}

      <Dialog
        open={editing}
        onClose={busy === "limit" ? () => undefined : () => setEditing(false)}
        title={`Publicaciones por corrida de @${username}`}
        description="Se aplica a la próxima actualización. No trae nada ahora."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted">Publicaciones a traer</label>
            <Input type="number" min={1} max={MAX_RESULTS_LIMIT} value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus />
            <p className="mt-1 text-xs text-muted">
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
