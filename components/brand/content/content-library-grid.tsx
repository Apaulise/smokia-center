import { ReelCard, type ReelCardPost } from "@/components/brand/reel-card";
import type { PostResult } from "@/lib/brand/insights";
import type { ContentSortField } from "@/lib/brand/queries";

const compact = new Intl.NumberFormat("es-AR", { notation: "compact" });

/**
 * La card ya muestra views, likes, comentarios y watch time. Si se ordenó por
 * otra métrica (guardados, compartidos, skip rate, seguidores ganados) se suma
 * esa fila, para que el orden se pueda leer en la grilla.
 */
function extraMetric(post: ReelCardPost, sort: ContentSortField): { label: string; value: string } | null {
  switch (sort) {
    case "saved":
      return { label: "Guardados", value: compact.format(post.saved ?? 0) };
    case "shares":
      return { label: "Compartidos", value: compact.format(post.shares ?? 0) };
    case "new_followers":
      return { label: "Seg. ganados", value: compact.format(post.new_followers ?? 0) };
    case "reel_skip_rate":
      return post.reel_skip_rate !== null ? { label: "Skip rate", value: `${post.reel_skip_rate}%` } : null;
    default:
      return null;
  }
}

/** Biblioteca de contenido (Plans/03 §3.4). Sin resultados de esta combinación de filtros incluido. */
export function ContentLibraryGrid({
  posts,
  results,
  sort,
}: {
  posts: ReelCardPost[];
  /** Clasificación por postId (§3.11), calculada sobre el catálogo completo y no sobre lo filtrado. */
  results: Record<string, PostResult>;
  sort: ContentSortField;
}) {
  if (posts.length === 0) {
    return <p className="text-[12.5px] text-lm-ink-2">Ningún post coincide con estos filtros.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {posts.map((post) => (
        <ReelCard key={post.post_id} post={post} variant="library" result={results[post.post_id]} extra={extraMetric(post, sort)} />
      ))}
    </div>
  );
}
