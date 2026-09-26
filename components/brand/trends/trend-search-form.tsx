"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchTrends } from "@/lib/brand/trends/actions";
import { estimateRunCostUsd, MAX_RESULTS_LIMIT } from "@/lib/brand/competitors/schema";
import { TREND_MIN_VIEWS } from "@/lib/brand/competitors/insights";
import { DEFAULT_TREND_RESULTS_LIMIT, MAX_TREND_HASHTAGS, parseHashtags } from "@/lib/brand/trends/schema";

const compactNumber = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 0 });

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * "Buscar virales" (Plans/03 §3.15): pide hashtags del nicho y trae reels de
 * CUALQUIER cuenta que explotó ahí, sin haberla seguido antes. Precargado con
 * la última búsqueda, para no retipar el nicho cada vez.
 */
export function TrendSearchButton({ lastQuery }: { lastQuery: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hashtags, setHashtags] = useState(lastQuery ?? "");
  const [limit, setLimit] = useState(String(DEFAULT_TREND_RESULTS_LIMIT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLimit = Number(limit);
  const validLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= MAX_RESULTS_LIMIT;
  const tags = parseHashtags(hashtags);
  const validTags = tags.length > 0 && tags.length <= MAX_TREND_HASHTAGS;

  async function handleSearch() {
    setBusy(true);
    setError(null);
    const result = await searchTrends({ hashtags, resultsLimit: parsedLimit });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" />
        Buscar virales
      </Button>

      <Dialog
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title="Buscar virales del nicho"
        description={`Trae reels recientes de cualquier cuenta que explotó bajo estos hashtags, sin necesidad de seguirla. Sólo entran los que ya pasan ${compactNumber.format(TREND_MIN_VIEWS)} views: puede que no aparezca ninguno.`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted">Hashtags del nicho</label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="iaparaemprendedores, automatizacion"
              autoFocus
            />
            <p className={validTags || !hashtags.trim() ? "mt-1 text-xs text-muted" : "mt-1 text-xs text-danger"}>
              {tags.length > 0 ? `Se busca: ${tags.map((tag) => `#${tag}`).join(", ")}.` : "Separados por coma."} Máximo {MAX_TREND_HASHTAGS}.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">Reels a traer</label>
            <Input type="number" min={1} max={MAX_RESULTS_LIMIT} value={limit} onChange={(e) => setLimit(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              Apify cobra por resultado. {validLimit ? `Esta corrida cuesta unos ${usd.format(estimateRunCostUsd(parsedLimit))} (estimado).` : `Entre 1 y ${MAX_RESULTS_LIMIT}.`}
            </p>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleSearch} disabled={busy || !validTags || !validLimit}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {busy ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
