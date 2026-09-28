import { AlertTriangle, Loader2, Swords } from "lucide-react";

import { CompetitorAvatar } from "@/components/brand/competitors/competitor-avatar";
import { CompetitorPoller } from "@/components/brand/competitors/competitor-poller";
import { CompetitorRowActions } from "@/components/brand/competitors/competitor-row-actions";
import { AddCompetitorButton, RefreshAllButton } from "@/components/brand/competitors/competitor-toolbar";
import { OutlierBoard, type OutlierCardData } from "@/components/brand/competitors/outlier-board";
import { TrendPoller } from "@/components/brand/trends/trend-poller";
import { TrendSearchButton } from "@/components/brand/trends/trend-search-form";
import { Crumbs, Eyebrow } from "@/components/brand/ui/card";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyLine, EmptyState } from "@/components/leads/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import {
  formatBaselines,
  formatCadenceBasis,
  formatCadenceValue,
  formatMix,
  mixSegments,
} from "@/lib/brand/competitors/format";
import {
  computeCadence,
  computeFormatMix,
  GROUP_SIGNAL_LABEL,
  OUTLIER_MAX_AGE_DAYS,
  OUTLIER_THRESHOLD,
  MIN_BASELINE_SAMPLE,
  RELEVANCE_MIN,
  TREND_MIN_VIEWS,
} from "@/lib/brand/competitors/insights";
import {
  getCompetitorsWithInsights,
  getIdeasFromOutliers,
  hasApifyKey,
  hasGeminiKey,
  type CompetitorWithInsights,
} from "@/lib/brand/competitors/queries";
import { estimateRunCostUsd } from "@/lib/brand/competitors/schema";
import { getBrandPostsForAnalysis } from "@/lib/brand/queries";
import {
  getIdeasFromTrendPosts,
  getLastTrendSearch,
  getPendingTrendSearchIds,
  getTrendPostsWithInsights,
} from "@/lib/brand/trends/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Competencia · Awareness AI" };

// Reconciliar pagina un dataset entero dentro de una Server Action de esta página.
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const OUTLIERS_SHOWN = 12;

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit" });

/** La grilla de la tabla: cuenta, cadencia, mezcla, outliers, por corrida, actualizada y acciones. */
const COLUMNS = "grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_80px_110px_150px_120px]";

function StatusCell({ competitor }: { competitor: CompetitorWithInsights["competitor"] }) {
  if (competitor.status === "EN_CURSO") {
    return (
      <span className="inline-flex items-center gap-1.5 text-lm-ink-2">
        <Loader2 className="size-3.5 animate-spin" />
        Trayendo publicaciones…
      </span>
    );
  }
  if (competitor.status === "FALLIDO") {
    return (
      <span className="inline-flex items-start gap-1.5 font-lm-sans text-lm-danger">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span className="max-w-64">{competitor.last_error ?? "La última actualización falló."}</span>
      </span>
    );
  }
  if (!competitor.last_synced_at) return <span className="font-lm-sans text-lm-ink-3">Todavía sin traer</span>;
  return <span>{dateFormat.format(new Date(competitor.last_synced_at))}</span>;
}

