import { AlertTriangle, Loader2, Swords } from "lucide-react";

import { CompetitorAvatar } from "@/components/brand/competitors/competitor-avatar";
import { CompetitorPoller } from "@/components/brand/competitors/competitor-poller";
import { CompetitorRowActions } from "@/components/brand/competitors/competitor-row-actions";
import { AddCompetitorButton, RefreshAllButton } from "@/components/brand/competitors/competitor-toolbar";
import { OutlierBoard, type OutlierCardData } from "@/components/brand/competitors/outlier-board";
import { TrendPoller } from "@/components/brand/trends/trend-poller";
import { TrendSearchButton } from "@/components/brand/trends/trend-search-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatBaselines,
  formatCadence,
  formatCadenceBasis,
  formatMix,
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

export const metadata = { title: "Competencia · Awareness AI" };

// Reconciliar pagina un dataset entero dentro de una Server Action de esta página.
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const OUTLIERS_SHOWN = 12;

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

function StatusCell({ competitor }: { competitor: CompetitorWithInsights["competitor"] }) {
  if (competitor.status === "EN_CURSO") {
    return (
      <span className="inline-flex items-center gap-1.5 text-violet">
        <Loader2 className="size-3.5 animate-spin" />
        Trayendo publicaciones…
      </span>
    );
  }
  if (competitor.status === "FALLIDO") {
    return (
      <span className="inline-flex items-start gap-1.5 text-danger">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span className="max-w-64">{competitor.last_error ?? "La última actualización falló."}</span>
      </span>
    );
  }
  if (!competitor.last_synced_at) return <span className="text-muted">Todavía sin traer</span>;
  return (
    <span className="text-muted">
      {dateFormat.format(new Date(competitor.last_synced_at))}
      {competitor.last_cost_usd !== null ? ` · ${usd.format(competitor.last_cost_usd)}` : ""}
    </span>
  );
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

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Competencia"
        description="Cuentas que seguís, medidas contra su propio rendimiento habitual, más lo que se descubre por hashtag sin haber seguido a nadie: lo que importa es qué explotó, no quién tiene más views."
        action={
          apifyKey ? (
            <div className="flex flex-wrap items-center gap-2">
              {competitors.length > 0 ? (
                <RefreshAllButton competitorCount={competitors.length} totalResultsLimit={totalResultsLimit} />
              ) : null}
              <AddCompetitorButton />
              <TrendSearchButton lastQuery={lastTrendSearch?.query ?? null} />
            </div>
          ) : undefined
        }
      />

      {apifyKey && lastTrendSearch?.status === "FALLIDO" ? (
        <p className="px-6 text-xs text-danger lg:px-10">
          La última búsqueda de virales (&ldquo;{lastTrendSearch.query}&rdquo;) falló: {lastTrendSearch.lastError ?? "error desconocido"}.
        </p>
      ) : null}
      {apifyKey && lastTrendSearch?.status === "EN_CURSO" ? (
        <p className="flex items-center gap-1.5 px-6 text-xs text-violet lg:px-10">
          <Loader2 className="size-3 animate-spin" />
          Buscando virales para &ldquo;{lastTrendSearch.query}&rdquo;…
        </p>
      ) : null}

      <CompetitorPoller pendingIds={pendingIds} />
      <TrendPoller pendingIds={pendingTrendSearchIds} />

      <div className="space-y-6 px-6 py-8 lg:px-10">
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
            <Card>
              <CardBody className="text-sm text-muted">
                <strong className="font-medium text-ink">Sólo se ve lo público.</strong> Likes, comentarios, views y caption sí; alcance, guardados,
                watch time y skip rate no: son privados del dueño de la cuenta y ninguna herramienta los tiene. Un outlier acá es una publicación
                con {OUTLIER_THRESHOLD}× o más la mediana de su propia cuenta, y sólo se marca con al menos {MIN_BASELINE_SAMPLE} publicaciones
                del mismo tipo para comparar. De ésas se listan las de los últimos {OUTLIER_MAX_AGE_DAYS} días, y las que el clasificador puntúa
                por debajo de {RELEVANCE_MIN} para tu nicho quedan afuera: lo que se busca es un mecanismo que puedas usar, no cualquier número grande.
                Algunas tarjetas de abajo salen de &ldquo;Buscar virales&rdquo; — un hashtag del nicho, no una cuenta seguida — y se marcan
                &ldquo;Descubierto&rdquo;: ahí el criterio es distinto, porque no hay cuenta propia contra la cual comparar. Entran sólo con{" "}
                {TREND_MIN_VIEWS.toLocaleString("es-AR")} views o más, sin importar cuántas traiga la búsqueda — puede que ninguna llegue.
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Cuentas que seguís"
                description="Métricas ajenas: todas públicas. Las tuyas están más abajo, en un bloque aparte."
              />
              {competitors.length === 0 ? (
                <CardBody className="text-sm text-muted">
                  Todavía no seguís ninguna cuenta. Sumá una desde &ldquo;Agregar cuenta&rdquo; arriba para traer sus publicaciones recientes, o
                  probá &ldquo;Buscar virales&rdquo; para encontrar reels sin haber seguido a nadie.
                </CardBody>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line/60 text-xs font-medium tracking-wide text-muted uppercase">
                      <th className="px-6 py-3 font-medium">Cuenta</th>
                      <th className="px-3 py-3 font-medium">Cadencia</th>
                      <th className="px-3 py-3 font-medium">Mezcla de formatos</th>
                      <th className="px-3 py-3 text-right font-medium">Outliers</th>
                      <th className="px-3 py-3 text-right font-medium">Por corrida</th>
                      <th className="px-3 py-3 font-medium">Actualizada</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map(({ competitor, insights }) => (
                      <tr key={competitor.id} className="border-b border-line/40 align-top last:border-0">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <CompetitorAvatar url={competitor.profile_pic_url} username={competitor.username} />
                            <div className="min-w-0">
                              <a
                                href={`https://www.instagram.com/${competitor.username}/`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-ink hover:text-cyan"
                              >
                                @{competitor.username}
                              </a>
                              {competitor.display_name ? <p className="text-xs text-muted">{competitor.display_name}</p> : null}
                              {insights.total > 0 ? (
                                <p className="tabular mt-1 text-xs text-muted">
                                  {insights.total} publicaciones · lo habitual: {formatBaselines(insights)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <p className="tabular text-ink">{formatCadence(insights.cadence)}</p>
                          {formatCadenceBasis(insights.cadence) ? (
                            <p className="text-xs text-muted">{formatCadenceBasis(insights.cadence)}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-4 text-muted">{formatMix(insights.mix)}</td>
                        <td className="tabular px-3 py-4 text-right text-ink">{insights.total > 0 ? insights.outliers.length : "—"}</td>
                        <td className="tabular px-3 py-4 text-right text-muted">
                          {competitor.results_limit}
                          <span className="block text-xs">~{usd.format(estimateRunCostUsd(competitor.results_limit))}</span>
                        </td>
                        <td className="px-3 py-4 text-xs">
                          <StatusCell competitor={competitor} />
                        </td>
                        <td className="px-6 py-4">
                          <CompetitorRowActions
                            id={competitor.id}
                            username={competitor.username}
                            resultsLimit={competitor.results_limit}
                            running={competitor.status === "EN_CURSO"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </Card>

            {allOutliers.length === 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg text-ink">Lo que explotó</h2>
                <p className="rounded-[16px] border border-line bg-elevated/50 p-4 text-sm text-muted">
                  Todavía no hay ningún outlier. Puede ser que nada se haya separado de lo habitual, que falten publicaciones —hacen falta al
                  menos {MIN_BASELINE_SAMPLE} del mismo tipo por cuenta para saber qué es lo habitual—, o que todavía no hayas probado
                  &ldquo;Buscar virales&rdquo;.
                </p>
              </section>
            ) : (
              <OutlierBoard
                outliers={allOutliers}
                shown={OUTLIERS_SHOWN}
                geminiConfigured={geminiKey}
                pendingRelevance={pendingRelevance}
              />
            )}

            <Card>
              <CardHeader
                title="Tu cuenta, para comparar"
                description="Métricas propias, en un bloque aparte: sólo la cadencia y la mezcla, que es lo único comparable con lo que se ve de los demás."
              />
              <CardBody>
                {ownPosts.length === 0 ? (
                  <p className="text-sm text-muted">Todavía no hay publicaciones tuyas sincronizadas.</p>
                ) : (
                  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium tracking-wide text-muted uppercase">Cadencia</dt>
                      <dd className="tabular mt-1 text-ink">{formatCadence(ownCadence)}</dd>
                      {formatCadenceBasis(ownCadence) ? <dd className="text-xs text-muted">{formatCadenceBasis(ownCadence)}</dd> : null}
                    </div>
                    <div>
                      <dt className="text-xs font-medium tracking-wide text-muted uppercase">Mezcla de formatos</dt>
                      <dd className="mt-1 text-muted">{formatMix(ownMix)}</dd>
                    </div>
                  </dl>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
