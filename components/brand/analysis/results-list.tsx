import Link from "next/link";

import { hookText } from "@/components/brand/analysis/retention-list";
import { PostThumb } from "@/components/brand/post-thumb";
import { ResultChip } from "@/components/brand/result-badge";
import { Eyebrow } from "@/components/brand/ui/card";
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
    <li className="flex items-baseline gap-3 border-b border-lm-line py-2.5">
      <span className="flex-1 text-[13px] text-lm-ink">{KIND_LABEL[baseline.kind]}</span>
      <span className="font-mono text-xs tabular-nums">
        {parts.join(" · ")} <span className="text-lm-ink-3">({sample} piezas)</span>
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
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <Eyebrow>Tu baseline hoy</Eyebrow>
        {baselines.length === 0 ? (
          <p className="text-[12.5px] leading-normal text-lm-ink-3">
            Todavía no hay baseline: hacen falta al menos {MIN_BASELINE_SAMPLE} piezas maduras del mismo formato con datos. Hasta entonces no se clasifica nada.
          </p>
        ) : (
          <ul>
            {baselines.map((baseline) => (
              <BaselineLine key={baseline.kind} baseline={baseline} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <Eyebrow className="pb-1.5">Últimas piezas</Eyebrow>
        <ol>
          {recent.map((post) => {
            const result = results[post.postId];
            return (
              <li key={post.postId}>
                <Link
                  href={`/marca/contenido/${post.postId}`}
                  className="-mx-2 flex items-center gap-3.5 rounded-lm-sm p-2 transition-colors duration-150 hover:bg-lm-raised"
                >
                  <PostThumb url={post.thumbnailUrl} className="aspect-auto h-11 w-8" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-lm-ink">{hookText(post.caption)}</span>
                  <span className="text-[11.5px] text-lm-ink-3">{KIND_LABEL[post.kind]}</span>
                  {result ? <ResultChip classification={result.classification} /> : null}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
