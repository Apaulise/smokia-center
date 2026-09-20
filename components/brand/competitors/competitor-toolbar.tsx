"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addCompetitor, refreshAllCompetitors } from "@/lib/brand/competitors/actions";
import {
  DEFAULT_RESULTS_LIMIT,
  estimateRunCostUsd,
  MAX_RESULTS_LIMIT,
  parseInstagramUsername,
} from "@/lib/brand/competitors/schema";

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** "Agregar cuenta": pide el usuario y cuántas publicaciones traer, y muestra cuánto cuesta ANTES de lanzar la corrida. */
export function AddCompetitorButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState(String(DEFAULT_RESULTS_LIMIT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLimit = Number(limit);
  const validLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= MAX_RESULTS_LIMIT;
  const detected = username.trim() ? parseInstagramUsername(username) : null;

  async function handleAdd() {
    setBusy(true);
    setError(null);
    const result = await addCompetitor({ username, resultsLimit: parsedLimit });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      // Si se guardó pero la corrida no arrancó, la cuenta ya está en la lista: hay que refrescar igual.
      router.refresh();
      return;
    }
    setOpen(false);
    setUsername("");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Agregar cuenta
      </Button>

      <Dialog
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title="Seguir una cuenta"
        description="Trae sus publicaciones recientes y las compara contra su propio rendimiento habitual."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted">Usuario o link del perfil</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@usuario o https://instagram.com/usuario" autoFocus />
            {username.trim() ? (
              <p className={detected ? "mt-1 text-xs text-muted" : "mt-1 text-xs text-danger"}>
                {detected ? `Se va a seguir a @${detected}.` : "No parece un usuario de Instagram."}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">Publicaciones a traer</label>
            <Input type="number" min={1} max={MAX_RESULTS_LIMIT} value={limit} onChange={(e) => setLimit(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              Apify cobra por resultado. {validLimit ? `Esta corrida cuesta unos ${usd.format(estimateRunCostUsd(parsedLimit))} (estimado).` : `Entre 1 y ${MAX_RESULTS_LIMIT}.`}{" "}
              Para probar, usá pocas: con menos de 5 publicaciones de un mismo tipo no hay rendimiento habitual contra qué comparar.
            </p>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleAdd} disabled={busy || !detected || !validLimit}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {busy ? "Iniciando…" : "Seguir y traer publicaciones"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** "Actualizar todas": lanza una corrida por cuenta, así que pide confirmación con el costo total antes. */
export function RefreshAllButton({ competitorCount, totalResultsLimit }: { competitorCount: number; totalResultsLimit: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    const cost = usd.format(estimateRunCostUsd(totalResultsLimit));
    if (!window.confirm(`Se lanza una corrida por cada una de las ${competitorCount} cuentas: unos ${cost} en total (estimado). ¿Seguir?`)) return;

    setBusy(true);
    setMessage(null);
    const result = await refreshAllCompetitors();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
    else if (result.skipped > 0) setMessage(`${result.skipped} ya se estaban actualizando y se saltearon.`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-xs text-muted">{message}</span> : null}
      <Button type="button" variant="secondary" size="sm" onClick={handleRefresh} disabled={busy || competitorCount === 0}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Actualizar todas
      </Button>
    </div>
  );
}
