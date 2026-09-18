import Link from "next/link";

import { PostThumb } from "@/components/brand/post-thumb";
import type { AnalysisPost, PatternRow } from "@/lib/brand/insights";

// Misma serie de "resultado" que ranked-bars.tsx (manual §9).
const BAR_COLOR = "#18D6E8";
const HOOK_MAX_CHARS = 160;

/**
 * El "hook" de un reel es lo primero que se lee del caption: la primera línea
 * con texto, sin hashtags, cortada en un límite de palabra. No hay
 * transcripción del video, así que es lo más cercano que hay.
 */
export function hookText(caption: string | null): string {
  const firstLine = caption
    ?.split(/\r?\n/)
    .map((line) => line.replace(/#[\p{L}0-9_]+/gu, "").trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "(sin caption)";
  if (firstLine.length <= HOOK_MAX_CHARS) return firstLine;

  const cut = firstLine.slice(0, HOOK_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : HOOK_MAX_CHARS)}…`;
}

/**
 * Retención de reels (Plans/03 §3.5): una fila por reel, con su miniatura y el
 * hook completo en vez de las 60 letras cortadas de `PatternRow.label`. Cada
 * fila lleva a la ficha de la pieza.
 */
export function RetentionList({
  rows,
  postsById,
  emptyMessage,
}: {
  rows: PatternRow[];
  postsById: Map<string, AnalysisPost>;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <ol className="space-y-4">
      {rows.map((row) => {
        const post = postsById.get(row.postIds[0]);
        // El skip rate es un porcentaje: la barra va contra 100, no contra el máximo de la lista.
        const width = Math.min(Math.max(row.value, 0), 100);

        const content = (
          <>
            <PostThumb url={post?.thumbnailUrl ?? null} className="w-10" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="line-clamp-3 text-sm text-ink">{hookText(post?.caption ?? null)}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface/60">
                <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: BAR_COLOR }} />
              </div>
              <p className="tabular text-xs text-muted">{row.displayValue}</p>
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {post ? (
              <Link
                href={`/marca/contenido/${post.postId}`}
                className="flex items-start gap-3 rounded-[12px] transition-colors hover:bg-surface/40"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-start gap-3">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
