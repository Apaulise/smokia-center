import { ExternalLink, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hookText } from "@/components/brand/analysis/retention-list";
import { ResultDetail } from "@/components/brand/content/result-detail";
import { BrandLineChart, type LineChartPoint, type LineChartSeries } from "@/components/brand/dashboard/line-chart";
import { FollowerGainCard } from "@/components/brand/goals/follower-gain-card";
import { Markdown } from "@/components/brand/markdown";
import { PostThumb } from "@/components/brand/post-thumb";
import { Card, CardBody, CardHeader, Crumbs, Eyebrow, Tag } from "@/components/brand/ui/card";
import { HeaderBar } from "@/components/leads/ui/page-header";
import { extractHashtags } from "@/lib/brand/insights";
import { getKnowledgeForPost } from "@/lib/brand/knowledge/queries";
import { COLLECTION_LABEL, ORIGIN_LABEL } from "@/lib/brand/knowledge/schema";
import { attributeFollowers, type AttributionPost } from "@/lib/brand/goals/attribution";
import { getFollowerSnapshots } from "@/lib/brand/goals/queries";
import { classifyPosts } from "@/lib/brand/insights/baseline";
import { getContentItemForPost } from "@/lib/brand/planner/queries";
import { OBJECTIVE_LABEL } from "@/lib/brand/planner/schema";
import {
  getBrandPost,
  getBrandPostComments,
  getBrandPostMetricsHistory,
  getBrandPostsForAnalysis,
} from "@/lib/brand/queries";
import { cn } from "@/lib/utils";

const PLATFORM = "INSTAGRAM" as const;

const KIND_LABEL: Record<string, string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

const EVOLUTION_SERIES: LineChartSeries[] = [
  { key: "views", label: "Views", color: "var(--color-lm-ink)" },
  { key: "reach", label: "Alcance", color: "var(--color-lm-smoke-4)", dashed: true },
];

const numberFormat = new Intl.NumberFormat("es-AR");

function formatCount(value: number | null) {
  return value === null ? null : numberFormat.format(value);
}

/** `captured_on` es un `YYYY-MM-DD` sin hora: se reordena como texto, sin pasar por Date (que lo correría por zona horaria). */
function formatCapturedOn(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBrandPost(id);
  return { title: post ? `${KIND_LABEL[post.kind]} · SmokIA` : "Contenido · SmokIA" };
}

