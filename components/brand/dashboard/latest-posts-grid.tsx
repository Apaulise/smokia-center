import { Eye, Heart, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type LatestPost = Database["public"]["Functions"]["brand_latest_posts"]["Returns"][number];

const KIND_LABEL: Record<LatestPost["kind"], string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

function formatCompact(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
}

/** Grilla visual de las últimas piezas, arriba del fold (Plans/03 §3.3). */
export function LatestPostsGrid({ posts }: { posts: LatestPost[] }) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted">Todavía no hay contenido sincronizado.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {posts.map((post) => (
        <a
          key={post.post_id}
          href={post.permalink ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded-[16px] border border-line bg-surface/60 transition-colors hover:border-cyan/40"
        >
          <div className="relative aspect-9/16 w-full overflow-hidden bg-elevated">
            {post.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram, sin loader de next/image configurado para ese host
              <img
                src={post.thumbnail_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted">
                <Eye className="size-6" />
              </div>
            )}
            <Badge tone="cyan" className="absolute top-2 left-2 backdrop-blur-sm">
              {KIND_LABEL[post.kind]}
            </Badge>
          </div>

          <div className="space-y-1.5 p-3 text-xs text-muted">
            <p className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" />
                Views
              </span>
              <span className="tabular text-ink">{formatCompact(post.views)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5" />
                Likes
              </span>
              <span className="tabular text-ink">{formatCompact(post.likes)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="size-3.5" />
                Comentarios
              </span>
              <span className="tabular text-ink">{formatCompact(post.comments)}</span>
            </p>
            {post.kind === "REEL" && post.reel_avg_watch_time_ms !== null ? (
              <p className="flex items-center justify-between border-t border-line/60 pt-1.5">
                <span>Watch time prom.</span>
                <span className="tabular text-ink">{(post.reel_avg_watch_time_ms / 1000).toFixed(1)}s</span>
              </p>
            ) : null}
          </div>
        </a>
      ))}
    </div>
  );
}
