import { Eye, Heart, KeyRound, TrendingUp, UserPlus, Users } from "lucide-react";

import { AudienceBars } from "@/components/brand/dashboard/audience-bars";
import { GoalCard } from "@/components/brand/goals/goal-card";
import { NextStepsCard } from "@/components/brand/goals/next-steps-card";
import { LatestPostsGrid } from "@/components/brand/dashboard/latest-posts-grid";
import { BrandLineChart } from "@/components/brand/dashboard/line-chart";
import { BrandSyncPanel } from "@/components/brand/sync-panel";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { buildNextSteps, countMatureReels } from "@/lib/brand/goals/next-steps";
import { computeGoalProgress } from "@/lib/brand/goals/progress";
import {
  countCompetitorOutliers,
  countPiecesFromRadar,
  getCurrentGoal,
  getFollowerSnapshots,
  getKnowledgeUsage,
  getLastCompletedSyncAt,
  getPlanningRows,
  toStepItems,
} from "@/lib/brand/goals/queries";
import { classifyPosts, computeCurrentBaselines } from "@/lib/brand/insights/baseline";
import { summarizeWeek } from "@/lib/brand/planner/week";
import {
  getBrandAccountSummary,
  getBrandAudienceSummary,
  getBrandContentViewsTotal,
  getBrandLatestPosts,
  getBrandMetricsTimeline,
  getBrandPostsForAnalysis,
  getLatestBrandSyncJob,
} from "@/lib/brand/queries";
import { todayIso, weekDays } from "@/lib/leads/calendar";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Marca Personal · Awareness AI" };
// El botón "Sincronizar ahora" corre lib/brand/sync.ts entero (varias
// llamadas a Windsor) — mismo límite que la ruta de cron (app/api/jobs/sync-marca).
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const WINDOW_DAYS = 30;

function formatCompact(value: number) {
  return new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
}

export default async function MarcaPage() {
  const user = await requireUser();

  const [
    account,
    timeline,
    audience,
    latestPosts,
    viewsTotal,
    latestJob,
    goal,
    snapshots,
    planningRows,
    posts,
    knowledge,
    competitorOutliers,
    lastSyncAt,
  ] = await Promise.all([
    getBrandAccountSummary(PLATFORM, WINDOW_DAYS),
    getBrandMetricsTimeline(PLATFORM, WINDOW_DAYS),
    getBrandAudienceSummary(PLATFORM),
    getBrandLatestPosts(PLATFORM, 8),
    getBrandContentViewsTotal(PLATFORM),
    getLatestBrandSyncJob(PLATFORM),
    getCurrentGoal(PLATFORM),
    getFollowerSnapshots(PLATFORM),
    getPlanningRows(PLATFORM),
    getBrandPostsForAnalysis(PLATFORM),
    getKnowledgeUsage(),
    countCompetitorOutliers(PLATFORM),
    getLastCompletedSyncAt(PLATFORM),
  ]);

  if (!account) {
    return (
      <>
        <PageHeader
          eyebrow="Gestor de Marca Personal"
          title="Instagram"
          description="Métricas, contenido y publicación sin salir de la app."
        />
        <div className="px-6 lg:px-10">
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Todavía no hay una cuenta conectada"
            description="Cargá tu API key de Windsor.ai en Configuración y sincronizá para ver tus métricas de Instagram acá."
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

  const followersDelta =
    account.followers_at_oldest !== null && account.followers_count !== null
      ? account.followers_count - account.followers_at_oldest
      : null;

  // La meta y los próximos pasos (§3.13). Todo se calcula acá con lógica pura: el modelo no interviene.
  const now = new Date();
  const currentFollowers = snapshots.at(-1)?.followers ?? account.followers_count;
  const goalProgress = goal
    ? computeGoalProgress({
        goal: {
          targetFollowers: goal.target_followers,
          baselineFollowers: goal.baseline_followers,
          baselineDate: goal.baseline_date,
          deadline: goal.deadline,
        },
        snapshots,
        today: todayIso(),
      })
    : null;

  const results = classifyPosts(posts, now);
  const nextSteps = buildNextSteps({
    now,
    goal: goalProgress,
    week: summarizeWeek(planningRows, weekDays(todayIso())),
    hasWinners: Object.values(results).some((result) => result.classification.startsWith("GANADOR")),
    items: toStepItems(planningRows),
    concludedPostIds: knowledge.concludedPostIds,
    reelBaseline: {
      hasBaseline: computeCurrentBaselines(posts, now).some((baseline) => baseline.kind === "REEL" && baseline.reach !== null),
      matureReels: countMatureReels(posts, now),
    },
    competitorOutliers,
    piecesFromRadar: countPiecesFromRadar(planningRows, knowledge.radarIds),
    lastSyncAt,
  });

  const reachTotal = timeline.reduce((sum, p) => sum + (p.reach ?? 0), 0);
  const interactionsTotal = timeline.reduce((sum, p) => sum + (p.total_interactions ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title={account.display_name ?? account.username ?? "Instagram"}
        description={account.username ? `@${account.username}` : undefined}
        action={<BrandSyncPanel platform={PLATFORM} ownerId={user.id} initialJob={latestJob} />}
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GoalCard platform={PLATFORM} goal={goal} progress={goalProgress} currentFollowers={currentFollowers} />
          <NextStepsCard steps={nextSteps} />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile
            label="Seguidores"
            value={account.followers_count ?? "—"}
            accent="cyan"
            icon={<Users className="size-4" />}
            hint={
              followersDelta !== null
                ? `${followersDelta >= 0 ? "+" : ""}${followersDelta} desde el ${account.oldest_snapshot_on}`
                : "Necesitás más días de historial"
            }
          />
          <StatTile
            label={`Alcance (${WINDOW_DAYS}d)`}
            value={formatCompact(reachTotal)}
            accent="violet"
            icon={<TrendingUp className="size-4" />}
          />
          <StatTile
            label="Views (contenido)"
            value={formatCompact(viewsTotal)}
            accent="cyan"
            icon={<Eye className="size-4" />}
          />
          <StatTile
            label={`Interacciones (${WINDOW_DAYS}d)`}
            value={formatCompact(interactionsTotal)}
            accent="violet"
            icon={<Heart className="size-4" />}
          />
          <StatTile
            label="Seguidos"
            value={account.follows_count ?? "—"}
            icon={<UserPlus className="size-4" />}
          />
        </div>

        <Card>
          <CardHeader
            title="Últimos reels"
            description="Lo primero que se mira al abrir la app."
            action={
              <ButtonLink href="/marca/contenido" variant="ghost" size="sm">
                Ver toda la biblioteca
              </ButtonLink>
            }
          />
          <CardBody>
            <LatestPostsGrid posts={latestPosts} />
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Curva de seguidores" description={`Últimos ${WINDOW_DAYS} días.`} />
            <CardBody>
              <BrandLineChart
                points={timeline}
                series={[{ key: "followers_count", label: "Seguidores", color: "#18D6E8" }]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alcance e interacciones" description="Por día." />
            <CardBody>
              <BrandLineChart
                points={timeline}
                series={[
                  { key: "reach", label: "Alcance", color: "#18D6E8" },
                  { key: "total_interactions", label: "Interacciones", color: "#7C3AED" },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Audiencia" description="Edad, género y top de ciudades." />
          <CardBody>
            <AudienceBars rows={audience} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
