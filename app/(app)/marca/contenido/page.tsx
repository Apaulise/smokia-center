import { ContentFilters } from "@/components/brand/content/content-filters";
import { ContentLibraryGrid } from "@/components/brand/content/content-library-grid";
import { Crumbs } from "@/components/brand/ui/card";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { formatObjectiveValue } from "@/lib/brand/insights";
import { classifyPosts, computeCurrentBaselines } from "@/lib/brand/insights/baseline";
import { getBrandContentLibrary, getBrandPostsForAnalysis, type ContentSortField } from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Biblioteca de contenido · SmokIA" };

const PLATFORM = "INSTAGRAM" as const;
const SORT_FIELDS: ContentSortField[] = [
  "published_at",
  "views",
  "reel_avg_watch_time_ms",
  "reel_skip_rate",
  "saved",
  "shares",
  "new_followers",
];
const KIND_VALUES: Database["public"]["Enums"]["brand_post_kind"][] = [
  "REEL",
  "POST",
  "CARRUSEL",
  "HISTORIA",
  "VIDEO",
  "SHORT",
];

const KIND_PLURAL: Record<Database["public"]["Enums"]["brand_post_kind"], [string, string]> = {
  REEL: ["reel", "reels"],
  POST: ["post", "posts"],
  CARRUSEL: ["carrusel", "carruseles"],
  HISTORIA: ["historia", "historias"],
  VIDEO: ["video", "videos"],
  SHORT: ["short", "shorts"],
};

type SearchParams = { kind?: string; sort?: string; dir?: string; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ContenidoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const sort = SORT_FIELDS.includes(resolved.sort as ContentSortField) ? (resolved.sort as ContentSortField) : "published_at";
  const ascending = resolved.dir === "asc";
  const kind = KIND_VALUES.includes(resolved.kind as (typeof KIND_VALUES)[number])
    ? (resolved.kind as (typeof KIND_VALUES)[number])
    : undefined;
  const dateFrom = resolved.from && DATE_RE.test(resolved.from) ? resolved.from : undefined;
  const dateTo = resolved.to && DATE_RE.test(resolved.to) ? resolved.to : undefined;

  const [library, catalog] = await Promise.all([
    getBrandContentLibrary(PLATFORM, { sort, ascending, kind, dateFrom, dateTo }),
    getBrandPostsForAnalysis(PLATFORM),
  ]);

  // La clasificación (§3.11) se calcula sobre el catálogo completo y no sobre lo filtrado:
  // el baseline de un reel son los reels anteriores, se vean o no en la grilla.
  const now = new Date();
  const results = classifyPosts(catalog, now);
  const reelMedian = computeCurrentBaselines(catalog, now).find((baseline) => baseline.kind === "REEL")?.reach?.median;

  const countsByKind = new Map<string, number>();
  for (const post of catalog) countsByKind.set(post.kind, (countsByKind.get(post.kind) ?? 0) + 1);
  const meta = [
    `${catalog.length} ${catalog.length === 1 ? "pieza" : "piezas"}`,
    ...KIND_VALUES.filter((k) => countsByKind.has(k)).map((k) => {
      const count = countsByKind.get(k) ?? 0;
      return `${count} ${KIND_PLURAL[k][count === 1 ? 0 : 1]}`;
    }),
  ].join(" · ");

  return (
    <>
      <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Biblioteca" }]} />} meta={meta} />
      <div className="flex flex-col gap-6 px-6 py-7 lg:px-8 lg:pb-10">
        <PageHeading title="Biblioteca de contenido" description="Todo lo publicado, con sus métricas." />
        <ContentFilters
          basePath="/marca/contenido"
          current={{ kind, sort, dir: ascending ? "asc" : "desc", from: dateFrom, to: dateTo }}
          median={reelMedian !== undefined ? formatObjectiveValue("ALCANCE", reelMedian) : null}
        />
        <ContentLibraryGrid posts={library} results={results} sort={sort} />
      </div>
    </>
  );
}
