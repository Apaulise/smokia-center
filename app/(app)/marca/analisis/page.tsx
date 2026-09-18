import { ChevronDown, KeyRound, TrendingUp } from "lucide-react";

import { parseEvidence, type EvidencePost } from "@/components/brand/analysis/evidence";
import { GenerateAnalysisPanel } from "@/components/brand/analysis/generate-panel";
import { RankedBars } from "@/components/brand/analysis/ranked-bars";
import { RecommendationCard } from "@/components/brand/analysis/recommendation-card";
import { RetentionList } from "@/components/brand/analysis/retention-list";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { computeBrandInsights, MIN_POSTS_FOR_ANALYSIS } from "@/lib/brand/insights";
import { getBrandAccountSummary, getBrandPostsForAnalysis, getBrandRecommendations } from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Análisis · Awareness AI" };
// El botón "Generar análisis" corre Claude Opus 5 con effort alto — puede
// tardar bastante más que un request típico (mismo límite que sync-marca).
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;

type RecommendationRow = Database["public"]["Tables"]["brand_recommendations"]["Row"];

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default async function AnalisisPage() {
  const account = await getBrandAccountSummary(PLATFORM);

  if (!account) {
    return (
      <>
        <PageHeader eyebrow="Gestor de Marca Personal" title="Análisis" description="Qué repetir, qué cortar y qué probar." />
        <div className="px-6 lg:px-10">
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Todavía no hay una cuenta conectada"
            description="Cargá tu API key de Windsor.ai en Configuración y sincronizá para poder analizar tu contenido."
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
        <PageHeader eyebrow="Gestor de Marca Personal" title="Análisis" description="Qué repetir, qué cortar y qué probar." />
        <div className="px-6 lg:px-10">
          <EmptyState
            icon={<TrendingUp className="size-5" />}
            title="Todavía no hay suficiente contenido sincronizado"
            description={`Necesitás al menos ${MIN_POSTS_FOR_ANALYSIS} posts con métricas (hoy hay ${posts.length}) para que un patrón signifique algo. Sincronizá más seguido desde el dashboard y volvé.`}
            action={
              <ButtonLink href="/marca" variant="primary">
                Ir al dashboard
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  const recommendations = await getBrandRecommendations(PLATFORM);
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
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Análisis"
        description={`${insights.totalPosts} posts analizados${
          insights.periodFrom && insights.periodTo
            ? ` · ${new Date(insights.periodFrom).toLocaleDateString("es-AR")} a ${new Date(insights.periodTo).toLocaleDateString("es-AR")}`
            : ""
        }`}
        action={<GenerateAnalysisPanel platform={PLATFORM} pendingCount={newRecommendations.length} />}
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Mejor día y horario para publicar" description="Tasa de interacción sobre alcance." />
            <CardBody>
              <RankedBars
                rows={insights.bestTimes}
                emptyMessage="Todavía no hay suficientes posts en el mismo horario para detectar un patrón."
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Formato vs. guardados" description="Guardados sobre alcance, promedio por tipo de pieza." />
            <CardBody>
              <RankedBars rows={insights.formatPerformance} emptyMessage="Todavía no hay guardados suficientes para comparar formatos." />
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Largo del caption" description="Tasa de interacción por longitud de texto." />
            <CardBody>
              <RankedBars rows={insights.captionLength} emptyMessage="Todavía no hay suficientes posts para comparar largos de caption." />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Hashtags que aparecen en lo que funcionó" description="Frecuencia en el tercio superior por interacción." />
            <CardBody>
              <RankedBars rows={insights.topHashtags} emptyMessage="Todavía no hay hashtags repetidos en el contenido que mejor funcionó." />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Retención en reels"
            description={`Skip rate — más bajo es mejor. Promedio de la cuenta: ${
              insights.retention.avgSkipRate !== null ? `${insights.retention.avgSkipRate.toFixed(1)}%` : "sin datos"
            }${
              insights.retention.avgWatchTimeMs !== null
                ? ` · watch time promedio: ${Math.round(insights.retention.avgWatchTimeMs / 1000)}s`
                : ""
            }`}
          />
          <CardBody className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Mejores hooks</h4>
              <RetentionList
                rows={bestReels}
                postsById={postsById}
                emptyMessage="Todavía no hay reels con skip rate sincronizado."
              />
            </div>
            <div>
              <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Para revisar</h4>
              <RetentionList
                rows={worstReels}
                postsById={postsById}
                emptyMessage="Todavía no hay reels con skip rate sincronizado."
              />
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg text-ink">Recomendaciones</h2>

          {newRecommendations.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-muted">
                  {recommendations.length === 0
                    ? "Todavía no generaste un análisis. Apretá “Generar análisis” para que Claude lea estos patrones y proponga qué repetir, qué cortar y qué probar."
                    : "No hay recomendaciones nuevas. Apretá “Generar análisis” para obtener unas actualizadas; las que ya resolviste están en el historial."}
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
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
            <details className="group rounded-[20px] border border-line bg-elevated/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm text-ink [&::-webkit-details-marker]:hidden">
                <span>
                  Historial
                  <span className="text-muted">
                    {" · "}
                    {[
                      appliedCount > 0 ? countLabel(appliedCount, "aplicada", "aplicadas") : null,
                      discardedCount > 0 ? countLabel(discardedCount, "descartada", "descartadas") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-line/60 p-4">
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
        </div>
      </div>
    </>
  );
}
