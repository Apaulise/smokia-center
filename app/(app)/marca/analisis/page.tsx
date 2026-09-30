import { ChevronDown, KeyRound, TrendingUp } from "lucide-react";

import { AnalysisNoteCard } from "@/components/brand/analysis/analysis-note";
import { parseEvidence, type EvidencePost } from "@/components/brand/analysis/evidence";
import { GenerateAnalysisPanel } from "@/components/brand/analysis/generate-panel";
import { RankedBars } from "@/components/brand/analysis/ranked-bars";
import { RecommendationCard } from "@/components/brand/analysis/recommendation-card";
import { ResultsList } from "@/components/brand/analysis/results-list";
import { RetentionList } from "@/components/brand/analysis/retention-list";
import { Card, CardBody, CardHeader, Crumbs, Eyebrow } from "@/components/brand/ui/card";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { BASELINE_WINDOW, computeBrandInsights, MIN_POSTS_FOR_ANALYSIS } from "@/lib/brand/insights";
import {
  getBrandAccountSummary,
  getBrandPostsForAnalysis,
  getBrandRecommendations,
  getLatestBrandAnalysisNote,
} from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Análisis · Awareness AI" };
// El botón "Generar análisis" corre Claude Opus 5 con effort alto — puede
// tardar bastante más que un request típico (mismo límite que sync-marca).
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const CRUMBS = <Crumbs items={[{ label: "Marca personal" }, { label: "Análisis" }]} />;

type RecommendationRow = Database["public"]["Tables"]["brand_recommendations"]["Row"];

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const AR_TZ = "America/Argentina/Buenos_Aires";

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric", timeZone: AR_TZ });
}

/** "26/09 · 18:40" */
function formatGeneratedAt(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: AR_TZ });
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: AR_TZ });
  return `${day} · ${time}`;
}

