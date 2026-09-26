import Link from "next/link";
import { Eye, Heart, MessageCircle } from "lucide-react";

import { ResultBadge } from "@/components/brand/result-badge";
import { Badge } from "@/components/ui/badge";
import type { PostResult } from "@/lib/brand/insights";
import type { Database } from "@/lib/supabase/database.types";

type LibraryPost = Database["public"]["Functions"]["brand_latest_posts"]["Returns"][number];

const KIND_LABEL: Record<LibraryPost["kind"], string> = {
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

/** Biblioteca de contenido (Plans/03 §3.4). Sin resultados de esta combinación de filtros incluido. */
export function ContentLibraryGrid({
  posts,
  results,
}: {
  posts: LibraryPost[];
  /** Clasificación por postId (§3.11), calculada sobre el catálogo completo y no sobre lo filtrado. */
  results: Record<string, PostResult>;
}) {
  if (posts.length === 0) {
    return <p className="text-sm text-muted">Ningún post coincide con estos filtros.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {posts.map((post) => (
        <Link
          key={post.post_id}
          href={`/marca/contenido/${post.post_id}`}
          className="group overflow-hidden rounded-[16px] border border-line bg-surface/60 transition-colors hover:border-cyan/40"
        >
          <div className="relative aspect-9/16 w-full overflow-hidden bg-elevated">
            {post.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram
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
            <ResultBadge result={results[post.post_id]} className="pb-1" />
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
            <div className="grid grid-cols-2 gap-x-2 border-t border-line/60 pt-1.5">
              <span>Guardados</span>
              <span className="tabular text-right text-ink">{formatCompact(post.saved)}</span>
              <span>Compartidos</span>
              <span className="tabular text-right text-ink">{formatCompact(post.shares)}</span>
              {post.reel_skip_rate !== null ? (
                <>
                  <span>Skip rate</span>
                  <span className="tabular text-right text-ink">{post.reel_skip_rate}%</span>
                </>
              ) : null}
              {post.new_followers !== null ? (
                <>
                  <span>Seg. ganados</span>
                  <span className="tabular text-right text-ink">{formatCompact(post.new_followers)}</span>
                </>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
