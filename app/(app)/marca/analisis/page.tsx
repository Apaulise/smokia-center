import { KeyRound, TrendingUp } from "lucide-react";

import { GenerateAnalysisPanel } from "@/components/brand/analysis/generate-panel";
import { RankedBars } from "@/components/brand/analysis/ranked-bars";
import { RecommendationCard } from "@/components/brand/analysis/recommendation-card";
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
const STATUS_ORDER: Record<RecommendationRow["status"], number> = { NUEVA: 0, APLICADA: 1, DESCARTADA: 2 };

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
  const sortedRecommendations = [...recommendations].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

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
        action={<GenerateAnalysisPanel platform={PLATFORM} />}
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
              <RankedBars rows={bestReels} emptyMessage="Todavía no hay reels con skip rate sincronizado." />
            </div>
            <div>
              <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Para revisar</h4>
              <RankedBars rows={worstReels} emptyMessage="Todavía no hay reels con skip rate sincronizado." />
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg text-ink">Recomendaciones</h2>
          {sortedRecommendations.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-sm text-muted">
                  Todavía no generaste un análisis. Apretá &quot;Generar análisis&quot; para que Claude lea estos patrones y proponga qué
                  repetir, qué cortar y qué probar.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedRecommendations.map((recommendation) => (
                <RecommendationCard key={recommendation.id} recommendation={recommendation} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