export default async function ContenidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBrandPost(id);
  if (!post) notFound();

  const [metrics, comments, posts, notes, planned, snapshots] = await Promise.all([
    getBrandPostMetricsHistory(id),
    getBrandPostComments(id),
    getBrandPostsForAnalysis(PLATFORM),
    getKnowledgeForPost(id),
    getContentItemForPost(id),
    getFollowerSnapshots(PLATFORM),
  ]);

  // Las dos lecturas salen del mismo catálogo de piezas propias: la clasificación (§3.11) y los
  // seguidores tras publicar (§3.13, estimación). La segunda nunca cambia a la primera.
  const now = new Date();
  const results = classifyPosts(posts, now);
  const attribution = attributeFollowers({
    posts: posts.map(
      (post): AttributionPost => ({
        postId: post.postId,
        kind: post.kind,
        publishedAt: post.publishedAt,
        views: post.views,
        newFollowers: post.newFollowers,
      }),
    ),
    snapshots,
    now,
  });

  const hashtags = extractHashtags(post.caption);
  const captionWithoutTags = post.caption?.replace(/#[\p{L}0-9_]+/gu, "").trim() || null;
  const captionParagraphs = captionWithoutTags ? captionWithoutTags.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];

  const timeline: LineChartPoint[] = metrics.map((m) => ({
    day: m.captured_on,
    views: m.views,
    reach: m.reach,
  }));

  // Los snapshots vienen ordenados por día: el último es el número de hoy.
  const latest = metrics.at(-1) ?? null;
  const metricItems: { label: string; value: string | null }[] = latest
    ? [
        { label: "Views", value: formatCount(latest.views) },
        { label: "Alcance", value: formatCount(latest.reach) },
        { label: "Likes", value: formatCount(latest.likes) },
        { label: "Comentarios", value: formatCount(latest.comments) },
        { label: "Guardados", value: formatCount(latest.saved) },
        { label: "Compartidos", value: formatCount(latest.shares) },
        { label: "Seguidores ganados", value: formatCount(latest.new_followers) },
        // Sólo los reels traen retención: en un post o carrusel estos dos no existen.
        ...(latest.reel_avg_watch_time_ms !== null
          ? [{ label: "Watch time prom.", value: `${(latest.reel_avg_watch_time_ms / 1000).toFixed(1)} s` }]
          : []),
        ...(latest.reel_skip_rate !== null ? [{ label: "Skip rate", value: `${latest.reel_skip_rate.toFixed(1)}%` }] : []),
      ]
    : [];

  const kindLabel = KIND_LABEL[post.kind] ?? post.kind;
  const publishedLabel = post.published_at ? formatDate(post.published_at) : null;
  const title = post.caption ? hookText(post.caption) : kindLabel;
  const hoursSincePublished = post.published_at ? (now.getTime() - new Date(post.published_at).getTime()) / 3_600_000 : null;

  return (
    <>
      <HeaderBar
        breadcrumb={
          <Crumbs
            items={[
              { label: "Biblioteca", href: "/marca/contenido" },
              { label: publishedLabel ? `${kindLabel} · ${publishedLabel}` : kindLabel },
            ]}
          />
        }
        meta={latest ? `Última sincronización ${formatCapturedOn(latest.captured_on)}` : undefined}
      />

      <div className="grid grid-cols-1 items-start gap-8 px-6 py-7 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8 lg:pb-10">
        <aside className="flex flex-col gap-[18px]">
          <PostThumb url={post.thumbnail_url} bare className="aspect-9/16 w-full rounded-lm-lg border border-lm-line" />

          {captionParagraphs.length > 0 ? (
            <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-lm-smoke-5">
              {captionParagraphs.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}

          {hashtags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-[22px] items-center rounded-lm-sm bg-lm-raised px-2 font-mono text-[11.5px] text-lm-ink-2"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {post.permalink ? (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[12.5px] text-lm-ink-2 transition-colors hover:text-lm-signal-text"
            >
              Ver en Instagram
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Eyebrow>
                {kindLabel.toUpperCase()}
                {publishedLabel ? ` · PUBLICADO ${publishedLabel}` : ""}
              </Eyebrow>
              <h1 className="font-lm-sans text-[26px] leading-tight font-medium tracking-[-0.02em] text-balance">{title}</h1>
            </div>
            <Link
              href="/marca/contenido"
              className="pb-1 text-xs whitespace-nowrap text-lm-ink-2 transition-colors hover:text-lm-signal-text"
            >
              ← Volver a la biblioteca
            </Link>
          </div>

          <ResultDetail result={results[id]} publishedAt={post.published_at} />

          <Card>
            <CardHeader
              title="Métricas"
              description={
                latest ? (
                  <>
                    Última sincronización: <span className="font-mono">{formatCapturedOn(latest.captured_on)}</span>
                  </>
                ) : undefined
              }
            />
            {latest ? (
              <dl className="grid grid-cols-3">
                {metricItems.map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      "flex flex-col gap-1.5 border-lm-line px-5 py-4",
                      index % 3 !== 0 && "border-l",
                      index < metricItems.length - (metricItems.length % 3 || 3) && "border-b",
                    )}
                  >
                    <Eyebrow>{item.label}</Eyebrow>
                    <dd className="font-mono text-[22px] leading-none tracking-[-0.02em] tabular-nums">
                      {item.value ?? <span className="text-lm-smoke-3">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <CardBody>
                <p className="text-[12.5px] text-lm-ink-2">Todavía no hay métricas sincronizadas para esta pieza.</p>
              </CardBody>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FollowerGainCard
              gain={attribution.gains[id]}
              surprise={attribution.surprises.find((surprise) => surprise.postId === id)}
              currentFollowers={snapshots.at(-1)?.followers ?? null}
              hoursSincePublished={hoursSincePublished}
            />

            <Card>
              <CardHeader title="Evolución desde que se publicó" description="Views y alcance por día sincronizado." />
              <CardBody>
                <BrandLineChart
                  points={timeline}
                  series={EVOLUTION_SERIES}
                  minPointsMessage="Necesitás más días de sincronización para ver la evolución de esta pieza."
                />
              </CardBody>
            </Card>
          </div>

          {planned ? (
            <Card>
              <CardHeader
                title="Hipótesis con la que salió"
                description="Lo que se escribió en el planificador antes de grabar. Se compara contra el resultado de arriba."
              />
              <CardBody className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {planned.objective ? <Tag tone="solid">{OBJECTIVE_LABEL[planned.objective]}</Tag> : null}
                  <Tag>{planned.parent_item_id ? "Variante de un ganador" : "Experimento nuevo"}</Tag>
                </div>
                {planned.hypothesis ? (
                  <p className="text-[13.5px] leading-[1.6] whitespace-pre-wrap text-lm-ink">{planned.hypothesis}</p>
                ) : (
                  <p className="text-[12.5px] text-lm-ink-2">
                    Esta pieza salió sin hipótesis escrita: no hay contra qué comparar el resultado.
                  </p>
                )}
                {planned.hook || planned.angle ? (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {planned.hook ? (
                      <div className="flex flex-col gap-1.5">
                        <Eyebrow>Hook</Eyebrow>
                        <dd className="text-[13px] text-lm-ink">{planned.hook}</dd>
                      </div>
                    ) : null}
                    {planned.angle ? (
                      <div className="flex flex-col gap-1.5">
                        <Eyebrow>Ángulo</Eyebrow>
                        <dd className="text-[13px] text-lm-ink">{planned.angle}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <Link
                  href="/marca/planificador"
                  className="w-fit text-xs text-lm-ink-2 transition-colors hover:text-lm-signal-text"
                >
                  Ver en el planificador →
                </Link>
              </CardBody>
            </Card>
          ) : null}

          {notes.length > 0 ? (
            <Card>
              <CardHeader
                title="Lo que se aprendió de esta pieza"
                description="Notas de la base de conocimiento vinculadas a este contenido."
              />
              <CardBody className="flex flex-col gap-4">
                {notes.map((note) => (
                  <div key={note.id} className="flex flex-col gap-1.5 border-b border-lm-line pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="solid">{COLLECTION_LABEL[note.collection]}</Tag>
                      <Tag>{ORIGIN_LABEL[note.origin]}</Tag>
                    </div>
                    <p className="text-sm font-medium text-lm-ink">{note.title}</p>
                    {note.body ? <Markdown className="text-[13px] text-lm-ink-2">{note.body}</Markdown> : null}
                  </div>
                ))}
                <Link
                  href={`/marca/conocimiento?c=${notes[0].collection}`}
                  className="w-fit text-xs text-lm-ink-2 transition-colors hover:text-lm-signal-text"
                >
                  Ver en la base de conocimiento →
                </Link>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <div className="flex items-baseline gap-2.5 border-b border-lm-line px-5 py-4">
              <h3 className="font-lm-sans text-[15px] leading-5 font-medium">Comentarios</h3>
              {comments.length > 0 ? <span className="font-mono text-[11px] text-lm-ink-3">{comments.length}</span> : null}
            </div>
            {/* Con decenas de comentarios la lista no puede estirar la página: scroll adentro del panel. */}
            <div className="overflow-y-auto px-5" style={{ maxHeight: 420 }}>
              {comments.length === 0 ? (
                <p className="py-4 text-[12.5px] leading-normal text-lm-ink-2">
                  Sin comentarios sincronizados todavía. Si el post tiene comentarios en Instagram y no aparecen acá, puede que la próxima sincronización todavía no los haya traído.
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3.5 border-b border-lm-line py-3 last:border-0">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-lm-raised text-[10.5px] text-lm-ink-2 uppercase">
                      {(comment.username ?? "?").slice(0, 1)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="text-[12.5px]">
                        <span className="font-medium">{comment.username ?? "Usuario de Instagram"}</span>{" "}
                        <span className="font-mono text-[11px] text-lm-ink-3">
                          {comment.commented_at ? formatDate(comment.commented_at) : ""}
                        </span>
                      </span>
                      <span className="text-[13px] text-lm-smoke-5">{comment.body}</span>
                    </div>
                    {comment.like_count !== null ? (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-[5px] font-mono text-[11px]",
                          comment.like_count === 0 ? "text-lm-smoke-3" : "text-lm-ink-2",
                        )}
                      >
                        <Heart className="size-3" />
                        {comment.like_count}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
