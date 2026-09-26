"use client";

import { ExternalLink, Loader2, Sparkles, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PostThumb } from "@/components/brand/post-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { classifyPendingTrendOutliers, createIdeaFromTrendPost, dismissTrendPost, restoreTrendPost } from "@/lib/brand/trends/actions";

const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Lo que la pantalla necesita de un outlier, ya aplanado por el Server Component. */
export interface OutlierCardData {
  postId: string;
  /** De una cuenta seguida (§3.8) o descubierto por hashtag, sin haberla seguido (§3.15). */
  source: "competitor" | "trend";
  username: string;
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
  const meta = (
    <>
      <PostThumb url={outlier.thumbnailUrl} className="w-20" />
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* El múltiplo va en texto: el color nunca es la única codificación. */}
          <Badge tone="cyan">{formatMultiple(outlier.multiple)} su mediana</Badge>
          {outlier.relevanceScore !== null ? (
            <Badge tone="violet">Relevancia {outlier.relevanceScore}</Badge>
          ) : null}
          {outlier.source === "trend" ? <Badge tone="neutral">Descubierto</Badge> : null}
          <span className="text-xs text-muted">@{outlier.username}</span>
        </div>
        <p className="tabular text-sm text-ink">
          {formatCount(outlier.value)} {outlier.signalLabel}
          <span className="text-muted"> · lo habitual: {formatCount(outlier.median)}</span>
        </p>
        {outlier.caption ? <p className="line-clamp-2 text-xs text-muted">{outlier.caption}</p> : null}
        <p className="text-xs text-muted">
          {KIND_LABEL[outlier.kind]}
          {outlier.publishedAt ? ` · ${dateFormat.format(new Date(outlier.publishedAt))}` : ""}
        </p>
        {outlier.relevanceReason ? <p className="text-xs text-muted italic">{outlier.relevanceReason}</p> : null}
      </div>
    </>
  );

  return (
    <article
      className={`group relative rounded-[16px] border border-line bg-elevated/70 p-3 ${outlier.dismissed ? "opacity-50" : ""}`}
    >
      {/* El link envuelve sólo la ficha: un botón adentro de un <a> no es HTML válido. */}
      {outlier.permalink ? (
        <a
          href={outlier.permalink}
          target="_blank"
          rel="noreferrer noopener"
          className="flex gap-3 pr-7 hover:[&_p]:text-ink"
        >
          {meta}
          <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted group-hover:text-cyan" aria-label="Abre Instagram en otra pestaña" />
        </a>
      ) : (
        <div className="flex gap-3 pr-7">{meta}</div>
      )}

      <button
        type="button"
        onClick={outlier.dismissed ? onRestore : onDismiss}
        disabled={busy}
        aria-label={outlier.dismissed ? "Volver a mostrar esta publicación" : "Descartar esta publicación"}
        title={outlier.dismissed ? "Volver a mostrarla" : "Descartarla"}
        className="absolute top-2 right-2 cursor-pointer rounded-[8px] p-1 text-muted hover:bg-surface/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none disabled:opacity-40"
      >
        {outlier.dismissed ? <Undo2 className="size-3.5" /> : <X className="size-3.5" />}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/40 pt-2.5">
        {outlier.ideaId ? (
          <>
            <span className="truncate text-xs text-muted">Idea: {outlier.ideaTitle}</span>
            <Link
              href={PLANNER_HREF}
              className="shrink-0 text-xs text-cyan hover:underline focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none"
            >
              Ver en el planificador
            </Link>
          </>
        ) : (
          <>
            <span className="text-xs text-muted">{busy ? "Escribiendo la pieza…" : "¿Te sirve el mecanismo?"}</span>
            <Button type="button" variant="primary" size="sm" disabled={busy} onClick={onUse}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Usar
            </Button>
          </>
        )}
      </div>
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg text-ink">Lo que explotó</h2>
          <p className="max-w-3xl text-sm text-muted">
            Las publicaciones de los últimos {OUTLIER_MAX_AGE_DAYS} días que más se separaron de lo normal de su propia cuenta. Son candidatas a
            mirar por qué funcionaron — el mecanismo, no el tema. “Usar” escribe una pieza tuya con ese mecanismo y la deja en el planificador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={includeOld} onChange={(e) => setIncludeOld(e.target.checked)} className="accent-[#18D6E8]" />
            Incluir anteriores a {OUTLIER_MAX_AGE_DAYS} días
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="accent-[#18D6E8]" />
            Ver descartadas ({dismissedCount})
          </label>
        </div>
      </div>

      {message ? (
        <p className="rounded-[12px] border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm text-ink">
          {message}{" "}
          <Link href={PLANNER_HREF} className="text-cyan hover:underline">
            Ir al planificador
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {visible.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-elevated/50 p-4 text-sm text-muted">
          {showDismissed
            ? "No descartaste ninguna publicación todavía."
            : `No hay ninguna publicación marcada en los últimos ${OUTLIER_MAX_AGE_DAYS} días. Puede ser que nada se haya separado de lo habitual, o que lo que explotó sea más viejo: probá con “incluir anteriores”.`}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
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
            <Link href="/configuracion" className="text-cyan hover:underline">
              Cargala en Configuración
            </Link>
            .
          </span>
        ) : null}
      </div>
    </section>
  );
}
