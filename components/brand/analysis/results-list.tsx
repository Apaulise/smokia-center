import Link from "next/link";

import { hookText } from "@/components/brand/analysis/retention-list";
import { PostThumb } from "@/components/brand/post-thumb";
import { ResultBadge } from "@/components/brand/result-badge";
import {
  formatObjectiveValue,
  KIND_LABEL,
  MIN_BASELINE_SAMPLE,
  type AnalysisPost,
  type KindBaseline,
  type PostResult,
} from "@/lib/brand/insights";

const VISIBLE_POSTS = 12;

function BaselineLine({ baseline }: { baseline: KindBaseline }) {
  const parts = [
    baseline.reach ? `alcance ${formatObjectiveValue("ALCANCE", baseline.reach.median)}` : null,
    baseline.authority ? `autoridad ${formatObjectiveValue("AUTORIDAD", baseline.authority.median)}` : null,
  ].filter(Boolean);
  const sample = Math.max(baseline.reach?.sample ?? 0, baseline.authority?.sample ?? 0);

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
      <span className="text-ink">{KIND_LABEL[baseline.kind]}</span>
      <span className="tabular text-muted">
        {parts.join(" · ")} <span className="text-xs">({sample} piezas)</span>
      </span>
    </li>
  );
}

/**
 * Resultados contra el baseline propio (Plans/03 §3.11): la mediana vigente
 * por formato, y las piezas más recientes con su clasificación. Cada fila
 * lleva a la ficha, donde están las cuentas completas.
 */
export function ResultsList({
  posts,
  results,
  baselines,
}: {
  posts: AnalysisPost[];
  results: Record<string, PostResult>;
  baselines: KindBaseline[];
}) {
  const recent = [...posts]
    .filter((p) => p.publishedAt !== null)
    .sort((a, b) => (b.publishedAt as string).localeCompare(a.publishedAt as string))
    .slice(0, VISIBLE_POSTS);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Tu baseline hoy</h4>
        {baselines.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay baseline: hacen falta al menos {MIN_BASELINE_SAMPLE} piezas maduras del mismo formato con datos. Hasta entonces no se clasifica nada.
          </p>
        ) : (
          <ul className="space-y-2">
            {baselines.map((baseline) => (
              <BaselineLine key={baseline.kind} baseline={baseline} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Últimas piezas</h4>
        <ol className="space-y-3">
          {recent.map((post) => (
            <li key={post.postId}>
              <Link
                href={`/marca/contenido/${post.postId}`}
                className="flex items-start gap-3 rounded-[12px] transition-colors hover:bg-surface/40"
              >
                <PostThumb url={post.thumbnailUrl} className="w-10" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="line-clamp-2 text-sm text-ink">{hookText(post.caption)}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted">{KIND_LABEL[post.kind]}</span>
                    <ResultBadge result={results[post.postId]} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
