import { KeyRound } from "lucide-react";
import Link from "next/link";

import { AudienceBars } from "@/components/brand/dashboard/audience-bars";
import { BrandLineChart, ChartLegend, type LineChartSeries } from "@/components/brand/dashboard/line-chart";
import { GoalCard } from "@/components/brand/goals/goal-card";
import { NextStepsCard } from "@/components/brand/goals/next-steps-card";
import { ReelCard } from "@/components/brand/reel-card";
import { BrandSyncProvider, SyncButton, SyncStatus } from "@/components/brand/sync-panel";
import { Card, CardBody, CardHeader, Crumbs, KpiStrip } from "@/components/brand/ui/card";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
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

export const metadata = { title: "Marca Personal · SmokIA" };
// El botón "Sincronizar ahora" corre lib/brand/sync.ts entero (varias
// llamadas a la API de Instagram) — mismo límite que la ruta de cron (app/api/jobs/sync-marca).
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;
const WINDOW_DAYS = 30;
const LATEST_REELS = 6;

const FOLLOWER_SERIES: LineChartSeries[] = [{ key: "followers_count", label: "Seguidores", color: "var(--color-lm-ink)" }];
const REACH_SERIES: LineChartSeries[] = [
  { key: "reach", label: "Alcance", color: "var(--color-lm-smoke-5)", area: true },
  { key: "total_interactions", label: "Interacciones", color: "var(--color-lm-smoke-4)", dashed: true },
];

function formatCompact(value: number) {
  return new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
}

/** "2026-09-18" → "18/9" */
function shortDay(iso: string) {
  const [, month, day] = iso.split("-").map(Number);
  return `${day}/${month}`;
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
    getBrandLatestPosts(PLATFORM, LATEST_REELS),
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
        <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Resumen" }]} />} />
        <div className="flex flex-col gap-8 px-6 py-7 lg:px-8">
          <PageHeading
            eyebrow="INSTAGRAM"
            title="Marca personal"
            description="Métricas, contenido y publicación sin salir de la app."
          />
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Todavía no hay una cuenta conectada"
            description="Cargá las credenciales de Instagram en el entorno (ver Configuración) y sincronizá para ver tus métricas de Instagram acá."
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

  const followersSub =
    followersDelta !== null && account.oldest_snapshot_on
      ? `${followersDelta >= 0 ? "↑" : "↓"} ${Math.abs(followersDelta)} desde el ${shortDay(account.oldest_snapshot_on)}`
      : "Necesitás más días de historial";

  return (
    <BrandSyncProvider platform={PLATFORM} ownerId={user.id} initialJob={latestJob}>
      <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Resumen" }]} />} meta={<SyncStatus />} />

      <div className="flex flex-col gap-7 px-6 py-7 lg:px-8 lg:pb-10">
        <PageHeading
          eyebrow={account.username ? `INSTAGRAM · @${account.username.toUpperCase()}` : "INSTAGRAM"}
          title={account.display_name ?? account.username ?? "Instagram"}
          action={<SyncButton />}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GoalCard platform={PLATFORM} goal={goal} progress={goalProgress} currentFollowers={currentFollowers} />
          <NextStepsCard steps={nextSteps} />
        </div>

        <KpiStrip
          items={[
            {
              label: "Seguidores",
              value: account.followers_count ?? "—",
              sub: followersSub,
              subTone: followersDelta !== null && followersDelta > 0 ? "up" : "muted",
              accent: true,
            },
            { label: `Alcance (${WINDOW_DAYS}d)`, value: formatCompact(reachTotal), sub: "cuentas únicas" },
            { label: "Views (contenido)", value: formatCompact(viewsTotal), sub: `${posts.length} piezas` },
            {
              label: `Interacciones (${WINDOW_DAYS}d)`,
              value: formatCompact(interactionsTotal),
              sub: "likes, guardados y comentarios",
            },
            { label: "Seguidos", value: account.follows_count ?? "—" },
          ]}
        />

        <section className="flex flex-col gap-3.5">
          <div className="flex items-baseline gap-3">
            <h3 className="flex-1 font-lm-sans text-[15px] font-medium">Últimos reels</h3>
            <Link href="/marca/contenido" className="text-xs text-lm-ink-2 transition-colors hover:text-lm-signal-text">
              Ver toda la biblioteca →
            </Link>
          </div>
          {latestPosts.length === 0 ? (
            <p className="text-[12.5px] text-lm-ink-2">Todavía no hay contenido sincronizado.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {latestPosts.map((post) => (
                <ReelCard key={post.post_id} post={post} />
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Curva de seguidores"
              description={
                account.oldest_snapshot_on
                  ? `Últimos ${WINDOW_DAYS} días. El contador empezó el ${shortDay(account.oldest_snapshot_on)}.`
                  : `Últimos ${WINDOW_DAYS} días.`
              }
            />
            <CardBody className="px-5 pt-5 pb-4">
              <BrandLineChart points={timeline} series={FOLLOWER_SERIES} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alcance e interacciones" description="Por día." action={<ChartLegend series={REACH_SERIES} />} />
            <CardBody className="px-5 pt-5 pb-4">
              <BrandLineChart points={timeline} series={REACH_SERIES} showPeak />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Audiencia" description="Edad, género y top de ciudades." />
          <CardBody className="p-5">
            <AudienceBars rows={audience} />
          </CardBody>
        </Card>
      </div>
    </BrandSyncProvider>
  );
}