/** /marca/competencia (Plans/03 §3.8, ampliado en §3.15): cuentas ajenas, siempre contra su propio rendimiento habitual, más lo que se descubre por hashtag sin haber seguido a nadie. */
export default async function CompetenciaPage() {
  const [competitors, apifyKey, geminiKey, ideas, ownPosts, trend, trendIdeas, lastTrendSearch, pendingTrendSearchIds] = await Promise.all([
    getCompetitorsWithInsights(PLATFORM),
    hasApifyKey(),
    hasGeminiKey(),
    getIdeasFromOutliers(),
    getBrandPostsForAnalysis(PLATFORM),
    getTrendPostsWithInsights(),
    getIdeasFromTrendPosts(),
    getLastTrendSearch(),
    getPendingTrendSearchIds(),
  ]);

  const usernameById = new Map(competitors.map(({ competitor }) => [competitor.id, competitor.username]));
  const pendingIds = competitors.filter(({ competitor }) => competitor.status === "EN_CURSO").map(({ competitor }) => competitor.id);
  const totalResultsLimit = competitors.reduce((sum, { competitor }) => sum + competitor.results_limit, 0);

  // La última corrida terminada: fecha y costo, para el header bar.
  const lastRun = competitors
    .map(({ competitor }) => competitor)
    .filter((competitor) => competitor.last_synced_at)
    .sort((a, b) => (b.last_synced_at as string).localeCompare(a.last_synced_at as string))[0];
  const lastRunMeta = lastRun
    ? `Última corrida ${shortDate.format(new Date(lastRun.last_synced_at as string))}${
        lastRun.last_cost_usd !== null ? ` · US$ ${usd.format(lastRun.last_cost_usd).replace(/^US\$\s?/, "")}` : ""
      }`
    : undefined;

  // Se aplana acá: el tablero es un componente cliente y lo que cruza el límite
  // tiene que ser serializable y no más de lo que la pantalla usa. Dos fuentes,
  // mezcladas en una sola lista (§3.15): cuentas seguidas y lo descubierto por hashtag.
  const competitorOutliers: OutlierCardData[] = competitors.flatMap(({ insights }) => insights.outliers).map((outlier) => {
    const idea = ideas.get(outlier.post.id);
    return {
      postId: outlier.post.id,
      source: "competitor" as const,
      username: usernameById.get(outlier.post.competitorId) ?? "cuenta",
      kind: outlier.post.kind,
      caption: outlier.post.caption,
      thumbnailUrl: outlier.post.thumbnailUrl,
      permalink: outlier.post.permalink,
      publishedAt: outlier.post.publishedAt,
      signalLabel: GROUP_SIGNAL_LABEL[outlier.group],
      value: outlier.value,
      median: outlier.median,
      multiple: outlier.multiple,
      recent: outlier.recent,
      dismissed: outlier.post.dismissedAt !== null,
      relevanceScore: outlier.post.relevanceScore,
      relevanceReason: outlier.post.relevanceReason,
      ideaId: idea?.id ?? null,
      ideaTitle: idea?.title ?? null,
    };
  });

  const trendOutliers: OutlierCardData[] = trend.outliers.map((outlier) => {
    const idea = trendIdeas.get(outlier.post.id);
    return {
      postId: outlier.post.id,
      source: "trend" as const,
      username: outlier.post.username,
      kind: outlier.post.kind,
      caption: outlier.post.caption,
      thumbnailUrl: outlier.post.thumbnailUrl,
      permalink: outlier.post.permalink,
      publishedAt: outlier.post.publishedAt,
      signalLabel: GROUP_SIGNAL_LABEL[outlier.group],
      value: outlier.value,
      median: outlier.median,
      multiple: outlier.multiple,
      recent: outlier.recent,
      dismissed: outlier.post.dismissedAt !== null,
      relevanceScore: outlier.post.relevanceScore,
      relevanceReason: outlier.post.relevanceReason,
      ideaId: idea?.id ?? null,
      ideaTitle: idea?.title ?? null,
    };
  });

  const allOutliers: OutlierCardData[] = [...competitorOutliers, ...trendOutliers].sort((a, b) => b.multiple - a.multiple);

  // Lo que "Clasificar" tiene para hacer: lo mismo que mira el servidor.
  const pendingRelevance = allOutliers.filter(
    (outlier) => outlier.recent && !outlier.dismissed && outlier.relevanceScore === null,
  ).length;

  // Lo propio: sólo cadencia y mezcla, que son lo único comparable con lo público de los demás.
  const ownCadence = computeCadence(ownPosts);
  const ownMix = computeFormatMix(ownPosts);
  const ownCadenceValue = formatCadenceValue(ownCadence);
  const ownSegments = mixSegments(ownMix);

  return (
    <>
      <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Competencia" }]} />} meta={lastRunMeta} />

      <div className="flex flex-col gap-7 px-6 py-7 lg:px-8 lg:pb-10">
        <PageHeading
          title="Competencia"
          description="Cuentas que seguís, medidas contra su propio rendimiento habitual, más lo que se descubre por hashtag sin haber seguido a nadie: lo que importa es qué explotó, no quién tiene más views."
          action={
            apifyKey ? (
              <div className="flex flex-wrap items-center gap-2.5">
                {competitors.length > 0 ? (
                  <RefreshAllButton competitorCount={competitors.length} totalResultsLimit={totalResultsLimit} />
                ) : null}
                <TrendSearchButton lastQuery={lastTrendSearch?.query ?? null} />
                <AddCompetitorButton />
              </div>
            ) : undefined
          }
        />

        {apifyKey && lastTrendSearch?.status === "FALLIDO" ? (
          <p className="-mt-3 text-xs text-lm-danger">
            La última búsqueda de virales (&ldquo;{lastTrendSearch.query}&rdquo;) falló: {lastTrendSearch.lastError ?? "error desconocido"}.
          </p>
        ) : null}
        {apifyKey && lastTrendSearch?.status === "EN_CURSO" ? (
          <p className="-mt-3 flex items-center gap-1.5 text-xs text-lm-ink-2">
            <Loader2 className="size-3 animate-spin" />
            Buscando virales para &ldquo;{lastTrendSearch.query}&rdquo;…
          </p>
        ) : null}

        <CompetitorPoller pendingIds={pendingIds} />
        <TrendPoller pendingIds={pendingTrendSearchIds} />

        {!apifyKey ? (
          <EmptyState
            icon={<Swords className="size-5" />}
            title="Falta la API key de Apify"
            description="Las publicaciones de otras cuentas se traen con Apify, que cobra por resultado. Cargá tu key en Configuración para empezar."
            action={
              <ButtonLink href="/configuracion" variant="primary">
                Ir a Configuración
              </ButtonLink>
            }
          />
        ) : (
          <>
            <div className="rounded-lm-lg border border-lm-line bg-lm-surface px-4 py-3.5 text-[12.5px] leading-[1.6] text-lm-ink-2">
              <span className="font-medium text-lm-ink">Sólo se ve lo público.</span> Likes, comentarios, views y caption sí; alcance, guardados,
              watch time y skip rate no: son privados del dueño de la cuenta. Un outlier es una publicación con {OUTLIER_THRESHOLD}× o más la
              mediana de su propia cuenta, y sólo se marca con al menos {MIN_BASELINE_SAMPLE} publicaciones del mismo tipo para comparar. Se
              listan las de los últimos {OUTLIER_MAX_AGE_DAYS} días; las que el clasificador puntúa por debajo de {RELEVANCE_MIN} para tu nicho
              quedan afuera. Las que salen de &ldquo;Buscar virales&rdquo; se marcan &ldquo;Descubierto&rdquo;: entran sólo con{" "}
              {TREND_MIN_VIEWS.toLocaleString("es-AR")} views o más, sin importar cuántas traiga la búsqueda — puede que ninguna llegue.
            </div>

            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-[3px]">
                <h3 className="font-lm-sans text-[15px] font-medium">Cuentas que seguís</h3>
                <p className="text-[12.5px] text-lm-ink-2">Métricas ajenas: todas públicas. Las tuyas están más abajo, en un bloque aparte.</p>
              </div>
              {competitors.length === 0 ? (
                <EmptyLine>
                  Todavía no seguís ninguna cuenta. Sumá una desde &ldquo;Agregar cuenta&rdquo; arriba para traer sus publicaciones recientes, o
                  probá &ldquo;Buscar virales&rdquo; para encontrar reels sin haber seguido a nadie.
                </EmptyLine>
              ) : (
                <div className="overflow-x-auto border-t border-lm-line">
                  <div className="min-w-[900px]">
                    <div className={cn("grid gap-4 border-b border-lm-line py-2.5", COLUMNS)}>
                      <Eyebrow>Cuenta</Eyebrow>
                      <Eyebrow>Cadencia</Eyebrow>
                      <Eyebrow>Mezcla de formatos</Eyebrow>
                      <Eyebrow className="text-right">Outliers</Eyebrow>
                      <Eyebrow className="text-right">Por corrida</Eyebrow>
                      <Eyebrow>Actualizada</Eyebrow>
                      <span />
                    </div>
                    {competitors.map(({ competitor, insights }) => {
                      const cadenceValue = formatCadenceValue(insights.cadence);
                      const cadenceBasis = formatCadenceBasis(insights.cadence);
                      return (
                        <div
                          key={competitor.id}
                          className={cn(
                            "grid items-start gap-4 border-b border-lm-line py-3.5 text-[12.5px] transition-colors hover:bg-lm-ink/[0.02]",
                            COLUMNS,
                          )}
                        >
                          <div className="flex min-w-0 gap-3">
                            <CompetitorAvatar url={competitor.profile_pic_url} username={competitor.username} />
                            <div className="flex min-w-0 flex-col gap-[3px]">
                              <a
                                href={`https://www.instagram.com/${competitor.username}/`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-[13.5px] font-medium text-lm-ink transition-colors hover:text-lm-signal-text"
                              >
                                @{competitor.username}
                              </a>
                              {competitor.display_name ? <span className="text-lm-ink-2">{competitor.display_name}</span> : null}
                              {insights.total > 0 ? (
                                <span className="font-mono text-[11px] leading-normal text-lm-ink-3">
                                  {insights.total} publicaciones · lo habitual: {formatBaselines(insights)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-col gap-[3px]">
                            {cadenceValue !== null ? (
                              <span className={cn("font-mono tabular-nums", Number(insights.cadence.perWeek) === 0 ? "text-lm-smoke-3" : "text-lm-ink")}>
                                {cadenceValue} <span className="text-lm-ink-3">/ sem</span>
                              </span>
                            ) : (
                              <span className="text-lm-ink-2">Sin datos suficientes</span>
                            )}
                            {cadenceBasis ? <span className="text-[11.5px] text-lm-ink-3">{cadenceBasis}</span> : null}
                          </div>
                          <span className="leading-normal text-lm-smoke-5">{formatMix(insights.mix)}</span>
                          <span className="text-right font-mono tabular-nums">{insights.total > 0 ? insights.outliers.length : "—"}</span>
                          <div className="flex flex-col items-end gap-[3px] font-mono tabular-nums">
                            <span>{competitor.results_limit}</span>
                            <span className="text-[11px] text-lm-ink-3">~{usd.format(estimateRunCostUsd(competitor.results_limit))}</span>
                          </div>
                          <span className="font-mono text-[11.5px] text-lm-ink-2">
                            <StatusCell competitor={competitor} />
                          </span>
                          <div className="flex justify-end">
                            <CompetitorRowActions
                              id={competitor.id}
                              username={competitor.username}
                              resultsLimit={competitor.results_limit}
                              running={competitor.status === "EN_CURSO"}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {allOutliers.length === 0 ? (
              <section className="flex flex-col gap-3">
                <h3 className="font-lm-sans text-[15px] font-medium">Lo que explotó</h3>
                <EmptyLine>
                  Todavía no hay ningún outlier. Puede ser que nada se haya separado de lo habitual, que falten publicaciones —hacen falta al
                  menos {MIN_BASELINE_SAMPLE} del mismo tipo por cuenta para saber qué es lo habitual—, o que todavía no hayas probado
                  &ldquo;Buscar virales&rdquo;.
                </EmptyLine>
              </section>
            ) : (
              <OutlierBoard
                outliers={allOutliers}
                shown={OUTLIERS_SHOWN}
                geminiConfigured={geminiKey}
                pendingRelevance={pendingRelevance}
              />
            )}

            <section className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-[3px]">
                <h3 className="font-lm-sans text-[15px] font-medium">Tu cuenta, para comparar</h3>
                <p className="text-[12.5px] text-lm-ink-2">
                  Sólo la cadencia y la mezcla: lo único comparable con lo que se ve de los demás.
                </p>
              </div>
              {ownPosts.length === 0 ? (
                <EmptyLine>Todavía no hay publicaciones tuyas sincronizadas.</EmptyLine>
              ) : (
                <div className="grid grid-cols-1 border-y border-lm-line sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 py-4 sm:pr-5">
                    <Eyebrow>Cadencia</Eyebrow>
                    <span className="font-mono text-[22px] leading-none tabular-nums">
                      {ownCadenceValue ?? <span className="font-lm-sans text-[13px] text-lm-ink-2">Sin datos suficientes</span>}
                      {ownCadenceValue ? <span className="ml-1 text-[13px] text-lm-ink-3">/ sem</span> : null}
                    </span>
                    {formatCadenceBasis(ownCadence) ? (
                      <span className="text-[11.5px] text-lm-ink-3">{formatCadenceBasis(ownCadence)}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1.5 border-t border-lm-line py-4 sm:border-t-0 sm:border-l sm:px-5">
                    <Eyebrow>Mezcla de formatos</Eyebrow>
                    <span className="text-[15px]">{formatMix(ownMix)}</span>
                    {ownSegments.length > 0 ? (
                      <div className="flex h-1 gap-0.5 overflow-hidden rounded-lm-xs">
                        {ownSegments.map((segment, index) => (
                          <span
                            key={segment.kind}
                            className={index === 0 ? "bg-lm-smoke-4" : "bg-lm-smoke-2"}
                            style={{ width: `${segment.percent}%` }}
                            title={`${segment.label} ${Math.round(segment.percent)}%`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
