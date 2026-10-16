"use client";

import { ExternalLink, Loader2, Sparkles, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PostThumb } from "@/components/brand/post-thumb";
import { Tag } from "@/components/brand/ui/card";
import { Button } from "@/components/leads/ui/button";
import {
  classifyPendingOutliers,
  createIdeaFromOutlier,
  dismissCompetitorPost,
  restoreCompetitorPost,
} from "@/lib/brand/competitors/actions";
import { OUTLIER_MAX_AGE_DAYS, RELEVANCE_MIN } from "@/lib/brand/competitors/insights";
import { formatCount } from "@/lib/brand/competitors/format";
import { formatMultiple } from "@/lib/brand/insights";
import { KIND_LABEL, type ContentKind } from "@/lib/brand/planner/schema";
import { cn } from "@/lib/utils";
import { classifyPendingTrendOutliers, createIdeaFromTrendPost, dismissTrendPost, restoreTrendPost } from "@/lib/brand/trends/actions";

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Lo que la pantalla necesita de un outlier, ya aplanado por el Server Component. */
export interface OutlierCardData {
  postId: string;
  /** De una cuenta seguida (§3.8) o descubierto por hashtag, sin haberla seguido (§3.15). */
  source: "competitor" | "trend";
  /** De dónde salió un descubierto (§3.17): Meta no da el autor; Apify, sí. null en cuentas seguidas. */
  trendSource: "APIFY" | "META" | null;
  /** null en lo descubierto por la API de Meta. */
  username: string | null;
  kind: ContentKind;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  signalLabel: string;
  value: number;
  median: number;
  multiple: number;
  recent: boolean;
  dismissed: boolean;
  relevanceScore: number | null;
  relevanceReason: string | null;
  /** La pieza ya creada desde este outlier, si existe. */
  ideaId: string | null;
  ideaTitle: string | null;
}

const PLANNER_HREF = "/marca/planificador";

