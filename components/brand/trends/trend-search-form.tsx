"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Input } from "@/components/leads/ui/field";
import { searchTrends, searchTrendsMeta } from "@/lib/brand/trends/actions";
import { estimateRunCostUsd, MAX_RESULTS_LIMIT } from "@/lib/brand/competitors/schema";
import { TREND_MIN_LIKES, TREND_MIN_VIEWS } from "@/lib/brand/competitors/insights";
import type { MetaDiscoveryStatus } from "@/lib/brand/trends/queries";
import { DEFAULT_TREND_RESULTS_LIMIT, MAX_TREND_HASHTAGS, META_HASHTAGS_PER_WEEK, parseHashtags } from "@/lib/brand/trends/schema";

const compactNumber = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 0 });

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

function SourceOption({
  checked,
  disabled,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-start gap-2.5 rounded-lm-md border border-lm-line p-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-current"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-lm-ink">{title}</span>
        <span className="text-xs leading-normal text-lm-ink-2">{children}</span>
      </span>
    </label>
  );
}

/**
 * "Buscar virales" (Plans/03 §3.15 y §3.17): pide hashtags del nicho y trae
 * piezas de CUALQUIER cuenta que explotó ahí, sin haberla seguido antes. Dos
 * fuentes que se pueden combinar: Apify (reels recientes, con views, cobra) y
 * la API oficial de Meta (lo más popular del hashtag, por likes, gratis).
 * Precargado con la última búsqueda, para no retipar el nicho cada vez.
 */
export function TrendSearchButton({ lastQuery, metaStatus }: { lastQuery: string | null; metaStatus: MetaDiscoveryStatus }) {
  const router = useRouter();
  const metaReady = metaStatus.state === "ready";
  const [open, setOpen] = useState(false);
  const [hashtags, setHashtags] = useState(lastQuery ?? "");
  const [limit, setLimit] = useState(String(DEFAULT_TREND_RESULTS_LIMIT));
  const [useApify, setUseApify] = useState(true);
  const [useMeta, setUseMeta] = useState(metaReady);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLimit = Number(limit);
  const validLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= MAX_RESULTS_LIMIT;
  const tags = parseHashtags(hashtags);
  const validTags = tags.length > 0 && tags.length <= MAX_TREND_HASHTAGS;
  const canSearch = validTags && (useApify || useMeta) && (!useApify || validLimit);

  async function handleSearch() {
    setBusy(true);
    setError(null);

    // Las dos fuentes corren a la vez: Apify sólo lanza la corrida y Meta contesta en la misma llamada.
    const jobs: Promise<{ label: string; ok: boolean; message: string }>[] = [];
    if (useApify) {
      jobs.push(searchTrends({ hashtags, resultsLimit: parsedLimit }).then((r) => ({ label: "Apify", ok: r.ok, message: r.ok ? "" : r.message })));
    }
    if (useMeta) {
      jobs.push(
        searchTrendsMeta({ hashtags }).then((r) => ({
          label: "API de Meta",
          ok: r.ok,
          message: r.ok ? "" : r.message,
        })),
      );
    }
    const results = await Promise.all(jobs);
    setBusy(false);

    const failed = results.filter((result) => !result.ok);
    // Lo que sí entró se ve igual, aunque la otra fuente haya fallado.
    router.refresh();
    if (failed.length === 0) {
      setOpen(false);
      return;
    }
    setError(failed.map((result) => `${result.label}: ${result.message}`).join(" · "));
  }

  return (
    <>
      <Button type="button" variant="secondary" className="h-[34px]" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" />
        Buscar virales
      </Button>

      <Dialog
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title="Buscar virales del nicho"
        description="Trae publicaciones de cualquier cuenta que explotó bajo estos hashtags, sin necesidad de seguirla. Sólo entran las que pasan el piso de su fuente: puede que no aparezca ninguna."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-lm-ink-2">Hashtags del nicho</label>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="iaparaemprendedores, automatizacion"
              autoFocus
            />
            <p className={validTags || !hashtags.trim() ? "mt-1 text-xs text-lm-ink-2" : "mt-1 text-xs text-lm-danger"}>
              {tags.length > 0 ? `Se busca: ${tags.map((tag) => `#${tag}`).join(", ")}.` : "Separados por coma."} Máximo {MAX_TREND_HASHTAGS}.
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-lm-ink-2">De dónde</span>
            <SourceOption
              checked={useMeta && metaReady}
              disabled={!metaReady}
              onChange={setUseMeta}
              title="API oficial de Instagram (lo más popular)"
            >
              {metaStatus.state === "ready" ? (
                <>
                  Gratis. Trae lo más popular de cada hashtag, medido por likes: entran los de más de {compactNumber.format(TREND_MIN_LIKES)}. No muestra
                  views ni el autor. Quedan {metaStatus.remaining} de {META_HASHTAGS_PER_WEEK} hashtags nuevos esta semana (repetir uno no gasta).
                </>
              ) : metaStatus.state === "wrong-token" ? (
                <>El token cargado es de Instagram Login (empieza con IG…). Para esta fuente hace falta uno de Facebook Login (EAA…): cargalo en Configuración.</>
              ) : (
                <>Conectá tu Instagram en Configuración para usar esta fuente.</>
              )}
            </SourceOption>
            <SourceOption checked={useApify} onChange={setUseApify} title="Apify (reels recientes)">
              Trae reels recientes con views y autor; entran los de más de {compactNumber.format(TREND_MIN_VIEWS)} views. Cobra por resultado.
            </SourceOption>
          </div>

          {useApify ? (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-lm-ink-2">Reels a traer (Apify)</label>
              <Input type="number" min={1} max={MAX_RESULTS_LIMIT} value={limit} onChange={(e) => setLimit(e.target.value)} />
              <p className="mt-1 text-xs text-lm-ink-2">
                {validLimit ? `Esta corrida cuesta unos ${usd.format(estimateRunCostUsd(parsedLimit))} (estimado).` : `Entre 1 y ${MAX_RESULTS_LIMIT}.`}
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-lm-danger">{error}</p> : null}

          <div className="flex items-center justify-end gap-2">
            {busy && useMeta ? <span className="mr-auto text-xs text-lm-ink-2">Instagram puede tardar unos segundos por hashtag.</span> : null}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {error ? "Cerrar" : "Cancelar"}
            </Button>
            <Button type="button" variant="primary" onClick={handleSearch} disabled={busy || !canSearch}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {busy ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
