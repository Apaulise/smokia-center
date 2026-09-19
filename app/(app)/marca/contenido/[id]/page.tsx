import { ArrowLeft, ExternalLink, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultDetail } from "@/components/brand/content/result-detail";
import { BrandLineChart, type LineChartPoint } from "@/components/brand/dashboard/line-chart";
import { Markdown } from "@/components/brand/markdown";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { extractHashtags } from "@/lib/brand/insights";
import { getKnowledgeForPost } from "@/lib/brand/knowledge/queries";
import { COLLECTION_LABEL, ORIGIN_LABEL } from "@/lib/brand/knowledge/schema";
import {
  getBrandPost,
  getBrandPostClassifications,
  getBrandPostComments,
  getBrandPostMetricsHistory,
} from "@/lib/brand/queries";

const PLATFORM = "INSTAGRAM" as const;

const KIND_LABEL: Record<string, string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

const numberFormat = new Intl.NumberFormat("es-AR");

function formatCount(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}

/** `captured_on` es un `YYYY-MM-DD` sin hora: se reordena como texto, sin pasar por Date (que lo correría por zona horaria). */
function formatCapturedOn(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBrandPost(id);
  return { title: post ? `${KIND_LABEL[post.kind]} · Awareness AI` : "Contenido · Awareness AI" };
}

export default async function ContenidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBrandPost(id);
  if (!post) notFound();

  const [metrics, comments, results, notes] = await Promise.all([
    getBrandPostMetricsHistory(id),
    getBrandPostComments(id),
    getBrandPostClassifications(PLATFORM),
    getKnowledgeForPost(id),
  ]);

  const hashtags = extractHashtags(post.caption);
  const captionWithoutTags = post.caption?.replace(/#[\p{L}0-9_]+/gu, "").trim() || null;

  const timeline: LineChartPoint[] = metrics.map((m) => ({
    day: m.captured_on,
    views: m.views,
    reach: m.reach,
  }));

  // Los snapshots vienen ordenados por día: el último es el número de hoy.
  const latest = metrics.at(-1) ?? null;
  const metricItems = latest
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

  return (
    <>
      <PageHeader
        eyebrow="Biblioteca de contenido"
        title={KIND_LABEL[post.kind] ?? post.kind}
        description={post.published_at ? new Date(post.published_at).toLocaleDateString("es-AR") : undefined}
        action={
          <ButtonLink href="/marca/contenido" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" />
            Volver a la biblioteca
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-3 lg:px-10">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <div className="relative aspect-9/16 w-full overflow-hidden rounded-t-[20px] bg-elevated">
              {post.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram
                <img src={post.thumbnail_url} alt="" className="size-full object-cover" />
              ) : null}
            </div>
            <CardBody className="space-y-3">
              {captionWithoutTags ? <p className="text-sm text-ink whitespace-pre-wrap">{captionWithoutTags}</p> : null}
              {hashtags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((tag) => (
                    <Badge key={tag} tone="violet">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-cyan hover:underline"
                >
                  Ver en Instagram
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <ResultDetail result={results[id]} />

          {notes.length > 0 ? (
            <Card>
              <CardHeader
                title="Lo que se aprendió de esta pieza"
                description="Notas de la base de conocimiento vinculadas a este contenido."
              />
              <CardBody className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="space-y-1.5 border-b border-line/60 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="violet">{COLLECTION_LABEL[note.collection]}</Badge>
                      <Badge tone={note.origin === "PROPIO" ? "cyan" : note.origin === "HIPOTESIS" ? "violet" : "neutral"}>
                        {ORIGIN_LABEL[note.origin]}
                      </Badge>
                    </div>
                    <p className="text-sm text-ink">{note.title}</p>
                    {note.body ? <Markdown>{note.body}</Markdown> : null}
                  </div>
                ))}
                <Link href={`/marca/conocimiento?c=${notes[0].collection}`} className="inline-block text-sm text-cyan hover:underline">
                  Ver en la base de conocimiento
                </Link>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Métricas"
              description={latest ? `Última sincronización: ${formatCapturedOn(latest.captured_on)}` : undefined}
            />
            <CardBody>
              {latest ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                  {metricItems.map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{item.label}</dt>
                      <dd className="tabular mt-1 text-2xl text-ink">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted">Todavía no hay métricas sincronizadas para esta pieza.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Evolución desde que se publicó" description="Views y alcance por día sincronizado." />
            <CardBody>
              <BrandLineChart
                points={timeline}
                series={[
                  { key: "views", label: "Views", color: "#18D6E8" },
                  { key: "reach", label: "Alcance", color: "#7C3AED" },
                ]}
                minPointsMessage="Necesitás más días de sincronización para ver la evolución de esta pieza."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Comentarios"
              description={
                comments.length > 0
                  ? undefined
                  : "Si el post tiene comentarios en Instagram y no aparecen acá, puede que la próxima sincronización todavía no los haya traído."
              }
            />
            <CardBody className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-muted">Sin comentarios sincronizados todavía.</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex items-start justify-between gap-4 border-b border-line/60 pb-3 last:border-0">
                    <div>
                      <p className="text-sm text-ink">
                        <span className="font-medium">{comment.username ?? "Usuario de Instagram"}</span>{" "}
                        <span className="text-muted">
                          {comment.commented_at ? new Date(comment.commented_at).toLocaleDateString("es-AR") : ""}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted">{comment.body}</p>
                    </div>
                    {comment.like_count !== null ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                        <Heart className="size-3.5" />
                        {comment.like_count}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
