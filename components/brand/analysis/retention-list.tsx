import Link from "next/link";

import { PostThumb } from "@/components/brand/post-thumb";
import { Meter } from "@/components/brand/ui/card";
import type { AnalysisPost, PatternRow } from "@/lib/brand/insights";

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
 * fila lleva a la ficha de la pieza. `tone="danger"` es el "Para revisar": el
 * único lugar del sistema donde la barra va en rojo.
 */
export function RetentionList({
  rows,
  postsById,
  emptyMessage,
  tone = "neutral",
}: {
  rows: PatternRow[];
  postsById: Map<string, AnalysisPost>;
  emptyMessage: string;
  tone?: "neutral" | "danger";
}) {
  if (rows.length === 0) {
    return <p className="text-[12.5px] leading-normal text-lm-ink-3">{emptyMessage}</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row) => {
        const post = postsById.get(row.postIds[0]);
        // El skip rate es un porcentaje: la barra va contra 100, no contra el máximo de la lista.
        const width = Math.min(Math.max(row.value, 0), 100);

        const content = (
          <>
            <PostThumb url={post?.thumbnailUrl ?? null} className="aspect-auto h-14 w-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <span className="line-clamp-3 text-[13px] leading-[1.4] text-lm-ink">{hookText(post?.caption ?? null)}</span>
              <Meter percent={width} tone={tone} />
              <span className="font-mono text-[11px] text-lm-ink-3">{row.displayValue}</span>
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {post ? (
              <Link
                href={`/marca/contenido/${post.postId}`}
                className="-mx-2 flex gap-3.5 rounded-lm-sm px-2 py-2.5 transition-colors duration-150 hover:bg-lm-raised"
              >
                {content}
              </Link>
            ) : (
              <div className="-mx-2 flex gap-3.5 px-2 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