export default async function AnalisisPage() {
  const account = await getBrandAccountSummary(PLATFORM);

  if (!account) {
    return (
      <>
        <HeaderBar breadcrumb={CRUMBS} />
        <div className="flex flex-col gap-8 px-6 py-7 lg:px-8">
          <PageHeading title="Análisis" description="Qué repetir, qué cortar y qué probar." />
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Todavía no hay una cuenta conectada"
            description="Cargá las credenciales de Instagram en el entorno (ver Configuración) y sincronizá para poder analizar tu contenido."
            action={
              <ButtonLink href="/configuracion" variant="primary">
                Ir a Configuración
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  const posts = await getBrandPostsForAnalysis(PLATFORM);
  const insights = computeBrandInsights(posts);

  if (!insights) {
    return (
      <>
        <HeaderBar breadcrumb={CRUMBS} />
        <div className="flex flex-col gap-8 px-6 py-7 lg:px-8">
          <PageHeading title="Análisis" description="Qué repetir, qué cortar y qué probar." />
          <EmptyState
            icon={<TrendingUp className="size-5" />}
            title="Todavía no hay suficiente contenido sincronizado"
            description={`Necesitás al menos ${MIN_POSTS_FOR_ANALYSIS} posts con métricas (hoy hay ${posts.length}) para que un patrón signifique algo. Sincronizá más seguido desde el resumen y volvé.`}
            action={
              <ButtonLink href="/marca" variant="primary">
                Ir al resumen
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  const recommendations = await getBrandRecommendations(PLATFORM);
  const analysisNote = await getLatestBrandAnalysisNote(PLATFORM);
  // Las nuevas son lo que hay que mirar; lo que ya se resolvió (aplicada o
  // descartada) queda aparte, plegado, para que no se mezcle con ellas.
  const newRecommendations = recommendations.filter((r) => r.status === "NUEVA");
  const historyRecommendations = recommendations
    .filter((r) => r.status !== "NUEVA")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const appliedCount = historyRecommendations.filter((r) => r.status === "APLICADA").length;
  const discardedCount = historyRecommendations.length - appliedCount;

  const postsById = new Map(posts.map((post) => [post.postId, post]));

  function evidencePostsFor(recommendation: RecommendationRow): EvidencePost[] {
    return parseEvidence(recommendation.evidence).postIds.flatMap((id) => {
      const post = postsById.get(id);
      return post ? [{ id, kind: post.kind, thumbnailUrl: post.thumbnailUrl, caption: post.caption }] : [];
    });
  }

  const bestReels = insights.retention.rows.filter((r) => r.key.startsWith("mejor-"));
  const worstReels = insights.retention.rows.filter((r) => r.key.startsWith("peor-"));

  return (
    <>
      <HeaderBar breadcrumb={CRUMBS} meta={analysisNote ? `Generado ${formatGeneratedAt(analysisNote.created_at)}` : undefined} />

      <div className="flex flex-col gap-6 px-6 py-7 lg:px-8 lg:pb-10">
        <PageHeading
          title="Análisis"
          description={
            <>
              <span className="font-mono text-lm-ink">{insights.totalPosts}</span> posts analizados
              {insights.periodFrom && insights.periodTo ? (
                <>
                  {" "}
                  · <span className="font-mono">{formatDay(insights.periodFrom)} a {formatDay(insights.periodTo)}</span>
                </>
              ) : null}
            </>
          }
          action={<GenerateAnalysisPanel platform={PLATFORM} pendingCount={newRecommendations.length} />}
        />

        {analysisNote ? <AnalysisNoteCard note={analysisNote} /> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Día y horario" description="Tasa de interacción sobre alcance." />
            <CardBody className="pb-5">
              <RankedBars
                rows={insights.bestTimes}
                emptyMessage="Todavía no hay suficientes posts en el mismo horario para detectar un patrón."
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Formato vs. guardados" description="Guardados sobre alcance, promedio por tipo de pieza." />
            <CardBody className="pb-5">
              <RankedBars rows={insights.formatPerformance} emptyMessage="Todavía no hay guardados suficientes para comparar formatos." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Largo del caption" description="Tasa de interacción por longitud de texto." />
            <CardBody className="pb-5">
              <RankedBars rows={insights.captionLength} emptyMessage="Todavía no hay suficientes posts para comparar largos de caption." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Hashtags que aparecen en lo que funcionó" description="Frecuencia en el tercio superior por interacción." />
            <CardBody className="pb-5">
              <RankedBars rows={insights.topHashtags} emptyMessage="Todavía no hay hashtags repetidos en el contenido que mejor funcionó." />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Retención en reels"
            description={
              <>
                Skip rate, más bajo es mejor. Promedio de la cuenta:{" "}
                <span className="font-mono text-lm-ink">
                  {insights.retention.avgSkipRate !== null ? `${insights.retention.avgSkipRate.toFixed(1)}%` : "sin datos"}
                </span>
                {insights.retention.avgWatchTimeMs !== null ? (
                  <>
                    {" "}
                    · watch time promedio:{" "}
                    <span className="font-mono text-lm-ink">{Math.round(insights.retention.avgWatchTimeMs / 1000)}s</span>
                  </>
                ) : null}
              </>
            }
          />
          <div className="grid grid-cols-1 divide-lm-line sm:grid-cols-2 sm:divide-x">
            <div className="flex flex-col gap-1 px-5 py-[18px]">
              <Eyebrow className="pb-1.5">Mejores hooks</Eyebrow>
              <RetentionList
                rows={bestReels}
                postsById={postsById}
                emptyMessage="Todavía no hay reels con skip rate sincronizado."
              />
            </div>
            <div className="flex flex-col gap-1 px-5 py-[18px]">
              <Eyebrow className="pb-1.5">Para revisar</Eyebrow>
              <RetentionList
                rows={worstReels}
                postsById={postsById}
                emptyMessage="Todavía no hay reels con skip rate sincronizado."
                tone="danger"
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Resultados contra tu baseline"
            description={`Cada pieza contra la mediana de tus últimas ${BASELINE_WINDOW} del mismo formato, no contra otros creadores ni contra números absolutos.`}
          />
          <CardBody>
            <ResultsList posts={posts} results={insights.results} baselines={insights.baselines} />
          </CardBody>
        </Card>

        <section className="flex flex-col gap-3">
          <h3 className="font-lm-sans text-[15px] font-medium">Recomendaciones</h3>

          {newRecommendations.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] leading-normal text-lm-ink-2">
                  {recommendations.length === 0
                    ? "Todavía no generaste un análisis. Apretá “Generar análisis” para que Claude lea estos patrones y proponga qué repetir, qué cortar y qué probar."
                    : "No hay recomendaciones nuevas. Apretá “Generar análisis” para obtener unas actualizadas; las que ya resolviste están en el historial."}
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {newRecommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  evidencePosts={evidencePostsFor(recommendation)}
                />
              ))}
            </div>
          )}

          {historyRecommendations.length > 0 ? (
            <details className="group rounded-lm-lg border border-lm-line bg-lm-surface/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[13px] text-lm-ink [&::-webkit-details-marker]:hidden">
                <span>
                  Historial
                  <span className="text-lm-ink-3">
                    {" · "}
                    {[
                      appliedCount > 0 ? countLabel(appliedCount, "aplicada", "aplicadas") : null,
                      discardedCount > 0 ? countLabel(discardedCount, "descartada", "descartadas") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronDown className="size-4 text-lm-ink-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-4 border-t border-lm-line p-4">
                {historyRecommendations.map((recommendation) => (
                  <RecommendationCard
                    key={recommendation.id}
                    recommendation={recommendation}
                    evidencePosts={evidencePostsFor(recommendation)}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </>
  );
}
