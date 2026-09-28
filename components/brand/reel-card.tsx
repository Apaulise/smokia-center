import { Eye, Heart, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PostThumb } from "@/components/brand/post-thumb";
import { ResultBadge } from "@/components/brand/result-badge";
import { EmptyValue } from "@/components/brand/ui/card";
import type { PostResult } from "@/lib/brand/insights";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type ReelCardPost = Database["public"]["Functions"]["brand_latest_posts"]["Returns"][number];

export const KIND_LABEL: Record<ReelCardPost["kind"], string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

const compact = new Intl.NumberFormat("es-AR", { notation: "compact" });

function formatCompact(value: number | null) {
  return value === null ? null : compact.format(value);
}

function formatShortDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
}

function Metric({ icon, label, value, zeroMuted }: { icon: ReactNode; label: string; value: number | null; zeroMuted?: boolean }) {
  const text = formatCompact(value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-lm-ink-3">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className={cn("font-mono tabular-nums", value === 0 && zeroMuted ? "text-lm-smoke-3" : "text-lm-ink")}>
        {text ?? <EmptyValue />}
      </span>
    </div>
  );
}

/**
 * Card de reel del handoff (Resumen 3:4, Biblioteca 4:5): portada con chip de
 * formato, filas Views/Likes/Comentarios con ícono y valor en Mono, y el watch
 * time abajo. Toda la card lleva a la ficha de la pieza.
 *
 * `variant="library"` suma el chip de estado + múltiplo y la fecha sobre la
 * portada. `extra` es una fila más para la métrica por la que se ordenó, que
 * la card no muestra de otro modo (guardados, compartidos, skip rate…).
 */
export function ReelCard({
  post,
  variant = "summary",
  result,
  extra,
}: {
  post: ReelCardPost;
  variant?: "summary" | "library";
  result?: PostResult;
  extra?: { label: string; value: string } | null;
}) {
  const library = variant === "library";
  const date = library ? formatShortDate(post.published_at) : null;
  const watchTime = post.reel_avg_watch_time_ms !== null ? `${(post.reel_avg_watch_time_ms / 1000).toFixed(1)}s` : null;

  return (
    <Link
      href={`/marca/contenido/${post.post_id}`}
      className="flex flex-col overflow-hidden rounded-lm-lg border border-lm-line bg-lm-surface/50 transition-colors duration-150 hover:border-lm-line-strong"
    >
      <div className="relative">
        <PostThumb url={post.thumbnail_url} bare className={cn("w-full", library ? "aspect-4/5" : "aspect-3/4")} />
        <span className="absolute top-2 left-2 rounded-lm-sm bg-lm-bg/70 px-1.5 py-0.5 text-[10.5px] text-lm-smoke-5">
          {KIND_LABEL[post.kind]}
        </span>
        {date ? (
          <span className="absolute top-2 right-2 rounded-lm-sm bg-lm-bg/70 px-1.5 py-0.5 font-mono text-[10.5px] text-lm-ink-2">
            {date}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "flex flex-col text-xs text-lm-ink-2",
          library ? "gap-[7px] px-3.5 pt-3 pb-3.5" : "gap-1.5 px-3 pt-2.5 pb-3",
        )}
      >
        {library && result ? <ResultBadge result={result} suffix=" la mediana" className="pb-1" /> : null}
        <Metric icon={<Eye className="size-3" />} label="Views" value={post.views} />
        <Metric icon={<Heart className="size-3" />} label="Likes" value={post.likes} />
        <Metric icon={<MessageCircle className="size-3" />} label="Comentarios" value={post.comments} zeroMuted />
        {extra ? (
          <div className="flex items-center gap-1.5">
            <span className="size-3" />
            <span className="flex-1">{extra.label}</span>
            <span className="font-mono text-lm-ink tabular-nums">{extra.value}</span>
          </div>
        ) : null}
        {post.kind === "REEL" ? (
          <div className={cn("flex border-t border-lm-line", library ? "pt-[7px]" : "pt-1.5")}>
            <span className="flex-1">{library ? "Watch time prom." : "Watch time"}</span>
            <span className="font-mono text-lm-ink tabular-nums">{watchTime ?? <EmptyValue />}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