function OutlierCard({
  outlier,
  busy,
  onUse,
  onDismiss,
  onRestore,
}: {
  outlier: OutlierCardData;
  busy: boolean;
  onUse: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lm-lg border border-lm-line bg-lm-surface/50",
        outlier.dismissed && "opacity-50",
      )}
    >
      <div className="relative">
        <PostThumb url={outlier.thumbnailUrl} bare className="aspect-4/5 w-full rounded-t-lm-lg" />
        <span className="absolute top-2 left-2 rounded-lm-sm bg-lm-bg/70 px-1.5 py-0.5 text-[10.5px] text-lm-smoke-5">
          {KIND_LABEL[outlier.kind]}
        </span>
        {outlier.publishedAt ? (
          <span className="absolute top-2 right-2 rounded-lm-sm bg-lm-bg/70 px-1.5 py-0.5 font-mono text-[10.5px] text-lm-ink-2">
            {dateFormat.format(new Date(outlier.publishedAt))}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-[7px] p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* El múltiplo va en texto: el color nunca es la única codificación. */}
          <span className="font-mono text-[15px] font-medium tracking-[-0.01em] tabular-nums">{formatMultiple(outlier.multiple)}</span>
          <span className="text-[11.5px] text-lm-ink-3">su mediana</span>
          <span className="flex-1" />
          {outlier.permalink ? (
            <a
              href={outlier.permalink}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Abrir en Instagram (otra pestaña)"
              title="Abrir en Instagram"
              className="grid size-6 place-items-center rounded-lm-sm text-lm-ink-3 transition-colors hover:bg-lm-ink/5 hover:text-lm-ink"
            >
              <ExternalLink className="size-[13px]" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={outlier.dismissed ? onRestore : onDismiss}
            disabled={busy}
            aria-label={outlier.dismissed ? "Volver a mostrar esta publicación" : "Descartar esta publicación"}
            title={outlier.dismissed ? "Volver a mostrarla" : "Descartarla"}
            className="grid size-6 cursor-pointer place-items-center rounded-lm-sm text-lm-ink-3 transition-colors hover:bg-lm-ink/5 hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45"
          >
            {outlier.dismissed ? <Undo2 className="size-[13px]" /> : <X className="size-[13px]" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {outlier.relevanceScore !== null ? (
            <Tag>
              Relevancia <span className="ml-1 font-mono">{outlier.relevanceScore}</span>
            </Tag>
          ) : null}
          {outlier.source === "trend" ? <Tag tone="solid">{outlier.trendSource === "META" ? "Descubierto · Meta" : "Descubierto"}</Tag> : null}
          {outlier.username ? <span className="text-xs text-lm-ink-2">@{outlier.username}</span> : null}
        </div>

        <span className="font-mono text-xs text-lm-ink tabular-nums">
          {formatCount(outlier.value)} {outlier.signalLabel} <span className="text-lm-ink-3">· lo habitual {formatCount(outlier.median)}</span>
        </span>
        {outlier.caption ? <span className="line-clamp-2 text-[12.5px] leading-[1.45] text-lm-smoke-5">{outlier.caption}</span> : null}
        {outlier.relevanceReason ? (
          <span className="border-l border-lm-line-strong pl-2.5 text-[12.5px] leading-normal text-lm-ink">{outlier.relevanceReason}</span>
        ) : null}
      </div>

      {outlier.ideaId ? (
        <div className="flex min-h-[50px] items-center gap-2.5 border-t border-lm-line px-3.5 py-2.5">
          <span className="min-w-0 flex-1 truncate text-xs text-lm-ink-2">Idea: {outlier.ideaTitle}</span>
          <Link href={PLANNER_HREF} className="text-xs whitespace-nowrap text-lm-ink-2 transition-colors hover:text-lm-signal-text">
            Ver en el planificador →
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 border-t border-lm-line px-3.5 py-2.5">
          <span className="flex-1 text-xs text-lm-ink-3">{busy ? "Escribiendo la pieza…" : "¿Te sirve el mecanismo?"}</span>
          <Button type="button" variant="secondary" size="sm" className="h-[30px]" disabled={busy} onClick={onUse}>
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Usar
          </Button>
        </div>
      )}
    </article>
  );
}

/**
 * "Lo que explotó" (Plans/03 §3.8, hecho accionable en §3.14). Es cliente
 * porque ahora tiene estado: qué se ve, qué se descarta y qué se convierte en
 * una pieza del planificador.
 *
 * Los filtros son de la vista y no de la consulta: los datos ya están acá, y
 * así los toggles no van al servidor.
 */
export function OutlierBoard({
  outliers,
  shown,
  geminiConfigured,
  pendingRelevance,
}: {
  outliers: OutlierCardData[];
  /** Cuántas tarjetas se muestran como máximo. */
  shown: number;
  geminiConfigured: boolean;
  /** Cuántas recientes todavía no pasaron por el clasificador. */
  pendingRelevance: number;
}) {
  const router = useRouter();
  const [includeOld, setIncludeOld] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dismissedCount = outliers.filter((outlier) => outlier.dismissed).length;

  const visible = useMemo(
    () =>
      outliers.filter((outlier) => {
        if (outlier.dismissed !== showDismissed) return false;
        if (!includeOld && !outlier.recent) return false;
        // Sin puntaje no se esconde nada: el filtro sólo saca lo que el
        // clasificador miró y descartó.
        if (outlier.relevanceScore !== null && outlier.relevanceScore < RELEVANCE_MIN) return false;
        return true;
      }),
    [outliers, showDismissed, includeOld],
  );

  async function run(id: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    const result = await action();
    setBusyId(null);
    if (!result.ok) setError(result.message ?? "No se pudo completar la acción.");
    router.refresh();
  }

  async function handleUse(outlier: OutlierCardData) {
    setBusyId(outlier.postId);
    setError(null);
    setMessage(null);
    const result =
      outlier.source === "trend" ? await createIdeaFromTrendPost(outlier.postId) : await createIdeaFromOutlier(outlier.postId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(
      result.reused
        ? `Ya tenías una idea de esa publicación: “${result.title}”.`
        : `Idea creada: “${result.title}”. Está en “Sin fecha” del planificador.`,
    );
    router.refresh();
  }

  async function handleClassify() {
    setClassifying(true);
    setError(null);
    setMessage(null);
    // Las dos fuentes en paralelo: cada una clasifica su propia tabla, y una key sin cargar no bloquea a la otra.
    const [competitorResult, trendResult] = await Promise.all([classifyPendingOutliers(), classifyPendingTrendOutliers()]);
    setClassifying(false);
    if (!competitorResult.ok && !trendResult.ok) {
      setError(competitorResult.message);
      return;
    }
    const classified = (competitorResult.ok ? competitorResult.classified : 0) + (trendResult.ok ? trendResult.classified : 0);
    setMessage(classified === 0 ? "No había nada pendiente de clasificar." : `Se clasificaron ${classified}.`);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className="font-lm-sans text-[15px] font-medium">Lo que explotó</h3>
          <p className="max-w-[720px] text-[12.5px] leading-normal text-lm-ink-2">
            Las publicaciones de los últimos {OUTLIER_MAX_AGE_DAYS} días que más se separaron de lo normal de su propia cuenta. Son candidatas a
            mirar por qué funcionaron — el mecanismo, no el tema. “Usar” escribe una pieza tuya con ese mecanismo y la deja en el planificador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-xs text-lm-ink-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={includeOld} onChange={(e) => setIncludeOld(e.target.checked)} className="size-3.5 accent-[#f2c14e]" />
            Incluir anteriores a {OUTLIER_MAX_AGE_DAYS} días
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="size-3.5 accent-[#f2c14e]" />
            Ver descartadas ({dismissedCount})
          </label>
        </div>
      </div>

      {message ? (
        <p className="rounded-lm-md border border-lm-line-strong bg-lm-raised px-3 py-2 text-[13px] text-lm-ink">
          {message}{" "}
          <Link href={PLANNER_HREF} className="text-lm-signal-text hover:underline">
            Ir al planificador
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-sm text-lm-danger">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="border-y border-dashed border-lm-line-strong py-4 text-[13px] leading-normal text-lm-ink-2">
          {showDismissed
            ? "No descartaste ninguna publicación todavía."
            : `No hay ninguna publicación marcada en los últimos ${OUTLIER_MAX_AGE_DAYS} días. Puede ser que nada se haya separado de lo habitual, o que lo que explotó sea más viejo: probá con “incluir anteriores”.`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.slice(0, shown).map((outlier) => (
            <OutlierCard
              key={outlier.postId}
              outlier={outlier}
              busy={busyId === outlier.postId}
              onUse={() => handleUse(outlier)}
              onDismiss={() =>
                run(outlier.postId, () => (outlier.source === "trend" ? dismissTrendPost(outlier.postId) : dismissCompetitorPost(outlier.postId)))
              }
              onRestore={() =>
                run(outlier.postId, () => (outlier.source === "trend" ? restoreTrendPost(outlier.postId) : restoreCompetitorPost(outlier.postId)))
              }
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-lm-ink-2">
        {visible.length > shown ? <span>Se muestran las {shown} más marcadas de {visible.length}.</span> : null}
        {geminiConfigured && pendingRelevance > 0 ? (
          <>
            <span>{pendingRelevance} sin clasificar.</span>
            <Button type="button" variant="ghost" size="sm" onClick={handleClassify} disabled={classifying}>
              {classifying ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Clasificar
            </Button>
          </>
        ) : null}
        {!geminiConfigured ? (
          <span>
            Sin la key de Google AI Studio no se filtra por nicho.{" "}
            <Link href="/configuracion" className="text-lm-signal-text hover:underline">
              Cargala en Configuración
            </Link>
            .
          </span>
        ) : null}
      </div>
    </section>
  );
}
